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
export type LinkRecord = { status: number; verdict: LinkVerdict; checkedAt: string };
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

function verdictFor(status: number): LinkVerdict {
  if (status === 404 || status === 410) return "dead";
  if (status === 403 || status === 429 || status === 401) return "blocked";
  if (status >= 200 && status < 400) return "ok";
  return "unknown";
}

async function checkOne(url: string): Promise<LinkRecord> {
  // GET rather than HEAD: several ATS hosts reject HEAD outright.
  const r = await request(url, { timeoutMs: 20000, retries: 1 });
  const status = r.status;
  return { status, verdict: verdictFor(status), checkedAt: new Date().toISOString() };
}

let sweeping = false;

/**
 * Re-check links. Fresh "ok" results are skipped so a sweep is cheap; anything
 * previously dead is re-checked more often in case it was a blip.
 */
export async function sweepLinks(urls: string[], opts: { maxAgeMs?: number } = {}): Promise<number> {
  if (sweeping) return 0;
  sweeping = true;
  try {
    const maxAge = opts.maxAgeMs ?? 6 * 60 * 60 * 1000; // re-check ok links every 6h
    const map = read();
    const now = Date.now();

    const due = urls.filter((u) => {
      const rec = map[u];
      if (!rec) return true;
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
  setTimeout(run, 20_000); // let the first job fetch land first
  setInterval(run, intervalMs);
}
