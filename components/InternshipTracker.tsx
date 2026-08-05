"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshIcon } from "@/components/icons";

// Mirrors lib/internships.ts Stage/STAGE_LABEL — kept local since that module
// pulls in node:fs and can't be imported into a client component.
const STAGES = ["not_applied", "applied", "oa", "interview", "offer", "rejected"] as const;
type Stage = (typeof STAGES)[number];
const STAGE_LABEL: Record<Stage, string> = {
  not_applied: "Not applied",
  applied: "Applied",
  oa: "OA",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};
// Each stage owns a distinct colour so a row's state reads at a glance:
// gray (untouched) → periwinkle (applied) → amber (OA) → cyan (interview) →
// green (offer) / red (rejected).
const STAGE_COLOR: Record<Stage, string> = {
  not_applied: "var(--faint)",
  applied: "var(--accent-2)",
  oa: "var(--warn)",
  interview: "var(--accent)",
  offer: "var(--good)",
  rejected: "var(--danger)",
};
/** Translucent fill of the same hue, so the control reads as a coloured chip. */
function stageTint(stage: Stage, pct = 14): string {
  return `color-mix(in srgb, ${STAGE_COLOR[stage]} ${pct}%, transparent)`;
}

type Internship = {
  id: string;
  company: string;
  role: string;
  url: string;
  location?: string;
  bigTech: boolean;
  applied: boolean;
  appliedAt: number | null;
  stage: Stage;
  deadlineAt: number | null;
  deadlineLabel: string | null;
  referral: boolean;
  favorite: boolean;
  hidden: boolean;
  firstSeen: number;
  /** Employer publish time when the source reports one, else null. */
  postedAt: number | null;
  source?: string;
  linkVerdict: "ok" | "dead" | "blocked" | "unknown" | null;
  manual?: boolean;
  via?: string;
  manualId?: string;
  score: number | null;
  worthTailoring: boolean | null;
  scoreReason: string | null;
  tailoredResume: string | null;
  tailorRequested: boolean;
  tailorRequestedAt: number | null;
  notes: string;
};
type Resp = {
  internships: Internship[];
  total: number;
  bigTechCount: number;
  appliedCount: number;
  stageCounts: Record<string, number>;
  upcomingDeadlines: Array<{ id: string; company: string; role: string; deadlineAt: number; deadlineLabel: string | null }>;
  scraperConnected: boolean;
  detectedCount: number;
  fetcher?: {
    lastRunAt: string | null;
    lastAdded: number;
    report: Array<{ source: string; found: number; ok: boolean; ms?: number }>;
    boardCount?: number;
    scanned?: number;
    ms?: number;
  };
  aiConfigured: boolean;
  tailoringInstant: boolean; // true = API key set (instant); false = queued to scraper
  pdfAvailable: boolean;
};

function scoreColor(s: number): string {
  if (s >= 75) return "var(--good)";
  if (s >= 50) return "var(--warn)";
  return "var(--danger)";
}
function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtStamp(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function relAge(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days}d ago` : `${Math.round(days / 30)}mo ago`;
}
// Where the row came from; ATS feeds are the employer's own board.
const SOURCE_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
  amazon: "Amazon Jobs",
  tracker: "GitHub tracker",
  reddit: "Reddit",
  hackernews: "Hacker News",
  indeed: "Indeed",
};
/** Sources that are the employer's own board — the earliest possible signal. */
const DIRECT_SOURCES = ["greenhouse", "lever", "ashby", "workday", "amazon"];
// Feed families reported by the background fetcher.
const SOURCE_GROUP: Record<string, string> = {
  boards: "Employer boards",
  ats: "Employer boards",
  trackers: "GitHub trackers",
  reddit: "Reddit",
  hackernews: "Hacker News",
};
function fmtDeadline(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function hoursUntil(ms: number) {
  return Math.round((ms - Date.now()) / 3_600_000);
}

export function InternshipTracker() {
  const [data, setData] = useState<Resp | null>(null);
  const [bigTechOnly, setBigTechOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, "score" | "tailor">>({});
  const [viewTex, setViewTex] = useState<Internship | null>(null);
  const [deadlineEditor, setDeadlineEditor] = useState<Internship | null>(null);
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [sortBy, setSortBy] = useState<"recent" | "score">("recent");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAdd, setShowAdd] = useState(false);
  // Dead postings are hidden by default — a link that 404s is noise.
  const [showDead, setShowDead] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [savedFile, setSavedFile] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/internships?all=${bigTechOnly ? 0 : 1}${force ? "&refresh=1" : ""}`, { cache: "no-store" });
        setData(await res.json());
      } finally {
        setLoading(false);
      }
    },
    [bigTechOnly],
  );

  // Anything Jarvis detected after your last manual refresh counts as "new" —
  // persisted so the marker survives a reload.
  const [seenAt, setSeenAt] = useState<number>(() => {
    if (typeof window === "undefined") return Date.now();
    return Number(localStorage.getItem("jarvis.internships.seenAt")) || Date.now();
  });

  function markAllSeen() {
    const now = Date.now();
    localStorage.setItem("jarvis.internships.seenAt", String(now));
    setSeenAt(now);
  }

  // Force a live scrape on open, then every 5 minutes; a cheap re-read every
  // 20s in between picks up whatever the background fetcher found.
  useEffect(() => {
    load(true);
    const quick = setInterval(() => load(false), 20_000);
    const full = setInterval(() => load(true), 5 * 60_000);
    return () => {
      clearInterval(quick);
      clearInterval(full);
    };
  }, [load]);

  async function setStage(job: Internship, stage: Stage) {
    setData((d) => (d ? { ...d, internships: d.internships.map((j) => (j.id === job.id ? { ...j, stage, applied: stage !== "not_applied" } : j)) } : d));
    await fetch("/api/internships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, stage }),
    });
  }

  async function saveDeadline(job: Internship, deadlineAt: number | null, deadlineLabel: string | null) {
    setData((d) => (d ? { ...d, internships: d.internships.map((j) => (j.id === job.id ? { ...j, deadlineAt, deadlineLabel } : j)) } : d));
    await fetch("/api/internships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, deadlineAt, deadlineLabel }),
    });
    setDeadlineEditor(null);
    load(false);
  }

  async function runScore(job: Internship) {
    setBusy((b) => ({ ...b, [job.id]: "score" }));
    try {
      const res = await fetch("/api/internships/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id }),
      });
      const j = await res.json();
      if (j.ok) {
        setData((d) =>
          d ? { ...d, internships: d.internships.map((x) => (x.id === job.id ? { ...x, score: j.score, worthTailoring: j.worthTailoring, scoreReason: (j.reason || "") + (j.missingKeywords?.length ? ` · gaps: ${j.missingKeywords.join(", ")}` : "") } : x)) } : d,
        );
      } else {
        alert(j.error || "Scoring failed");
      }
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[job.id];
        return n;
      });
    }
  }

  async function runTailor(job: Internship) {
    setBusy((b) => ({ ...b, [job.id]: "tailor" }));
    try {
      const res = await fetch("/api/internships/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id }),
      });
      const j = await res.json();
      if (j.ok) {
        if (j.file) setSavedFile(j.file.split("/").pop() || null);
        load(false);
      } else alert(j.error || "Tailoring failed");
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[job.id];
        return n;
      });
    }
  }

  async function patchJob(job: Internship, patch: Record<string, unknown>) {
    setData((d) => (d ? { ...d, internships: d.internships.map((j) => (j.id === job.id ? { ...j, ...patch } : j)) } : d));
    await fetch("/api/internships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, ...patch }),
    });
  }

  async function hideCompany(company: string, hidden: boolean) {
    await fetch("/api/internships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hideCompany: { company, hidden } }),
    });
    load(false);
  }

  async function toggleReferral(job: Internship) {
    const next = !job.referral;
    setData((d) => (d ? { ...d, internships: d.internships.map((j) => (j.id === job.id ? { ...j, referral: next } : j)) } : d));
    await fetch("/api/internships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, referral: next }),
    });
  }

  async function removeManual(job: Internship) {
    if (!job.manualId) return;
    await fetch(`/api/internships?id=${encodeURIComponent(job.manualId)}`, { method: "DELETE" });
    load(false);
  }

  const allJobs = data?.internships || [];
  const deadCount = allJobs.filter((j) => j.linkVerdict === "dead" && !j.hidden).length;
  const hiddenCount = allJobs.filter((j) => j.hidden).length;
  const favCount = allJobs.filter((j) => j.favorite).length;
  const jobs = allJobs
    .filter((j) => (showHidden ? j.hidden : !j.hidden))
    .filter((j) => !favOnly || j.favorite)
    .filter((j) => stageFilter === "all" || j.stage === stageFilter)
    // Keep a dead posting visible if you've already engaged with it.
    .filter((j) => showDead || j.linkVerdict !== "dead" || j.stage !== "not_applied")
    .slice()
    .sort((a, b) =>
      sortBy === "score"
        ? (b.score ?? -1) - (a.score ?? -1)
        : // freshest first, by real publish time when known
          (b.postedAt ?? b.firstSeen) - (a.postedAt ?? a.firstSeen),
    );

  // One collapsible group per company, ordered by whichever company has the
  // most recent activity (or the best fit score when sorting by score).
  const grouped: Array<[string, Internship[]]> = (() => {
    const m = new Map<string, Internship[]>();
    for (const j of jobs) {
      const list = m.get(j.company);
      if (list) list.push(j);
      else m.set(j.company, [j]);
    }
    const rank = (list: Internship[]) =>
      sortBy === "score"
        ? Math.max(...list.map((j) => j.score ?? -1))
        : Math.max(...list.map((j) => j.postedAt ?? j.firstSeen));
    return [...m.entries()].sort((a, b) => rank(b[1]) - rank(a[1]));
  })();

  return (
    <main className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6">
      <header className="mb-5 flex flex-wrap items-center gap-4">
        <Link href="/" className="rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--border-strong)]">
          ← Dashboard
        </Link>
        <h1 className="text-xl font-semibold text-[var(--text)]">Internship Tracker</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-md border px-3 py-2 text-[12px] font-medium transition"
            style={
              showAdd
                ? { borderColor: "var(--accent)", color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)" }
                : { borderColor: "var(--border)", color: "var(--muted)" }
            }
            title="Add a role you found yourself — Instagram, Discord, a referral"
          >
            + Add role
          </button>
          <button
            onClick={() => setSortBy((s) => (s === "recent" ? "score" : "recent"))}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] font-medium text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--accent)]"
            title="Toggle sort order"
          >
            {sortBy === "recent" ? "Newest posted" : "Best fit"}
          </button>
          <button
            onClick={() => setBigTechOnly((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-[12px] font-medium transition ${bigTechOnly ? "border-[var(--accent)]/50 text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}
          >
            {bigTechOnly ? "Big tech only" : "Showing all"}
          </button>
          <button
            onClick={() => {
              markAllSeen();
              load(true);
            }}
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--accent)]"
            title="Refresh now, and clear the “new” markers"
          >
            <RefreshIcon size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {showAdd && (
        <AddRoleForm
          onCancel={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            load(false);
          }}
        />
      )}

      {/* metrics */}
      {data && (
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Big tech" value={data.bigTechCount} accent="var(--text)" />
          <MetricCard label="Applied" value={data.appliedCount} accent={STAGE_COLOR.applied} />
          <MetricCard label="OA" value={data.stageCounts.oa || 0} accent={STAGE_COLOR.oa} />
          <MetricCard label="Interview" value={data.stageCounts.interview || 0} accent={STAGE_COLOR.interview} />
          <MetricCard label="Offers" value={data.stageCounts.offer || 0} accent={STAGE_COLOR.offer} />
          <MetricCard
            label="Worth tailoring"
            value={allJobs.filter((j) => j.worthTailoring && !j.tailoredResume).length}
            accent="var(--accent2)"
          />
        </div>
      )}

      {/* stage filter */}
      {data && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            onClick={() => setFavOnly((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition"
            style={
              favOnly
                ? { borderColor: "var(--warn)", background: "color-mix(in srgb, var(--warn) 14%, transparent)", color: "var(--warn)" }
                : { borderColor: "var(--border)", color: "var(--muted)" }
            }
            title="Show only starred roles"
          >
            ★ Favorites ({favCount})
          </button>
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden((v) => !v)}
              className="rounded-md border px-2.5 py-1 text-[11px] font-medium transition"
              style={
                showHidden
                  ? { borderColor: "var(--accent)", color: "var(--accent)" }
                  : { borderColor: "var(--border)", color: "var(--faint)" }
              }
              title="Roles and companies you've dismissed"
            >
              {showHidden ? "← Back to ledger" : `Hidden (${hiddenCount})`}
            </button>
          )}
          <span className="mx-1 w-px self-stretch bg-[var(--border)]" />
          <button
            onClick={() => setStageFilter("all")}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${stageFilter === "all" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-strong)]"}`}
          >
            All ({data.total})
          </button>
          {STAGES.map((s) => {
            const n = data.stageCounts[s] || 0;
            if (n === 0 && s !== "not_applied") return null;
            return (
              <button
                key={s}
                onClick={() => setStageFilter(s)}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition"
                style={{
                  borderColor: stageFilter === s ? STAGE_COLOR[s] : "var(--border)",
                  background: stageFilter === s ? stageTint(s) : "transparent",
                  color: stageFilter === s ? STAGE_COLOR[s] : "var(--muted)",
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: STAGE_COLOR[s] }} />
                {STAGE_LABEL[s]} ({n})
              </button>
            );
          })}
        </div>
      )}

      {data?.fetcher && (
        <div className="panel mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-2.5 text-[12px]">
          <span className="inline-flex items-center gap-2 text-[var(--text)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--good)]" />
            Watching {data.fetcher.boardCount ?? 0} employer boards
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--muted)]">
            {data.fetcher.report.map((r) => (
              <span key={r.source} title={`${r.found} matching roles on the last pass`}>
                {SOURCE_GROUP[r.source] || r.source}
                <span className="tnum ml-1 text-[var(--faint)]">{r.found}</span>
              </span>
            ))}
          </span>
          {deadCount > 0 && (
            <button
              onClick={() => setShowDead((v) => !v)}
              className="rounded border px-2 py-0.5 text-[11px] transition"
              style={
                showDead
                  ? { borderColor: "color-mix(in srgb, var(--danger) 45%, transparent)", color: "var(--danger)" }
                  : { borderColor: "var(--border)", color: "var(--faint)" }
              }
              title="Postings whose link 404s are hidden from the ledger"
            >
              {showDead ? `showing ${deadCount} dead` : `${deadCount} dead hidden`}
            </button>
          )}
          <span className="ml-auto text-[var(--faint)]">
            {data.fetcher.scanned != null && `${data.fetcher.scanned} matches scanned`}
            {data.fetcher.ms != null && ` in ${(data.fetcher.ms / 1000).toFixed(1)}s`}
            {" · "}
            {data.fetcher.lastRunAt ? `checked ${relAge(Date.parse(data.fetcher.lastRunAt))}` : "starting…"}
            {data.fetcher.lastAdded > 0 && ` · +${data.fetcher.lastAdded} new`}
          </span>
        </div>
      )}

      {data && data.upcomingDeadlines.length > 0 && (
        <div className="panel mb-4 p-3">
          <div className="mb-2 label">Upcoming deadlines</div>
          <div className="flex flex-wrap gap-2">
            {data.upcomingDeadlines.map((d) => {
              const soon = hoursUntil(d.deadlineAt) <= 48;
              return (
                <span
                  key={d.id}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]"
                  style={{ borderColor: soon ? "var(--danger)" : "var(--border-strong)", color: soon ? "var(--danger)" : "var(--text)" }}
                  title={`${d.company} — ${d.role}`}
                >
                  <span className="font-medium">{d.company}</span>
                  {d.deadlineLabel && <span className="text-[var(--faint)]">{d.deadlineLabel}</span>}
                  <span className="tnum">{fmtDeadline(d.deadlineAt)}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {jobs.length === 0 && !loading && (
        <div className="panel grid place-items-center p-12 text-center">
          <div className="text-sm text-[var(--text)]">No {bigTechOnly ? "big-tech " : ""}internships yet.</div>
          <div className="mt-1 max-w-md text-[12px] text-[var(--muted)]">
            The scraper adds Summer 2027 SWE / AI-ML / Data roles as it finds them. Toggle “Showing all” to include smaller companies.
          </div>
        </div>
      )}

      <div className="space-y-2">
        {grouped.map(([company, list]) => {
          const open = expanded[company] ?? false;
          const active = list.filter((j) => j.stage !== "not_applied").length;
          const fresh = list.filter((j) => j.firstSeen > seenAt).length;
          const newest = Math.max(...list.map((j) => j.postedAt ?? j.firstSeen));
          const best = list.reduce<number | null>((m, j) => (j.score != null && (m == null || j.score > m) ? j.score : m), null);
          return (
            <div key={company} className="panel overflow-hidden">
              {/* Company header — click to expand that company's postings */}
              <button
                onClick={() => setExpanded((e) => ({ ...e, [company]: !open }))}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.02]"
                aria-expanded={open}
              >
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className="shrink-0 text-[var(--faint)] transition-transform"
                  style={{ transform: open ? "rotate(90deg)" : "none" }}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className="font-medium text-[var(--text)]">{company}</span>
                <span className="tnum rounded border border-[var(--border)] px-1.5 py-px text-[11px] text-[var(--muted)]">
                  {list.length}
                </span>
                {/* Visible while collapsed, so you can tell at a glance which
                    companies posted something since you last looked. */}
                {fresh > 0 && (
                  <span
                    className="tnum inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-semibold"
                    style={{ background: "color-mix(in srgb, var(--good) 18%, transparent)", color: "var(--good)" }}
                    title={`${fresh} role${fresh === 1 ? "" : "s"} detected since your last refresh`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--good)" }} />
                    {fresh} new
                  </span>
                )}
                {active > 0 && (
                  <span className="tnum rounded px-1.5 py-px text-[11px]" style={{ background: stageTint("applied", 18), color: STAGE_COLOR.applied }}>
                    {active} in progress
                  </span>
                )}
                {best != null && (
                  <span className="tnum text-[11px]" style={{ color: scoreColor(best) }}>
                    best fit {best}
                  </span>
                )}
                {list.some((j) => j.referral) && (
                  <span className="text-[11px]" style={{ color: "var(--good)" }} title="You have a referral at this company">
                    ✓ referral
                  </span>
                )}
                <span className="ml-auto text-[11px] text-[var(--faint)]">
                  latest {relAge(newest)}
                </span>
                {/* Not a nested <button> — that's invalid HTML inside the header
                    button — so this is a span acting as the mute control. */}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    void hideCompany(company, !showHidden);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      e.preventDefault();
                      void hideCompany(company, !showHidden);
                    }
                  }}
                  className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--faint)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
                  title={showHidden ? `Unmute ${company}` : `Mute ${company} — hide all of its roles, now and later`}
                >
                  {showHidden ? "unmute" : "mute"}
                </span>
              </button>

              {open && (
                <div className="border-t border-[var(--border)]">
                  {list.map((j) => (
                    <div key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border)] px-4 py-3 last:border-b-0">
            <select
              value={j.stage}
              onChange={(e) => setStage(j, e.target.value as Stage)}
              className="w-28 shrink-0 cursor-pointer rounded-md border px-2 py-1 text-[11px] font-semibold outline-none transition"
              style={{
                borderColor: `color-mix(in srgb, ${STAGE_COLOR[j.stage]} 55%, transparent)`,
                background: stageTint(j.stage),
                color: STAGE_COLOR[j.stage],
              }}
              title="Application stage"
            >
              {STAGES.map((s) => (
                <option key={s} value={s} className="bg-[#0b0f16] text-[var(--text)]">
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>

            <div className="min-w-[180px] flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--text)]">{j.company}</span>
                {j.manual && (
                  <span
                    className="rounded px-1.5 py-px text-[10px] font-medium"
                    style={{ background: stageTint("applied", 18), color: STAGE_COLOR.applied }}
                    title={j.via ? `Added by you — found via ${j.via}` : "Added by you"}
                  >
                    {j.via || "added by you"}
                  </span>
                )}
                {j.source && !j.manual && (
                  <span
                    className="rounded border border-[var(--border)] px-1.5 py-px text-[10px] text-[var(--faint)]"
                    style={DIRECT_SOURCES.includes(j.source) ? { color: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" } : undefined}
                    title={
                      DIRECT_SOURCES.includes(j.source)
                        ? "Straight from the company's own job board — the earliest possible signal"
                        : "Found via a secondary feed"
                    }
                  >
                    {SOURCE_LABEL[j.source] || j.source}
                  </span>
                )}
              </div>
              <div className="truncate text-[13px] text-[var(--muted)]">{j.role}</div>
            </div>

            {/* Ledger stamp: the employer's publish time when we have it,
                otherwise when Jarvis first saw the role. */}
            <div
              className="w-[124px] shrink-0 leading-tight"
              title={
                (j.postedAt ? `Posted ${fmtStamp(j.postedAt)}` : `No publish time from this source`) +
                `\nDetected by Jarvis ${fmtStamp(j.firstSeen)}` +
                (j.source ? `\nSource: ${SOURCE_LABEL[j.source] || j.source}` : "")
              }
            >
              <div className="tnum text-[12px] text-[var(--text)]">
                {fmtDate(j.postedAt ?? j.firstSeen)}
                <span className="ml-1.5 text-[var(--muted)]">{fmtTime(j.postedAt ?? j.firstSeen)}</span>
              </div>
              <div className="text-[10px] text-[var(--faint)]">
                {j.postedAt ? `posted · ${relAge(j.postedAt)}` : `detected · ${relAge(j.firstSeen)}`}
              </div>
            </div>

            {/* score */}
            <div className="w-32 shrink-0">
              {j.score != null ? (
                <div className="group relative">
                  <div className="flex items-center gap-2">
                    <span className="tnum text-sm font-semibold" style={{ color: scoreColor(j.score) }}>{j.score}</span>
                    <span className="text-[10px] text-[var(--faint)]">/100 fit</span>
                  </div>
                  {j.scoreReason && <div className="truncate text-[10px] text-[var(--faint)]" title={j.scoreReason}>{j.scoreReason}</div>}
                </div>
              ) : data?.aiConfigured ? (
                <button
                  onClick={() => runScore(j)}
                  disabled={!!busy[j.id]}
                  className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--border-strong)] disabled:opacity-40"
                >
                  {busy[j.id] === "score" ? "Scoring…" : "Score fit"}
                </button>
              ) : (
                <span className="text-[11px] text-[var(--faint)]">scoring…</span>
              )}
            </div>

            {/* actions */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => patchJob(j, { favorite: !j.favorite })}
                className="grid h-7 w-7 place-items-center rounded-md border transition"
                style={
                  j.favorite
                    ? { borderColor: "color-mix(in srgb, var(--warn) 50%, transparent)", background: "color-mix(in srgb, var(--warn) 14%, transparent)", color: "var(--warn)" }
                    : { borderColor: "var(--border)", color: "var(--faint)" }
                }
                title={j.favorite ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={j.favorite}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill={j.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
              <button
                onClick={() => toggleReferral(j)}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition"
                style={
                  j.referral
                    ? { borderColor: "color-mix(in srgb, var(--good) 50%, transparent)", background: "color-mix(in srgb, var(--good) 14%, transparent)", color: "var(--good)" }
                    : { borderColor: "var(--border)", color: "var(--faint)" }
                }
                title={j.referral ? "You have a referral for this role" : "Mark that you have a referral for this role"}
                aria-pressed={j.referral}
              >
                {j.referral ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : null}
                Referral
              </button>
              <button
                onClick={() => setDeadlineEditor(j)}
                className="rounded-md border px-2 py-1 text-[11px] transition"
                style={{ borderColor: j.deadlineAt ? "var(--warn)" : "var(--border)", color: j.deadlineAt ? "var(--warn)" : "var(--muted)" }}
                title={j.deadlineAt ? "Edit deadline" : "Set an OA/interview deadline"}
              >
                {j.deadlineAt ? `⏰ ${fmtDeadline(j.deadlineAt)}` : "+ Deadline"}
              </button>
              {/* recommendation marker — tailoring never runs automatically */}
              {j.worthTailoring && !j.tailoredResume && (
                <span className="rounded-md border border-[var(--accent2)]/40 px-2 py-1 text-[10px] font-medium text-[var(--accent2)]" title="Good fit — worth tailoring your résumé for this one. Nothing runs until you ask.">
                  ★ worth tailoring
                </span>
              )}
              {j.tailoredResume ? (
                <button onClick={() => setViewTex(j)} className="rounded-md bg-[var(--good)]/15 px-2.5 py-1 text-[11px] font-medium text-[var(--good)] transition hover:bg-[var(--good)]/25" title="Preview the tailored résumé as a PDF">
                  View PDF
                </button>
              ) : (
                <button
                  onClick={() => runTailor(j)}
                  disabled={!!busy[j.id]}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
                    j.worthTailoring
                      ? "bg-[var(--accent2)]/18 text-[var(--accent2)] hover:bg-[var(--accent2)]/28"
                      : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent2)] hover:border-[var(--border-strong)]"
                  }`}
                  title="Tailor your résumé for this role and save it to the submit folder"
                >
                  {busy[j.id] === "tailor" ? "Tailoring…" : "Tailor now"}
                </button>
              )}
              {j.manual && j.manualId ? (
                <button
                  onClick={() => removeManual(j)}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--faint)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
                  title="Delete this hand-added role"
                >
                  ✕
                </button>
              ) : (
                <button
                  onClick={() => patchJob(j, { hidden: !j.hidden })}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--faint)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                  title={j.hidden ? "Restore this role to the ledger" : "Hide this role — you don't care about it"}
                >
                  {j.hidden ? "Restore" : "Hide"}
                </button>
              )}
              {j.linkVerdict === "dead" ? (
                // The original link is gone — send them somewhere useful instead
                // of handing over a URL we know 404s.
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${j.company} ${j.role} apply`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border px-2.5 py-1 text-[11px] transition"
                  style={{ borderColor: "color-mix(in srgb, var(--danger) 45%, transparent)", color: "var(--danger)" }}
                  title="This posting's link is dead (404 or 'job not found'). Search for it instead."
                >
                  Dead · search ↗
                </a>
              ) : j.url ? (
                <a
                  href={j.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border px-2.5 py-1 text-[11px] transition hover:border-[var(--border-strong)]"
                  style={
                    j.linkVerdict === "ok"
                      ? { borderColor: "var(--border)", color: "var(--muted)" }
                      : { borderColor: "var(--border)", color: "var(--faint)" }
                  }
                  title={
                    j.linkVerdict === "ok"
                      ? "Link checked and working"
                      : j.linkVerdict === "blocked"
                        ? "Couldn't verify — the careers site blocks automated checks, so this may or may not still be open"
                        : "Not verified yet"
                  }
                >
                  {j.linkVerdict === "ok" ? "Apply ↗" : "Apply ?"}
                </a>
              ) : (
                <span className="text-[11px] text-[var(--faint)]">no link</span>
              )}
            </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {savedFile && (
        <div
          className="panel fixed bottom-5 right-5 z-50 flex max-w-md items-center gap-3 px-4 py-3 text-[13px]"
          style={{ borderColor: "color-mix(in srgb, var(--good) 45%, transparent)" }}
        >
          <span style={{ color: "var(--good)" }}>✓</span>
          <span className="min-w-0">
            <span className="text-[var(--text)]">Saved to “submit resumes”</span>
            <span className="mono block truncate text-[11px] text-[var(--faint)]">{savedFile}</span>
          </span>
          <button onClick={() => setSavedFile(null)} className="ml-auto text-[var(--muted)] hover:text-[var(--text)]">
            ✕
          </button>
        </div>
      )}

      {deadlineEditor && (
        <DeadlineEditor
          job={deadlineEditor}
          onCancel={() => setDeadlineEditor(null)}
          onClear={() => saveDeadline(deadlineEditor, null, null)}
          onSave={(at, label) => saveDeadline(deadlineEditor, at, label)}
        />
      )}

      {viewTex && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setViewTex(null)}>
          <div className="panel flex max-h-[92vh] w-full max-w-4xl flex-col p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text)]">Tailored résumé — {viewTex.company}</h3>
              <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--faint)]">{viewTex.role}</span>
              <a
                href={`/api/internships/pdf?id=${encodeURIComponent(viewTex.id)}&download=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)]"
              >
                Download PDF
              </a>
              <button
                onClick={() => navigator.clipboard.writeText(viewTex.tailoredResume || "")}
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)]"
              >
                Copy LaTeX
              </button>
              {data?.tailoringInstant && (
                <button
                  onClick={async () => {
                    const jb = viewTex;
                    setViewTex(null);
                    await runTailor(jb);
                  }}
                  className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--accent2)]"
                  title="Regenerate the tailored résumé"
                >
                  Re-tailor
                </button>
              )}
              <button onClick={() => setViewTex(null)} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
            </div>
            {data?.pdfAvailable ? (
              <iframe
                src={`/api/internships/pdf?id=${encodeURIComponent(viewTex.id)}`}
                className="min-h-[68vh] flex-1 rounded-lg border border-[var(--border)] bg-white"
                title={`Tailored résumé for ${viewTex.company}`}
              />
            ) : (
              <pre className="scroll-thin flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-[var(--text)]/90">
                {viewTex.tailoredResume}
              </pre>
            )}
            <div className="mt-2 text-[10px] text-[var(--faint)]">Facts unchanged — only keywords &amp; emphasis tailored. Compiled locally with tectonic; the first render takes a couple seconds.</div>
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * Manual entry for roles no feed can reach — an Instagram page like zero2sudo,
 * a Discord drop, a recruiter DM. Stored separately from scraped roles so a
 * scraper pass can never overwrite or prune them.
 */
function AddRoleForm({ onCancel, onAdded }: { onCancel: () => void; onAdded: () => void }) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [url, setUrl] = useState("");
  const [via, setVia] = useState("zero2sudo IG");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const [postedAt, setPostedAt] = useState<string | undefined>();
  const [location, setLocation] = useState<string | undefined>();

  /** Pull the real title/company/date straight from the employer's ATS. */
  async function resolve(link: string) {
    if (!link.trim()) return;
    setResolving(true);
    setErr(null);
    setResolved(null);
    try {
      const res = await fetch("/api/internships/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const j = await res.json();
      if (j.ok) {
        setCompany(j.job.company || "");
        setRole(j.job.role || "");
        setUrl(j.job.url || link);
        setLocation(j.job.location);
        setPostedAt(j.job.postedAt);
        setResolved(j.job.ats ? `read from ${j.job.ats}` : "read from page");
      } else {
        setErr(j.error || "Couldn't read that link — fill it in manually.");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setResolving(false);
    }
  }

  async function save() {
    if (!company.trim() || !role.trim()) {
      setErr("Company and role are required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/internships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add: { company, role, url, via, location, postedAt } }),
      });
      const j = await res.json();
      if (j.ok) onAdded();
      else setErr(j.error || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const field = "rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]";

  return (
    <div className="panel mb-4 p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="panel-title">Add a role you found</span>
        <span className="text-[11px] text-[var(--faint)]">
          for postings the scrapers can&apos;t see — Instagram, Discord, referrals
        </span>
        <button onClick={onCancel} className="ml-auto text-[var(--muted)] transition hover:text-[var(--text)]">
          ✕
        </button>
      </div>

      {/* Paste-a-link first: the fastest path from a zero2sudo post to a
          tracked role, since the ATS knows the real title and posting date. */}
      <div className="mb-2 flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/^https?:\/\//i.test(text)) setTimeout(() => resolve(text), 0);
          }}
          onKeyDown={(e) => e.key === "Enter" && resolve(url)}
          placeholder="Paste the apply link — Jarvis fills in the rest"
          className={`${field} min-w-[320px] flex-1`}
        />
        <button
          onClick={() => resolve(url)}
          disabled={resolving || !url.trim()}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:opacity-40"
        >
          {resolving ? "Reading…" : "Read link"}
        </button>
        {resolved && (
          <span className="self-center text-[11px]" style={{ color: "var(--good)" }}>
            ✓ {resolved}
            {postedAt ? ` · posted ${new Date(postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company *" className={`${field} w-40`} />
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role *" className={`${field} min-w-[240px] flex-1`} />
        <input value={via} onChange={(e) => setVia(e.target.value)} placeholder="Found via" className={`${field} w-40`} title="Where you saw it" />
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-[12px] font-medium text-[#0b0b0d] transition disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
      {err && <div className="mt-2 text-[12px] text-[var(--danger)]">{err}</div>}
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="panel px-3.5 py-2.5">
      <div className="tnum text-2xl font-semibold" style={{ color: accent }}>{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function DeadlineEditor({
  job,
  onCancel,
  onClear,
  onSave,
}: {
  job: Internship;
  onCancel: () => void;
  onClear: () => void;
  onSave: (deadlineAt: number, deadlineLabel: string) => void;
}) {
  const initial = job.deadlineAt ? new Date(job.deadlineAt) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const [dateStr, setDateStr] = useState(initial ? `${initial.getFullYear()}-${pad(initial.getMonth() + 1)}-${pad(initial.getDate())}` : "");
  const [timeStr, setTimeStr] = useState(initial ? `${pad(initial.getHours())}:${pad(initial.getMinutes())}` : "23:59");
  const [label, setLabel] = useState(job.deadlineLabel || "OA due");

  function save() {
    if (!dateStr) return;
    const at = new Date(`${dateStr}T${timeStr || "23:59"}`).getTime();
    if (Number.isNaN(at)) return;
    onSave(at, label.trim().slice(0, 60));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onCancel}>
      <div className="panel w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">
          Deadline — {job.company}
        </h3>
        <div className="space-y-2.5">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. OA due, Final round"
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="w-28 rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {job.deadlineAt && (
            <button onClick={onClear} className="rounded-md border border-[var(--danger)]/40 px-2.5 py-1.5 text-[12px] text-[var(--danger)] transition hover:bg-[var(--danger)]/10">
              Clear
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={onCancel} className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-[var(--muted)]">
              Cancel
            </button>
            <button onClick={save} disabled={!dateStr} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-[#05080f] transition disabled:opacity-40">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
