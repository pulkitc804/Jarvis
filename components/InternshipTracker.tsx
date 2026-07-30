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
  firstSeen: number;
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

  // Initial load forces a live tracker fetch; then auto-refresh every 20s so new
  // roles appear without touching anything.
  useEffect(() => {
    load(true);
    const t = setInterval(() => load(false), 20000);
    return () => clearInterval(t);
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
        if (j.mode === "queued") {
          // optimistic: show "requested" until the scraper fills in the résumé
          setData((d) => (d ? { ...d, internships: d.internships.map((x) => (x.id === job.id ? { ...x, tailorRequested: true } : x)) } : d));
        } else {
          load();
        }
      } else alert(j.error || "Tailoring failed");
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[job.id];
        return n;
      });
    }
  }

  const allJobs = data?.internships || [];
  const jobs = allJobs
    .filter((j) => stageFilter === "all" || j.stage === stageFilter)
    .slice()
    .sort((a, b) => (sortBy === "score" ? (b.score ?? -1) - (a.score ?? -1) : 0));

  return (
    <main className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6">
      <header className="mb-5 flex flex-wrap items-center gap-4">
        <Link href="/" className="rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--border-strong)]">
          ← Dashboard
        </Link>
        <h1 className="text-xl font-semibold text-[var(--text)]">Internship Tracker</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setSortBy((s) => (s === "recent" ? "score" : "recent"))}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] font-medium text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--accent)]"
            title="Toggle sort order"
          >
            {sortBy === "recent" ? "Newest first" : "Best fit first"}
          </button>
          <button
            onClick={() => setBigTechOnly((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-[12px] font-medium transition ${bigTechOnly ? "border-[var(--accent)]/50 text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}
          >
            {bigTechOnly ? "Big tech only" : "Showing all"}
          </button>
          <button onClick={() => load(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--accent)]" title="Refresh — fetch the trackers now">
            <RefreshIcon size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

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

      {data && (
        <div className="panel mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 p-3 text-[12px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--good)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--good)]" /> Live
          </span>
          Jarvis fetches the top community trackers every few minutes — new big-tech roles land here within minutes of posting.
          <span className="text-[var(--faint)]">
            {data.detectedCount > 0 && `${data.detectedCount} detected free · `}
            scraper adds fit scores {data.scraperConnected ? "3× a day" : "when it next runs"}.
          </span>
        </div>
      )}

      {data && data.upcomingDeadlines.length > 0 && (
        <div className="panel mb-4 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Upcoming deadlines</div>
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
        {jobs.map((j) => (
          <div key={j.id} className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
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
                {j.bigTech && <span className="rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)]">big tech</span>}
              </div>
              <div className="truncate text-[13px] text-[var(--muted)]">{j.role}</div>
            </div>

            <div className="w-16 shrink-0 text-[11px] text-[var(--faint)]" title="First detected">
              {fmtDate(j.firstSeen)}
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
              ) : j.tailorRequested ? (
                <span className="rounded-md border border-[var(--warn)]/40 px-2 py-1 text-[10px] font-medium text-[var(--warn)]" title="Requested — the scraper tailors it on its next run, then it appears here as a PDF">
                  Tailoring requested…
                </span>
              ) : (
                <button
                  onClick={() => runTailor(j)}
                  disabled={!!busy[j.id]}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
                    j.worthTailoring
                      ? "bg-[var(--accent2)]/18 text-[var(--accent2)] hover:bg-[var(--accent2)]/28"
                      : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent2)] hover:border-[var(--border-strong)]"
                  }`}
                  title={data?.tailoringInstant ? "Tailor your résumé for this role now" : "Request a tailored résumé — the scraper generates it on its next run"}
                >
                  {busy[j.id] === "tailor" ? (data?.tailoringInstant ? "Tailoring…" : "Requesting…") : data?.tailoringInstant ? "Tailor now" : "Tailor this"}
                </button>
              )}
              {j.url && (
                <a href={j.url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--border-strong)]">
                  Apply ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

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

function MetricCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="panel px-3.5 py-2.5">
      <div className="tnum text-2xl font-semibold" style={{ color: accent }}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">{label}</div>
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
