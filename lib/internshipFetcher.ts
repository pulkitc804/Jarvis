import fs from "node:fs";
import path from "node:path";
import { isBigTech, isUndergradRole } from "./internships";

/**
 * FREE, fast job detection: Jarvis's own server fetches community internship
 * trackers (plain HTTP — no Claude tokens, no drain on the subscription),
 * parses NEW big-tech SWE/ML/DS roles, and writes them to data/detected.json.
 * The Claude scraper task then enriches these with fit scores on its schedule.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const DETECTED_FILE = path.join(DATA_DIR, "detected.json");

// Summer-2027 community trackers (pittcsc/SimplifyJobs table format). Add more freely.
const TRACKERS = [
  "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/README.md",
  "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/main/README.md",
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/README.md",
];

const ROLE_RE = /software engineer|software dev|\bswe\b|machine learning|\bml\b|\bai\b|data scien|data eng|applied scien|research (engineer|intern)|full.?stack|backend|frontend|infrastructure|platform/i;

export type DetectedJob = { company: string; role: string; url: string; location?: string; firstSeen?: string };

function cleanUrl(u: string): string {
  return u.replace(/[?&]utm_source=[^&]*/g, "").replace(/[?&]$/, "").trim();
}
function stripTags(s: string): string {
  return s
    .replace(/<br\s*\/?>|<\/br>/gi, ", ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTracker(md: string): DetectedJob[] {
  const out: DetectedJob[] = [];
  let lastCompany = "";
  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    const [c0, roleRaw, locRaw, applyRaw] = cells;
    if (/^-+$/.test(c0) || /^company$/i.test(stripTags(c0))) continue; // header/separator
    let company = stripTags(c0);
    if (!company || c0.includes("↳") || company === "↳") company = lastCompany;
    else lastCompany = company;
    if (!company) continue;
    const role = stripTags(roleRaw);
    if (!ROLE_RE.test(role)) continue;
    if (!isUndergradRole(role)) continue; // undergrad only — no PhD/Masters-only roles
    const href = applyRaw.match(/href="([^"]+)"/) || applyRaw.match(/\((https?:\/\/[^)]+)\)/);
    if (!href) continue; // closed roles have no apply link
    if (!isBigTech(company)) continue; // only big-tech, per your preference
    out.push({ company, role, location: stripTags(locRaw), url: cleanUrl(href[1]) });
  }
  return out;
}

function readDetected(): DetectedJob[] {
  try {
    const a = JSON.parse(fs.readFileSync(DETECTED_FILE, "utf8"));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
function writeDetected(jobs: DetectedJob[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, `detected.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), "utf8");
  fs.renameSync(tmp, DETECTED_FILE);
}

export function getDetectedJobs(): DetectedJob[] {
  return readDetected();
}

let running = false;
let started = false;

export async function refreshDetected(): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const found = new Map<string, DetectedJob>();
    for (const url of TRACKERS) {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 15000);
        const res = await fetch(url, { signal: c.signal, headers: { "user-agent": "jarvis-dashboard" } }).finally(() => clearTimeout(t));
        if (!res.ok) continue;
        const md = await res.text();
        for (const j of parseTracker(md)) if (!found.has(j.url)) found.set(j.url, j);
      } catch {
        /* ignore this tracker */
      }
    }
    // Drop any previously-stored entries that no longer pass the filters
    // (e.g. grad-only roles saved before the undergrad rule existed).
    const existing = readDetected().filter((j) => isUndergradRole(j.role));
    const pruned = readDetected().length - existing.length;
    const byUrl = new Map(existing.map((j) => [j.url, j]));
    let added = 0;
    for (const j of found.values()) {
      if (!byUrl.has(j.url)) {
        byUrl.set(j.url, { ...j, firstSeen: nowIso() });
        added++;
      }
    }
    if (added > 0 || pruned > 0) writeDetected([...byUrl.values()]);
    return added;
  } finally {
    running = false;
  }
}

function nowIso(): string {
  // Date is available at runtime in the node server (only the Workflow sandbox blocks it).
  return new Date().toISOString();
}

/** Start the background fetch loop once (server is long-running, so it persists).
 *  5 min matches raw.githubusercontent.com's CDN cache — fetching faster just
 *  returns the same cached bytes, so this is the real freshness ceiling. */
export function ensureFetcherRunning(intervalMs = 5 * 60 * 1000) {
  if (started) return;
  started = true;
  void refreshDetected();
  setInterval(() => void refreshDetected(), intervalMs);
}
