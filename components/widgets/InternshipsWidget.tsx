"use client";

import Link from "next/link";
import { Panel } from "@/components/Panel";
import { usePoll } from "@/lib/usePoll";

const BriefcaseIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
  </svg>
);

type Internship = { id: string; company: string; role: string; bigTech: boolean; applied: boolean; score: number | null; worthTailoring: boolean | null };
type Resp = { internships: Internship[]; total: number; bigTechCount: number; appliedCount: number; scraperConnected: boolean; detectedCount: number };

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white/[0.015] px-3.5 py-2.5">
      <div className="tnum text-2xl font-semibold" style={{ color: accent || "var(--text)" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">{label}</div>
    </div>
  );
}

export function InternshipsWidget() {
  const { data } = usePoll<Resp>("/api/internships?all=0", 15000);
  const top = (data?.internships || []).slice(0, 5);
  const worth = (data?.internships || []).filter((i) => i.worthTailoring).length;

  return (
    <Panel
      title="Internships"
      icon={<BriefcaseIcon size={16} />}
      accent="var(--good)"
      className="lg:col-span-12"
      right={
        <Link href="/internships" className="text-[12px] font-medium text-[var(--accent)] hover:underline">
          Open tracker →
        </Link>
      }
    >
      {!data && <div className="text-sm text-[var(--muted)]">Loading…</div>}
      {data && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="grid grid-cols-4 gap-2.5 lg:w-[420px] lg:shrink-0">
            <Stat label="Big tech" value={data.bigTechCount} accent="var(--accent)" />
            <Stat label="Applied" value={data.appliedCount} accent="var(--good)" />
            <Stat label="Worth tailoring" value={worth} accent="var(--accent2)" />
            <Stat label="All roles" value={data.total} />
          </div>
          <div className="min-w-0 flex-1">
            {top.length > 0 ? (
              <div className="space-y-1">
                {top.map((j) => (
                  <Link key={j.id} href="/internships" className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.025]">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${j.applied ? "bg-[var(--good)]" : "bg-[var(--warn)]"}`} />
                    <span className="w-32 shrink-0 truncate text-[13px] font-medium text-[var(--text)]">{j.company}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--muted)]">{j.role}</span>
                    {j.score != null && <span className="tnum shrink-0 text-[12px] text-[var(--accent)]">{j.score}</span>}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-[var(--muted)]">
                Watching the live trackers — new big-tech roles land here within minutes of posting.
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
