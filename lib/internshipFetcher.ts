import fs from "node:fs";
import path from "node:path";
import { isUndergradRole } from "./internships";
import { BOARD_COUNT, fetchEverything, trackerCount, type DetectedJob, type SourceReport } from "./jobSources";
import { cachedUrlCount } from "./scraperCore";

/**
 * FREE, fast job detection. Jarvis's own server polls every source in
 * lib/jobSources.ts over plain HTTP — no Claude tokens, no drain on the
 * subscription — and writes new roles to data/detected.json. The Claude scraper
 * task then enriches them with fit scores on its own schedule.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const DETECTED_FILE = path.join(DATA_DIR, "detected.json");
const STATE_FILE = path.join(DATA_DIR, "fetcher-state.json");

export type { DetectedJob };

/** Rank sources by how close they are to the employer, best first. */
const SOURCE_RANK: Record<string, number> = {
  greenhouse: 0,
  lever: 0,
  ashby: 0,
  workday: 0,
  amazon: 0,
  tracker: 1,
  indeed: 2,
  reddit: 3,
  hackernews: 4,
};
function better(a: DetectedJob, b: DetectedJob): DetectedJob {
  const ra = SOURCE_RANK[a.source || ""] ?? 9;
  const rb = SOURCE_RANK[b.source || ""] ?? 9;
  if (ra !== rb) return ra < rb ? a : b;
  // same tier — keep whichever actually knows when it was posted
  return a.postedAt ? a : b;
}

/** Same role seen on two sources → one entry. Company+role is stabler than URL. */
function dedupeKey(j: DetectedJob): string {
  return `${j.company.toLowerCase().trim()}::${j.role.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file: string, data: unknown) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, `${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function getDetectedJobs(): DetectedJob[] {
  return readJson<DetectedJob[]>(DETECTED_FILE, []);
}

export type FetcherState = {
  lastRunAt: string | null;
  lastAdded: number;
  report: SourceReport[];
  /** Employer boards watched directly, and total roles scanned last pass. */
  boardCount?: number;
  /** Tracker READMEs watched, including auto-discovered ones. */
  trackerCount?: number;
  scanned?: number;
  ms?: number;
};
export function getFetcherState(): FetcherState {
  return readJson<FetcherState>(STATE_FILE, { lastRunAt: null, lastAdded: 0, report: [], boardCount: BOARD_COUNT });
}

let running = false;
let started = false;

export async function refreshDetected(): Promise<number> {
  if (running) return 0;
  running = true;
  const startedAt = Date.now();
  try {
    const { jobs, report } = await fetchEverything();

    // Collapse duplicates across sources, keeping the closest-to-employer copy.
    const found = new Map<string, DetectedJob>();
    for (const j of jobs) {
      const k = dedupeKey(j);
      const prev = found.get(k);
      found.set(k, prev ? better(prev, j) : j);
    }

    // Re-apply filters to anything stored before a rule existed.
    const existing = getDetectedJobs().filter((j) => isUndergradRole(j.role));
    const pruned = getDetectedJobs().length - existing.length;

    const byKey = new Map(existing.map((j) => [dedupeKey(j), j]));
    let added = 0;
    let enriched = 0;
    for (const [k, j] of found) {
      const prev = byKey.get(k);
      if (!prev) {
        byKey.set(k, { ...j, firstSeen: nowIso() });
        added++;
      } else if (!prev.postedAt && j.postedAt) {
        // A better source now knows the real publish time — backfill it.
        byKey.set(k, { ...prev, postedAt: j.postedAt, source: j.source || prev.source });
        enriched++;
      }
    }

    if (added > 0 || pruned > 0 || enriched > 0) writeJsonAtomic(DETECTED_FILE, [...byKey.values()]);
    writeJsonAtomic(STATE_FILE, {
      lastRunAt: nowIso(),
      lastAdded: added,
      report,
      boardCount: BOARD_COUNT,
      trackerCount: trackerCount(),
      scanned: jobs.length,
      ms: Date.now() - startedAt,
    } satisfies FetcherState);
    void cachedUrlCount(); // keeps the conditional-GET cache referenced
    return added;
  } finally {
    running = false;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Start the background poll loop once (the server is long-running, so it
 * persists). 90s is about the useful floor — ATS endpoints are CDN-cached for
 * roughly a minute and GitHub's raw CDN for a few, so polling faster mostly
 * re-reads identical bytes. Conditional GET keeps unchanged boards nearly free,
 * which is what makes this cadence affordable at 60+ boards.
 */
export function ensureFetcherRunning(intervalMs = 90 * 1000) {
  if (started) return;
  started = true;
  void refreshDetected();
  setInterval(() => void refreshDetected(), intervalMs);
}
