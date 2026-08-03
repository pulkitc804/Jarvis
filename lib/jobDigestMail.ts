import fs from "node:fs";
import path from "node:path";
import { listInternships, upcomingDeadlines, type Internship } from "./internships";
import { getFetcherState } from "./internshipFetcher";
import { sendMail } from "./mailSource";

/**
 * Three-times-daily job digest.
 *
 * Sends only roles first detected since the previous digest, plus a snapshot of
 * where the search stands. State lives in data/digest-state.json so a restart
 * can't cause a duplicate send or skip a window.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "digest-state.json");

/** Local-time hours to send at. */
const SEND_HOURS = [8, 13, 19];

export const DIGEST_TO = process.env.JOB_DIGEST_TO || "pc937@scarletmail.rutgers.edu";

type DigestState = { lastSentAt: string | null; lastSlot: string | null; sentCount: number };

function readState(): DigestState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastSentAt: null, lastSlot: null, sentCount: 0 };
  }
}

function writeState(s: DigestState) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, `digest-state.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), "utf8");
  fs.renameSync(tmp, STATE_FILE);
}

/** Identifies a send window, e.g. "2026-08-03:13" — one send per slot, ever. */
function slotKey(d: Date): string | null {
  const h = d.getHours();
  // A slot stays claimable for an hour after its start, so a server that was
  // asleep at 08:00 still sends the morning digest when it wakes at 08:40.
  const active = SEND_HOURS.filter((s) => h >= s && h < s + 1).pop();
  if (active == null) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}:${active}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export type DigestPayload = {
  newRoles: Internship[];
  stats: {
    total: number;
    bigTech: number;
    applied: number;
    oa: number;
    interview: number;
    offer: number;
    favorites: number;
    worthTailoring: number;
    boards: number;
    scanned: number;
    deadLinks: number;
  };
  deadlines: ReturnType<typeof upcomingDeadlines>;
  since: number;
};

export function buildDigest(sinceMs: number): DigestPayload {
  const { internships } = listInternships();
  const live = internships.filter((j) => !j.hidden);
  const f = getFetcherState();

  const newRoles = live
    .filter((j) => j.firstSeen > sinceMs && j.linkVerdict !== "dead")
    .sort((a, b) => (b.postedAt ?? b.firstSeen) - (a.postedAt ?? a.firstSeen));

  const count = (p: (j: Internship) => boolean) => live.filter(p).length;

  return {
    newRoles,
    stats: {
      total: live.length,
      bigTech: count((j) => j.bigTech),
      applied: count((j) => j.stage === "applied"),
      oa: count((j) => j.stage === "oa"),
      interview: count((j) => j.stage === "interview"),
      offer: count((j) => j.stage === "offer"),
      favorites: count((j) => j.favorite),
      worthTailoring: count((j) => !!j.worthTailoring && !j.tailoredResume),
      boards: f.boardCount ?? 0,
      scanned: f.scanned ?? 0,
      deadLinks: count((j) => j.linkVerdict === "dead"),
    },
    deadlines: upcomingDeadlines(),
    since: sinceMs,
  };
}

export function renderDigest(d: DigestPayload): { subject: string; text: string; html: string } {
  const n = d.newRoles.length;
  const subject =
    n > 0
      ? `${n} new 2027 internship${n === 1 ? "" : "s"} — ${d.newRoles[0].company}${n > 1 ? ` +${n - 1} more` : ""}`
      : `No new roles — ${d.stats.applied + d.stats.oa + d.stats.interview} applications in flight`;

  const s = d.stats;
  // One entry per company, roles nested — repeating the company name on every
  // line is what made the old digest a wall of text.
  const byCompany = new Map<string, Internship[]>();
  for (const j of d.newRoles) {
    const list = byCompany.get(j.company);
    if (list) list.push(j);
    else byCompany.set(j.company, [j]);
  }
  const companies = [...byCompany.entries()].sort(
    (a, b) => Math.max(...b[1].map((j) => j.postedAt ?? j.firstSeen)) - Math.max(...a[1].map((j) => j.postedAt ?? j.firstSeen)),
  );

  const lines: string[] = [];
  lines.push(`${n} new across ${companies.length} compan${companies.length === 1 ? "y" : "ies"}`);
  lines.push(`Applied ${s.applied} · OA ${s.oa} · Interview ${s.interview} · Offers ${s.offer} · tracking ${s.total}`);
  lines.push("");
  for (const [company, list] of companies) {
    lines.push(`${company} (${list.length})`);
    for (const j of list.slice(0, 6)) lines.push(`   ${j.role}${j.url ? ` — ${j.url}` : ""}`);
    if (list.length > 6) lines.push(`   +${list.length - 6} more`);
    lines.push("");
  }
  if (d.deadlines.length) {
    lines.push("Deadlines: " + d.deadlines.map((dl) => `${dl.company} ${fmt(dl.deadlineAt)}`).join(" · "));
  }
  const text = lines.join("\n");

  // <details> collapses in most desktop clients and degrades to plain visible
  // content in the ones that don't support it — either way it stays readable.
  const companyBlock = ([company, list]: [string, Internship[]]) => `
    <details style="border:1px solid #e6e6e9;border-radius:8px;margin-bottom:8px" open>
      <summary style="padding:10px 12px;cursor:pointer;font-weight:600;color:#111;list-style:none">
        ${esc(company)}
        <span style="font-weight:400;color:#888;font-size:13px">&nbsp;${list.length} role${list.length === 1 ? "" : "s"}</span>
      </summary>
      <div style="padding:0 12px 10px">
        ${list
          .map(
            (j) => `
          <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid #f0f0f2">
            <div style="min-width:0">
              <div style="color:#333;font-size:14px">${esc(j.role)}</div>
              <div style="color:#999;font-size:12px">${j.postedAt ? `posted ${esc(fmt(j.postedAt))}` : `detected ${esc(fmt(j.firstSeen))}`}${j.location ? ` · ${esc(j.location)}` : ""}</div>
            </div>
            ${j.url ? `<a href="${esc(j.url)}" style="align-self:center;background:#1a1a1f;color:#fff;padding:6px 11px;border-radius:6px;text-decoration:none;font-size:12px;white-space:nowrap">Apply</a>` : ""}
          </div>`,
          )
          .join("")}
      </div>
    </details>`;

  const stat = (label: string, value: number | string) => `
    <td style="padding:8px 10px;border:1px solid #e6e6e9;border-radius:6px;text-align:center">
      <div style="font-size:20px;font-weight:600;color:#111">${value}</div>
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.04em">${label}</div>
    </td>`;

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;color:#111">
    <h2 style="margin:0 0 4px;font-size:19px">${n > 0 ? `${n} new role${n === 1 ? "" : "s"} · ${companies.length} compan${companies.length === 1 ? "y" : "ies"}` : "No new roles this window"}</h2>
    <div style="color:#888;font-size:13px;margin-bottom:14px">Since ${esc(fmt(d.since))} · ${s.scanned} matches scanned across ${s.boards} employer boards</div>

    ${
      n > 0
        ? companies.map(companyBlock).join("")
        : `<div style="padding:14px;border:1px solid #e6e6e9;border-radius:8px;color:#666;margin-bottom:16px">Nothing new since the last digest. Still watching ${s.boards} boards.</div>`
    }

    <h3 style="margin:18px 0 8px;font-size:15px">Where you stand</h3>
    <table style="width:100%;border-collapse:separate;border-spacing:6px 0;margin-bottom:14px"><tr>
      ${stat("Tracking", s.total)}${stat("Big tech", s.bigTech)}${stat("Applied", s.applied)}${stat("OA", s.oa)}${stat("Interview", s.interview)}${stat("Offers", s.offer)}
    </tr></table>
    <div style="color:#666;font-size:13px">
      ${s.favorites} favorited · ${s.worthTailoring} worth tailoring${s.deadLinks ? ` · ${s.deadLinks} dead link${s.deadLinks === 1 ? "" : "s"} filtered out` : ""}
    </div>

    ${
      d.deadlines.length
        ? `<h3 style="margin:18px 0 8px;font-size:15px">Upcoming deadlines</h3>
           <ul style="margin:0;padding-left:18px;color:#444;font-size:14px">
             ${d.deadlines.map((dl) => `<li>${esc(dl.company)} — ${esc(dl.deadlineLabel || "deadline")} <strong>${esc(fmt(dl.deadlineAt))}</strong></li>`).join("")}
           </ul>`
        : ""
    }

    <div style="margin-top:22px;padding-top:12px;border-top:1px solid #e6e6e9;color:#999;font-size:12px">
      Jarvis · <a href="http://localhost:3000/internships" style="color:#666">open the tracker</a> · sent 3× daily
    </div>
  </div>`;

  return { subject, text, html };
}

/** Send now regardless of schedule (used by the "send test" endpoint). */
export async function sendDigestNow(sinceMs?: number): Promise<{ ok: boolean; error?: string; newRoles: number }> {
  const st = readState();
  const since = sinceMs ?? (st.lastSentAt ? Date.parse(st.lastSentAt) : Date.now() - 24 * 3600_000);
  const payload = buildDigest(since);
  const { subject, text, html } = renderDigest(payload);
  const res = await sendMail({ to: DIGEST_TO, subject: `[Jarvis] ${subject}`, text, html });
  if (res.ok) {
    writeState({ lastSentAt: new Date().toISOString(), lastSlot: slotKey(new Date()), sentCount: st.sentCount + 1 });
  }
  return { ok: res.ok, error: res.error, newRoles: payload.newRoles.length };
}

let started = false;

/** Check every 5 minutes whether the current send window is unclaimed. */
export function ensureDigestScheduler() {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      const now = new Date();
      const slot = slotKey(now);
      if (!slot) return; // not inside a send window
      const st = readState();
      if (st.lastSlot === slot) return; // this window already sent
      const since = st.lastSentAt ? Date.parse(st.lastSentAt) : now.getTime() - 8 * 3600_000;
      const payload = buildDigest(since);
      const { subject, text, html } = renderDigest(payload);
      const res = await sendMail({ to: DIGEST_TO, subject: `[Jarvis] ${subject}`, text, html });
      // Claim the slot either way — a broken SMTP config shouldn't retry every
      // 5 minutes for an hour.
      writeState({ lastSentAt: new Date().toISOString(), lastSlot: slot, sentCount: st.sentCount + (res.ok ? 1 : 0) });
    } catch {
      /* never let the scheduler throw into the request path */
    }
  };

  setTimeout(() => void tick(), 30_000);
  setInterval(() => void tick(), 5 * 60_000);
}

export function getDigestState() {
  return { ...readState(), to: DIGEST_TO, sendHours: SEND_HOURS };
}
