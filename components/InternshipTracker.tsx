"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshIcon } from "@/components/icons";

type Internship = {
  id: string;
  company: string;
  role: string;
  url: string;
  location?: string;
  bigTech: boolean;
  applied: boolean;
  appliedAt: number | null;
  firstSeen: number;
  score: number | null;
  worthTailoring: boolean | null;
  scoreReason: string | null;
  tailoredResume: string | null;
  notes: string;
};
type Resp = {
  internships: Internship[];
  total: number;
  bigTechCount: number;
  appliedCount: number;
  scraperConnected: boolean;
};

function scoreColor(s: number): string {
  if (s >= 75) return "var(--good)";
  if (s >= 50) return "var(--warn)";
  return "var(--danger)";
}
function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function InternshipTracker() {
  const [data, setData] = useState<Resp | null>(null);
  const [bigTechOnly, setBigTechOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, "score" | "tailor">>({});
  const [viewTex, setViewTex] = useState<Internship | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/internships?all=${bigTechOnly ? 0 : 1}`, { cache: "no-store" });
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [bigTechOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleApplied(job: Internship) {
    setData((d) => (d ? { ...d, internships: d.internships.map((j) => (j.id === job.id ? { ...j, applied: !j.applied } : j)) } : d));
    await fetch("/api/internships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, applied: !job.applied }),
    });
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
      if (j.ok) load();
      else alert(j.error || "Tailoring failed");
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[job.id];
        return n;
      });
    }
  }

  const jobs = data?.internships || [];

  return (
    <main className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6">
      <header className="mb-5 flex flex-wrap items-center gap-4">
        <Link href="/" className="rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--border-strong)]">
          ← Dashboard
        </Link>
        <h1 className="text-xl font-semibold text-[var(--text)]">Internship Tracker</h1>
        {data && (
          <span className="text-[12px] text-[var(--muted)]">
            <span className="text-[var(--accent)]">{data.bigTechCount}</span> big-tech · {data.appliedCount} applied · {data.total} total
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setBigTechOnly((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-[12px] font-medium transition ${bigTechOnly ? "border-[var(--accent)]/50 text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}
          >
            {bigTechOnly ? "Big tech only" : "Showing all"}
          </button>
          <button onClick={load} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--accent)]" title="Refresh">
            <RefreshIcon size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {data && !data.scraperConnected && (
        <div className="panel mb-4 p-4 text-[13px] text-[var(--muted)]">
          Waiting on the scraper — your <span className="text-[var(--text)]">summer-2027-internship-detector</span> task writes new roles to{" "}
          <code className="text-[var(--accent)]">seen_jobs.json</code> up to 3× a day. Roles appear here automatically as it runs.
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
            <button
              onClick={() => toggleApplied(j)}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-md border transition"
              style={{ borderColor: j.applied ? "var(--good)" : "var(--border-strong)", background: j.applied ? "var(--good)" : "transparent" }}
              title={j.applied ? "Applied" : "Mark applied"}
            >
              {j.applied && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#05080f" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              )}
            </button>

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
              ) : (
                <button
                  onClick={() => runScore(j)}
                  disabled={!!busy[j.id]}
                  className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--border-strong)] disabled:opacity-40"
                >
                  {busy[j.id] === "score" ? "Scoring…" : "Score fit"}
                </button>
              )}
            </div>

            {/* actions */}
            <div className="flex shrink-0 items-center gap-2">
              {j.worthTailoring && !j.tailoredResume && (
                <button
                  onClick={() => runTailor(j)}
                  disabled={!!busy[j.id]}
                  className="rounded-md bg-[var(--accent2)]/18 px-2.5 py-1 text-[11px] font-medium text-[var(--accent2)] transition hover:bg-[var(--accent2)]/28 disabled:opacity-40"
                  title="Generate a tailored resume for this role"
                >
                  {busy[j.id] === "tailor" ? "Tailoring…" : "Tailor résumé"}
                </button>
              )}
              {j.tailoredResume && (
                <button onClick={() => setViewTex(j)} className="rounded-md bg-[var(--good)]/15 px-2.5 py-1 text-[11px] font-medium text-[var(--good)] transition hover:bg-[var(--good)]/25">
                  View résumé
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

      {viewTex && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setViewTex(null)}>
          <div className="panel flex max-h-[85vh] w-full max-w-3xl flex-col p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3">
              <h3 className="text-sm font-semibold text-[var(--text)]">Tailored résumé — {viewTex.company}</h3>
              <button
                onClick={() => navigator.clipboard.writeText(viewTex.tailoredResume || "")}
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--accent)]"
              >
                Copy LaTeX
              </button>
              <button onClick={() => setViewTex(null)} className="ml-auto text-[var(--muted)] hover:text-[var(--text)]">✕</button>
            </div>
            <pre className="scroll-thin flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-[var(--text)]/90">
              {viewTex.tailoredResume}
            </pre>
            <div className="mt-2 text-[10px] text-[var(--faint)]">Paste into your LaTeX editor (Overleaf) and compile. Facts unchanged — only keywords/emphasis tailored.</div>
          </div>
        </div>
      )}
    </main>
  );
}
