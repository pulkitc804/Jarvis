"use client";

import { Panel } from "@/components/Panel";
import { usePoll } from "@/lib/usePoll";

const SparkIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
);

type Digest = {
  newRoles: number;
  bigTechNewRoles: number;
  applications: { total: number; thisWeek: number };
  stageMoves: { oa: number; interview: number; offer: number; rejected: number };
  upcomingDeadlines: unknown[];
  tasks: { completedThisWeek: number; openTotal: number };
  session: { fiveHourPct: number | null; weeklyPct: number | null };
  text: string;
};

function Metric({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white/[0.015] px-3.5 py-2.5">
      <div className="tnum text-2xl font-semibold" style={{ color: accent || "var(--text)" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">{label}</div>
    </div>
  );
}

export function DigestWidget() {
  const { data } = usePoll<Digest>("/api/digest", 60000);

  return (
    <Panel title="This Week" icon={<SparkIcon size={16} />} accent="var(--accent2)" className="lg:col-span-12">
      {!data && <div className="text-sm text-[var(--muted)]">Loading…</div>}
      {data && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Metric label="New roles" value={data.newRoles} accent="var(--accent)" />
            <Metric label="Applied" value={data.applications.thisWeek} accent="var(--good)" />
            <Metric
              label="Moved forward"
              value={data.stageMoves.oa + data.stageMoves.interview + data.stageMoves.offer}
              accent="var(--accent2)"
            />
            <Metric label="Tasks done" value={data.tasks.completedThisWeek} />
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--muted)]">{data.text}</p>
        </div>
      )}
    </Panel>
  );
}
