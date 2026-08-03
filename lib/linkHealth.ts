import fs from "node:fs";
import path from "node:path";
import { request, pool } from "./scraperCore";

/**
 * Link health for the job ledger.
 *
 * Postings get taken down, and some feeds hand out URLs that rot (search
 * redirects especially). Rather than let the ledger quietly fill with dead
 * links, every URL is re-checked on a slow background sweep and its verdict is
 * shown in the UI.
 *
 * The important distinction: 404/410 means the posting is GONE, but 403/429
 * usually means the careers site is blocking a non-browser client — the link is
 * probably fine for a human. Those are recorded as "blocked", never as dead.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "link-health.json");

export type LinkVerdict = "ok" | "dead" | "blocked" | "unknown";
/** Bump when the classifier changes so stale verdicts are re-checked. */
export const VERDICT_VERSION = 2;
export type LinkRecord = { status: number; verdict: LinkVerdict; checkedAt: string; v?: number };
type HealthMap = Record<string, LinkRecord>;

function read(): HealthMap {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) || {};
  } catch {
    return {};
  }
}

function write(map: HealthMap) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, `link-health.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2), "utf8");
  fs.renameSync(tmp, FILE);
}

export function getLinkHealth(): HealthMap {
  return read();
}

/**
 * Soft 404s are the real trap: Google Careers serves a removed posting as
 * HTTP 200 with "Job not found." in the body, so status alone says "ok" for a
 * link that is useless to a human. These phrases are deliberately specific —
 * a bare "not found" appears in unrelated markup on plenty of live pages.
 */
const DEAD_PHRASES = [
  "job not found",
  "this job may have been taken down",
  "no longer available",
  "no longer accepting application",
  "position has been filled",
  "this position is closed",
  "job posting has expired",
  "posting is no longer",
  "this job is no longer",
  "requisition is closed",
  "we couldn't find that job",
  "we could not find that job",
  "job you are looking for",
  "role is no longer open",
];

function bodyLooksDead(body: string | null): boolean {
  if (!body) return false;
  // Only scan a bounded slice: these banners render near the top, and some
  // careers pages ship megabytes of inlined script.
  const hay = body.slice(0, 400_000).toLowerCase();
  return DEAD_PHRASES.some((p) => hay.includes(p));
}

function verdictFor(status: number, body: string | null): LinkVerdict {
  if (status === 404 || status === 410) return "dead";
  if (status >= 200 && status < 400) return bodyLooksDead(body) ? "dead" : "ok";
  // A 403/429 is usually bot protection rather than a removed posting, but we
  // genuinely can't tell — so it's "blocked", and the UI must not imply it's fine.
  if (status === 403 || status === 429 || status === 401) return "blocked";
  return "unknown";
}

async function checkOne(url: string): Promise<LinkRecord> {
  // GET rather than HEAD: several ATS hosts reject HEAD outright, and we need
  // the body to catch soft 404s.
  const r = await request(url, { timeoutMs: 20000, retries: 1 });
  return { status: r.status, verdict: verdictFor(r.status, r.body), checkedAt: new Date().toISOString(), v: VERDICT_VERSION };
}

let sweeping = false;

/**
 * Re-check links. Fresh "ok" results are skipped so a sweep is cheap; anything
 * previously dead is re-checked more often in case it was a blip.
 */
export async function sweepLinks(urls: string[], opts: { maxAgeMs?: number; force?: boolean } = {}): Promise<number> {
  if (sweeping) return 0;
  sweeping = true;
  try {
    const maxAge = opts.maxAgeMs ?? 6 * 60 * 60 * 1000; // re-check ok links every 6h
    const map = read();
    const now = Date.now();

    const due = urls.filter((u) => {
      if (opts.force) return true;
      const rec = map[u];
      if (!rec) return true;
      // Records written before soft-404 detection existed can't be trusted.
      if (rec.v !== VERDICT_VERSION) return true;
      const age = now - Date.parse(rec.checkedAt);
      if (rec.verdict === "dead") return age > 60 * 60 * 1000; // retry hourly
      return age > maxAge;
    });
    if (due.length === 0) return 0;

    const results = await pool(due, 6, async (u) => [u, await checkOne(u)] as const);
    for (const r of results) if (r) map[r[0]] = r[1];
    write(map);
    return due.length;
  } finally {
    sweeping = false;
  }
}

let started = false;
/** Start a slow background sweep; link rot is measured in days, not minutes. */
export function ensureLinkSweeper(getUrls: () => string[], intervalMs = 30 * 60 * 1000) {
  if (started) return;
  started = true;
  const run = () => void sweepLinks(getUrls()).catch(() => {});
  setTimeout(run, 8_000); // let the first job fetch land first
  setInterval(run, intervalMs);
}
