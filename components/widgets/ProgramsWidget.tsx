"use client";

import Link from "next/link";
import { Panel } from "@/components/Panel";
import { usePoll } from "@/lib/usePoll";

const AwardIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="6" />
    <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
  </svg>
);

type Program = {
  id: string;
  company: string;
  role: string;
  stage: string;
  postedAt: number | null;
  firstSeen: number;
};
type Resp = { internships: Program[]; total: number; f500Count: number; appliedCount: number };

function relAge(ms: number) {
  const h = Math.round((Date.now() - ms) / 3_600_000);
  if (h < 24) return `${Math.max(h, 1)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white/[0.015] px-3.5 py-2.5">
      <div className="tnum text-2xl font-semibold" style={{ color: accent || "var(--text)" }}>{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

export function ProgramsWidget() {
  const { data } = usePoll<Resp>("/api/internships?kind=program&all=0", 30000);
  const top = (data?.internships || []).slice(0, 5);

  return (
    <Panel
      title="Fellowships & Programs"
      icon={<AwardIcon size={16} />}
      accent="var(--accent2)"
      className="lg:col-span-12"
      right={
        <Link href="/programs" className="text-[12px] font-medium text-[var(--accent)] hover:underline">
          Open →
        </Link>
      }
    >
      {!data && <div className="text-sm text-[var(--muted)]">Loading…</div>}
      {data && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="grid grid-cols-3 gap-2.5 lg:w-[320px] lg:shrink-0">
            <Stat label="Open" value={data.total} accent="var(--accent2)" />
            <Stat label="Fortune 500" value={data.f500Count} />
            <Stat label="Applied" value={data.appliedCount} accent="var(--good)" />
          </div>
          <div className="min-w-0 flex-1">
            {top.length > 0 ? (
              <div className="space-y-1">
                {top.map((p) => (
                  <Link key={p.id} href="/programs" className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.025]">
                    <span className="w-32 shrink-0 truncate text-[13px] font-medium text-[var(--text)]">{p.company}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--muted)]">{p.role}</span>
                    <span className="shrink-0 text-[11px] text-[var(--faint)]">{relAge(p.postedAt ?? p.firstSeen)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-[var(--muted)]">
                Watching for fellowships, first/second-year programs and insight days across the same boards.
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
