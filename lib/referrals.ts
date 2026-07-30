import fs from "node:fs";
import path from "node:path";

/** Lightweight network tracker — who you know at which company, and whether you've reached out. */

export type Referral = {
  id: string;
  company: string;
  contactName: string;
  relation: string; // e.g. "Rutgers alum", "former coworker"
  notes: string;
  contacted: boolean;
  contactedAt: number | null;
  createdAt: number;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "referrals.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "[]", "utf8");
}

export function readReferrals(): Referral[] {
  ensure();
  try {
    const arr = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeReferrals(rows: Referral[]) {
  ensure();
  const tmp = path.join(DATA_DIR, `referrals.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), "utf8");
  fs.renameSync(tmp, FILE);
}

function id(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function addReferral(input: { company: string; contactName: string; relation?: string; notes?: string }): Referral {
  const rows = readReferrals();
  const row: Referral = {
    id: id(),
    company: input.company.trim().slice(0, 120),
    contactName: input.contactName.trim().slice(0, 120),
    relation: (input.relation || "").trim().slice(0, 120),
    notes: (input.notes || "").trim().slice(0, 500),
    contacted: false,
    contactedAt: null,
    createdAt: Date.now(),
  };
  rows.unshift(row);
  writeReferrals(rows);
  return row;
}

export function updateReferral(refId: string, patch: Partial<Pick<Referral, "company" | "contactName" | "relation" | "notes" | "contacted">>): Referral | null {
  const rows = readReferrals();
  const r = rows.find((x) => x.id === refId);
  if (!r) return null;
  if (patch.company !== undefined) r.company = patch.company.trim().slice(0, 120);
  if (patch.contactName !== undefined) r.contactName = patch.contactName.trim().slice(0, 120);
  if (patch.relation !== undefined) r.relation = patch.relation.trim().slice(0, 120);
  if (patch.notes !== undefined) r.notes = patch.notes.trim().slice(0, 500);
  if (patch.contacted !== undefined) {
    r.contacted = patch.contacted;
    r.contactedAt = patch.contacted ? Date.now() : null;
  }
  writeReferrals(rows);
  return r;
}

export function deleteReferral(refId: string): boolean {
  const rows = readReferrals();
  const next = rows.filter((x) => x.id !== refId);
  if (next.length === rows.length) return false;
  writeReferrals(next);
  return true;
}
