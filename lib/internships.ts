import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDetectedJobs } from "./internshipFetcher";
import { readManualJobs } from "./manualJobs";
import { getLinkHealth, type LinkVerdict } from "./linkHealth";

/**
 * Internship tracker data layer.
 * - Base feed: two sources, merged by apply URL —
 *     1. the scraper's cumulative seen_jobs.json (scored, 3×/day), and
 *     2. Jarvis's own data/detected.json (free HTTP tracker fetch, every few
 *        minutes) so new big-tech roles show up near-instantly, unscored, and
 *        get enriched with scores once the scraper next runs.
 * - Jarvis overlays per-job state (applied status, dates, AI score, tailored
 *   resume) in data/internships.json, keyed by apply URL — neither feed file is
 *   modified.
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
const HIDDEN_COMPANIES_FILE = path.join(DATA_DIR, "hidden-companies.json");

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

// The candidate is an undergrad (rising junior). Drop graduate-only roles unless
// the title also signals bachelor's/undergrad eligibility (e.g. "BS/MS").
// `master[' -]?s` also catches "master s", which is what slugified URLs turn
// "master's" into once the apostrophe is stripped.
const GRAD_ONLY_RE = /\bph\.?d\b|\bdoctoral\b|\bpost-?doc\b|\bmaster['\s-]?s\b|\bmba\b|\bms\b|graduate students?/i;
const UNDERGRAD_OK_RE = /\bb\.?s\.?\b|\bb\.?a\.?\b|\bbachelor'?s?\b|\bundergrad(uate)?\b|\bsophomore\b|rising junior|\bfreshman\b/i;
export function isUndergradRole(role: string): boolean {
  if (!role) return true;
  return !(GRAD_ONLY_RE.test(role) && !UNDERGRAD_OK_RE.test(role));
}

type ScraperJob = {
  company: string;
  role: string;
  url: string;
  location?: string;
  firstSeen?: string;
  /** Employer's publish time (ISO), when the source reports one. */
  postedAt?: string;
  /** Which feed surfaced it: greenhouse | lever | ashby | tracker | reddit | … */
  source?: string;
  /** Set for hand-entered roles (see lib/manualJobs.ts). */
  manual?: boolean;
  via?: string;
  manualId?: string;
  // Optional AI fields the scraper task writes (free, on the subscription).
  score?: number;
  worthTailoring?: boolean;
  scoreReason?: string;
  tailoredResume?: string;
};

// Application pipeline stage. "applied" replaces the old boolean — richer than
// a checkbox so you can see where each role actually stands.
export const STAGES = ["not_applied", "applied", "oa", "interview", "offer", "rejected"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  not_applied: "Not applied",
  applied: "Applied",
  oa: "OA",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export type JobStatus = {
  applied: boolean; // derived from stage !== "not_applied" — kept for back-compat
  appliedAt: number | null;
  stage: Stage;
  stageUpdatedAt: number | null;
  deadlineAt: number | null; // next OA/interview deadline the user is tracking
  deadlineLabel: string | null; // e.g. "OA due", "Final round"
  referral: boolean; // someone is referring you for this specific role
  referralAt: number | null;
  favorite: boolean; // starred — the roles you actually care about
  hidden: boolean; // dismissed from the ledger to cut noise
  firstSeen: number;
  score: number | null; // 0-100 resume↔role similarity
  worthTailoring: boolean | null;
  scoreReason: string | null;
  tailoredResume: string | null; // LaTeX/text of tailored resume
  tailorRequested: boolean; // user asked for a tailored résumé (fulfilled by the scraper)
  tailorRequestedAt: number | null;
  notes: string;
};

// JobStatus owns firstSeen (number) and the AI fields (nullable), so drop the
// scraper's own versions of those to avoid type conflicts.
export type Internship = Omit<ScraperJob, "firstSeen" | "postedAt" | "score" | "worthTailoring" | "scoreReason" | "tailoredResume"> & {
  id: string;
  bigTech: boolean;
  /** Employer publish time in epoch ms, or null when unknown. */
  postedAt: number | null;
  /** Result of the last link check: ok | dead | blocked | unknown. */
  linkVerdict: LinkVerdict | null;
  /** True for roles you added by hand rather than ones a feed found. */
  manual?: boolean;
  /** Where a manual role came from, e.g. "zero2sudo IG". */
  via?: string;
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
  // Hand-added roles keep their own stable id: their URL is optional and can be
  // edited, so keying them by URL would orphan their stage/deadline state.
  if (j.manualId) return j.manualId;
  return (j.url || `${j.company}::${j.role}`).trim();
}

/* Companies muted wholesale — every current and future role from them is
   hidden, so a company you don't care about stops cluttering the ledger. */
export function readHiddenCompanies(): string[] {
  try {
    const a = JSON.parse(fs.readFileSync(HIDDEN_COMPANIES_FILE, "utf8"));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function writeHiddenCompanies(list: string[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, `hidden-companies.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), "utf8");
  fs.renameSync(tmp, HIDDEN_COMPANIES_FILE);
}

export function setCompanyHidden(company: string, hidden: boolean): string[] {
  const key = normalizeCompany(company);
  const list = readHiddenCompanies().filter((c) => c !== key);
  if (hidden) list.push(key);
  writeHiddenCompanies(list);
  return list;
}

export function scraperExists(): boolean {
  return fs.existsSync(SCRAPER_FILE);
}

/** Merge the scraper feed (scored), Jarvis's detected feed, and manual adds. */
function mergedJobs(): ScraperJob[] {
  const byId = new Map<string, ScraperJob>();
  // detected first, so a matching scraper entry overrides it (keeps scores etc.)
  for (const j of getDetectedJobs()) byId.set(jobId(j), j);
  for (const j of readScraperJobs()) {
    const id = jobId(j);
    byId.set(id, { ...byId.get(id), ...j });
  }
  // Manual entries win on identity — they hold your stage/deadline state, which
  // is keyed by their own id. But a role you added by hand is often the same
  // posting a feed later finds on its own, so fold the two together instead of
  // showing it twice: keep the manual row, enrich it with whatever the feed knows.
  const roleKey = (company: string, role: string) =>
    `${normalizeCompany(company)}::${role.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
  const scrapedByRole = new Map<string, [string, ScraperJob]>();
  for (const [id, j] of byId) scrapedByRole.set(roleKey(j.company, j.role), [id, j]);

  for (const m of readManualJobs()) {
    const dup = scrapedByRole.get(roleKey(m.company, m.role));
    if (dup) byId.delete(dup[0]); // drop the feed copy; the manual row replaces it
    const feed = dup?.[1];
    byId.set(m.id, {
      company: m.company,
      role: m.role,
      // Prefer the employer-board URL when a feed found the same posting.
      url: feed?.url || m.url,
      location: m.location || feed?.location,
      postedAt: feed?.postedAt || m.postedAt,
      firstSeen: m.addedAt,
      source: "manual",
      manual: true,
      via: m.via,
      manualId: m.id,
      // carry over anything the scraper scored
      score: feed?.score,
      worthTailoring: feed?.worthTailoring,
      scoreReason: feed?.scoreReason,
    } as ScraperJob);
  }
  return [...byId.values()];
}

export function listInternships(): { internships: Internship[]; scraperConnected: boolean; scraperFile: string; detectedCount: number } {
  const detectedCount = getDetectedJobs().length;
  const jobs = mergedJobs();
  const map = readStatusMap();
  const health = getLinkHealth();
  const hiddenCompanies = new Set(readHiddenCompanies());
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
      postedAt: j.postedAt ? Date.parse(j.postedAt) || null : null,
      linkVerdict: j.url ? health[j.url]?.verdict ?? null : null,
      applied: st.applied ?? false,
      appliedAt: st.appliedAt ?? null,
      stage: st.stage ?? (st.applied ? "applied" : "not_applied"),
      stageUpdatedAt: st.stageUpdatedAt ?? null,
      deadlineAt: st.deadlineAt ?? null,
      deadlineLabel: st.deadlineLabel ?? null,
      referral: st.referral ?? false,
      referralAt: st.referralAt ?? null,
      favorite: st.favorite ?? false,
      hidden: (st.hidden ?? false) || hiddenCompanies.has(normalizeCompany(j.company)),
      firstSeen: st.firstSeen ?? now,
      // Prefer scores the scraper wrote into seen_jobs.json; fall back to any
      // written by Jarvis's own /api/internships/score (if an API key is added).
      score: j.score ?? st.score ?? null,
      worthTailoring: j.worthTailoring ?? st.worthTailoring ?? null,
      scoreReason: j.scoreReason ?? st.scoreReason ?? null,
      tailoredResume: j.tailoredResume ?? st.tailoredResume ?? null,
      tailorRequested: st.tailorRequested ?? false,
      tailorRequestedAt: st.tailorRequestedAt ?? null,
      notes: st.notes ?? "",
    };
  });

  if (dirty) writeStatusMap(map);

  // Undergrad-only: never surface PhD/Masters-only roles regardless of source.
  const undergrad = internships.filter((j) => isUndergradRole(j.role));

  // big tech first, then most-recently-detected
  undergrad.sort((a, b) => (a.bigTech === b.bigTech ? b.firstSeen - a.firstSeen : a.bigTech ? -1 : 1));
  return { internships: undergrad, scraperConnected: scraperExists(), scraperFile: SCRAPER_FILE, detectedCount };
}

export function updateJob(id: string, patch: Partial<JobStatus>): void {
  const map = readStatusMap();
  const cur = map[id] || { firstSeen: Date.now() };
  if (patch.applied !== undefined) {
    cur.applied = patch.applied;
    cur.appliedAt = patch.applied ? Date.now() : null;
    // legacy boolean toggle also moves the stage forward/back
    if (patch.stage === undefined) cur.stage = patch.applied ? "applied" : "not_applied";
  }
  if (patch.stage !== undefined) {
    cur.stage = patch.stage;
    cur.stageUpdatedAt = Date.now();
    cur.applied = patch.stage !== "not_applied";
    cur.appliedAt = cur.applied ? cur.appliedAt ?? Date.now() : null;
  }
  if (patch.referral !== undefined) {
    cur.referral = patch.referral;
    cur.referralAt = patch.referral ? Date.now() : null;
  }
  for (const k of ["score", "worthTailoring", "scoreReason", "tailoredResume", "tailorRequested", "tailorRequestedAt", "deadlineAt", "deadlineLabel", "favorite", "hidden", "notes", "firstSeen"] as const) {
    if (patch[k] !== undefined) (cur as Record<string, unknown>)[k] = patch[k];
  }
  map[id] = cur;
  writeStatusMap(map);
}

/** Upcoming OA/interview deadlines across all tracked jobs, soonest first. */
export function upcomingDeadlines(withinMs = 14 * 24 * 60 * 60 * 1000): Array<{ id: string; company: string; role: string; deadlineAt: number; deadlineLabel: string | null }> {
  const { internships } = listInternships();
  const now = Date.now();
  return internships
    .filter((j) => j.deadlineAt != null && j.deadlineAt >= now && j.deadlineAt <= now + withinMs)
    .sort((a, b) => (a.deadlineAt as number) - (b.deadlineAt as number))
    .map((j) => ({ id: j.id, company: j.company, role: j.role, deadlineAt: j.deadlineAt as number, deadlineLabel: j.deadlineLabel }));
}

export function getJobById(id: string): Internship | null {
  return listInternships().internships.find((j) => j.id === id) || null;
}

/** Every apply URL currently in the ledger — the link sweeper's work list. */
export function allJobUrls(): string[] {
  return [...new Set(listInternships().internships.map((j) => j.url).filter(Boolean))];
}
