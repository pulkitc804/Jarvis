import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Internship tracker data layer.
 * - Base feed: the scraper's cumulative seen_jobs.json ({company, role, url, ...}).
 * - Jarvis overlays per-job state (applied status, dates, AI score, tailored
 *   resume) in data/internships.json, keyed by apply URL — the scraper file is
 *   never modified.
 */

const SCRAPER_FILE = path.join(
  os.homedir(),
  "Claude",
  "Scheduled",
  "summer-2027-internship-detector",
  "seen_jobs.json",
);
const DATA_DIR = path.join(process.cwd(), "data");
const STATUS_FILE = path.join(DATA_DIR, "internships.json");

// Recognized big-tech / name-brand companies. Edit freely — matching is
// case-insensitive and word-boundary aware.
const BIG_TECH = [
  "google", "alphabet", "youtube", "deepmind", "meta", "facebook", "instagram", "whatsapp",
  "amazon", "aws", "apple", "microsoft", "linkedin", "github", "netflix", "nvidia", "tesla",
  "openai", "anthropic", "adobe", "salesforce", "oracle", "ibm", "intel", "amd", "qualcomm",
  "cisco", "uber", "lyft", "airbnb", "spotify", "snap", "snapchat", "pinterest", "stripe",
  "databricks", "palantir", "snowflake", "servicenow", "workday", "atlassian", "dropbox",
  "block", "paypal", "coinbase", "robinhood", "doordash", "instacart", "roblox", "unity",
  "twilio", "datadog", "cloudflare", "vmware", "sap", "dell", "hp", "samsung", "tiktok",
  "bytedance", "reddit", "discord", "notion", "figma", "waymo", "cruise", "zoom", "slack",
  "bloomberg", "broadcom", "visa", "mastercard", "intuit", "servicetitan", "nvidia",
  "jpmorgan", "goldman sachs", "morgan stanley", "capital one", "american express",
];

export function normalizeCompany(c: string): string {
  return c
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|llc|corp|corporation|co|ltd|technologies|technology|labs|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBigTech(company: string): boolean {
  const n = " " + normalizeCompany(company) + " ";
  return BIG_TECH.some((t) => n.includes(" " + t + " "));
}

type ScraperJob = {
  company: string;
  role: string;
  url: string;
  location?: string;
  firstSeen?: string;
  // Optional AI fields the scraper task writes (free, on the subscription).
  score?: number;
  worthTailoring?: boolean;
  scoreReason?: string;
  tailoredResume?: string;
};

export type JobStatus = {
  applied: boolean;
  appliedAt: number | null;
  firstSeen: number;
  score: number | null; // 0-100 resume↔role similarity
  worthTailoring: boolean | null;
  scoreReason: string | null;
  tailoredResume: string | null; // LaTeX/text of tailored resume
  notes: string;
};

// JobStatus owns firstSeen (number) and the AI fields (nullable), so drop the
// scraper's own versions of those to avoid type conflicts.
export type Internship = Omit<ScraperJob, "firstSeen" | "score" | "worthTailoring" | "scoreReason" | "tailoredResume"> & {
  id: string;
  bigTech: boolean;
} & JobStatus;

function readScraperJobs(): ScraperJob[] {
  try {
    const arr = JSON.parse(fs.readFileSync(SCRAPER_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

type StatusMap = Record<string, Partial<JobStatus>>;

function readStatusMap(): StatusMap {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8")) || {};
  } catch {
    return {};
  }
}

function writeStatusMap(map: StatusMap) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, `internships.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2), "utf8");
  fs.renameSync(tmp, STATUS_FILE);
}

function jobId(j: ScraperJob): string {
  return (j.url || `${j.company}::${j.role}`).trim();
}

export function scraperExists(): boolean {
  return fs.existsSync(SCRAPER_FILE);
}

export function listInternships(): { internships: Internship[]; scraperConnected: boolean; scraperFile: string } {
  const jobs = readScraperJobs();
  const map = readStatusMap();
  let dirty = false;
  const now = Date.now();

  const internships: Internship[] = jobs.map((j) => {
    const id = jobId(j);
    let st = map[id];
    if (!st) {
      // record the moment Jarvis first saw this job (a real "date detected")
      st = { firstSeen: j.firstSeen ? Date.parse(j.firstSeen) || now : now };
      map[id] = st;
      dirty = true;
    }
    return {
      ...j,
      id,
      bigTech: isBigTech(j.company),
      applied: st.applied ?? false,
      appliedAt: st.appliedAt ?? null,
      firstSeen: st.firstSeen ?? now,
      // Prefer scores the scraper wrote into seen_jobs.json; fall back to any
      // written by Jarvis's own /api/internships/score (if an API key is added).
      score: j.score ?? st.score ?? null,
      worthTailoring: j.worthTailoring ?? st.worthTailoring ?? null,
      scoreReason: j.scoreReason ?? st.scoreReason ?? null,
      tailoredResume: j.tailoredResume ?? st.tailoredResume ?? null,
      notes: st.notes ?? "",
    };
  });

  if (dirty) writeStatusMap(map);

  // big tech first, then most-recently-detected
  internships.sort((a, b) => (a.bigTech === b.bigTech ? b.firstSeen - a.firstSeen : a.bigTech ? -1 : 1));
  return { internships, scraperConnected: scraperExists(), scraperFile: SCRAPER_FILE };
}

export function updateJob(id: string, patch: Partial<JobStatus>): void {
  const map = readStatusMap();
  const cur = map[id] || { firstSeen: Date.now() };
  if (patch.applied !== undefined) {
    cur.applied = patch.applied;
    cur.appliedAt = patch.applied ? Date.now() : null;
  }
  for (const k of ["score", "worthTailoring", "scoreReason", "tailoredResume", "notes", "firstSeen"] as const) {
    if (patch[k] !== undefined) (cur as Record<string, unknown>)[k] = patch[k];
  }
  map[id] = cur;
  writeStatusMap(map);
}

export function getJobById(id: string): Internship | null {
  return listInternships().internships.find((j) => j.id === id) || null;
}
