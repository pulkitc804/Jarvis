import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Reads the REAL plan-usage percentages that Claude Code's /usage shows, from
 * the Claude desktop app's local cache. This is the ground truth — no token or
 * API call needed. The desktop app appends a sample (~every 5 min) of:
 *   { t: epochMs, u: { fh: <5-hour % used>, sd: <7-day % used> } }
 * We take the latest sample and derive the 5-hour reset from where usage
 * resumed after the last reset (fh dropping to ~0, then climbing again).
 */

const FILE = path.join(os.homedir(), "Library", "Application Support", "Claude", "plan-usage-history.json");
const FIVE_H = 5 * 60 * 60 * 1000;

export type PlanUsage =
  | {
      available: true;
      fiveHourPct: number;
      weeklyPct: number;
      sampledAt: number;
      fiveHourResetsAt: number | null;
      windowStart: number | null;
    }
  | { available: false; reason: string };

type Sample = { t: number; u: { fh?: number; sd?: number } };

export function readPlanUsage(): PlanUsage {
  let obj: { samples?: Sample[] };
  try {
    obj = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return { available: false, reason: "Claude desktop usage cache not found (open the Claude app)." };
  }
  const s = obj.samples;
  if (!Array.isArray(s) || s.length === 0) return { available: false, reason: "No usage samples yet." };
  const last = s[s.length - 1];
  const fh = Number(last?.u?.fh);
  const sd = Number(last?.u?.sd);
  if (!Number.isFinite(fh)) return { available: false, reason: "Usage sample malformed." };

  // Derive the current 5-hour window: find the most recent RESET (a drop of the
  // 5h % of >=8 points), then the window starts where usage resumes after it
  // (first fh>0 at/after the reset). Anthropic anchors the 5h clock to your
  // first message of the new window, which is exactly that resume point.
  const now = Date.now();
  const horizon = now - 6 * 60 * 60 * 1000;
  let resetIdx = -1;
  for (let i = s.length - 1; i > 0; i--) {
    if (s[i].t < horizon) break;
    const prev = Number(s[i - 1]?.u?.fh) || 0;
    const cur = Number(s[i]?.u?.fh) || 0;
    if (prev - cur >= 8) {
      resetIdx = i;
      break;
    }
  }
  let windowStart: number | null = null;
  if (resetIdx >= 0) {
    let j = resetIdx;
    while (j < s.length && (Number(s[j]?.u?.fh) || 0) === 0) j++;
    windowStart = s[Math.min(j, s.length - 1)].t;
  }
  const fiveHourResetsAt = windowStart ? windowStart + FIVE_H : null;

  return {
    available: true,
    fiveHourPct: Math.max(0, Math.min(100, Math.round(fh))),
    weeklyPct: Number.isFinite(sd) ? Math.max(0, Math.min(100, Math.round(sd))) : 0,
    sampledAt: last.t,
    fiveHourResetsAt,
    windowStart,
  };
}
