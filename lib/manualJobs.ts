import fs from "node:fs";
import path from "node:path";

/**
 * Roles you add by hand — the ones the scrapers can't reach: Instagram pages
 * like zero2sudo, Discord servers, a recruiter DM, a friend's referral link.
 * They live in their own file so a scraper pass can never overwrite or prune
 * them, and they flow into the same ledger (stage, deadlines, tailoring).
 */

export type ManualJob = {
  id: string;
  company: string;
  role: string;
  url: string;
  location?: string;
  /** Where you saw it — free text, e.g. "zero2sudo IG", "referral from Sam". */
  via?: string;
  /** When it was posted, if you know; otherwise when you added it. */
  postedAt?: string;
  addedAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "manual-jobs.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "[]", "utf8");
}

export function readManualJobs(): ManualJob[] {
  ensure();
  try {
    const a = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function write(rows: ManualJob[]) {
  ensure();
  const tmp = path.join(DATA_DIR, `manual-jobs.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), "utf8");
  fs.renameSync(tmp, FILE);
}

function newId(): string {
  return "m_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function addManualJob(input: {
  company: string;
  role: string;
  url?: string;
  location?: string;
  via?: string;
  postedAt?: string;
}): ManualJob {
  const rows = readManualJobs();
  const now = new Date().toISOString();
  const row: ManualJob = {
    id: newId(),
    company: input.company.trim().slice(0, 120),
    role: input.role.trim().slice(0, 200),
    // A URL is optional — plenty of Instagram posts just name the role.
    url: (input.url || "").trim().slice(0, 600),
    location: input.location?.trim().slice(0, 120) || undefined,
    via: input.via?.trim().slice(0, 120) || undefined,
    postedAt: input.postedAt || now,
    addedAt: now,
  };
  rows.unshift(row);
  write(rows);
  return row;
}

export function deleteManualJob(id: string): boolean {
  const rows = readManualJobs();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  write(next);
  return true;
}
