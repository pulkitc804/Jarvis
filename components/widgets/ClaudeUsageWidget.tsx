"use client";

import { Panel } from "@/components/Panel";
import { ActivityIcon, RefreshIcon } from "@/components/icons";
import { usePoll } from "@/lib/usePoll";
import { formatTokens, formatUSD, relativeTime } from "@/lib/format";
import type { UsageSummary } from "@/lib/claudeUsage";
import { useEffect, useState } from "react";

const FAMILY_COLOR: Record<string, string> = {
  fable: "#c084fc",
  opus: "#3ce0ff",
  sonnet: "#7c93ff",
  haiku: "#46e08a",
  unknown: "#56697e",
};

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white/[0.015] px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">{label}</div>
      <div className="tnum mt-1 text-2xl font-semibold" style={{ color: accent || "var(--text)" }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

function DailyChart({ daily }: { daily: UsageSummary["daily"] }) {
  const max = Math.max(...daily.map((d) => d.costUSD), 0.0001);
  const W = 100;
  const gap = 0.6;
  const bw = (W - gap * (daily.length - 1)) / daily.length;
  return (
    <div className="mt-1">
      <svg viewBox={`0 0 ${W} 30`} preserveAspectRatio="none" className="h-24 w-full overflow-visible">
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3ce0ff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#3ce0ff" stopOpacity="0.28" />
          </linearGradient>
        </defs>
        {daily.map((d, i) => {
          const h = Math.max((d.costUSD / max) * 28, d.costUSD > 0 ? 1.2 : 0.5);
          const x = i * (bw + gap);
          const today = i === daily.length - 1;
          return (
            <rect
              key={d.date}
              x={x}
              y={30 - h}
              width={bw}
              height={h}
              rx={0.6}
              fill={today ? "#7c93ff" : "url(#barGrad)"}
              opacity={d.costUSD > 0 ? 1 : 0.35}
            >
              <title>{`${d.date}: ${formatUSD(d.costUSD)} · ${formatTokens(d.tokens)} tok`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--faint)]">
        <span>{daily[0]?.date.slice(5)}</span>
        <span>30-day spend · hover a bar</span>
        <span>today</span>
      </div>
    </div>
  );
}

function Bar({ label, value, max, color, right }: { label: string; value: number; max: number; color: string; right: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div className="group">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] text-[var(--text)]">{label}</span>
        <span className="tnum shrink-0 text-[12px] text-[var(--muted)]">{right}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function ClaudeUsageWidget() {
  const { data, error, loading, lastUpdated, refresh } = usePoll<UsageSummary>("/api/claude-usage", 20000);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <Panel
      title="Cost & Tokens"
      icon={<ActivityIcon size={16} />}
      className="lg:col-span-7"
      right={
        <button
          onClick={refresh}
          className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--border-strong)]"
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshIcon size={13} className={loading ? "animate-spin" : ""} />
        </button>
      }
    >
      {error && <div className="text-sm text-[var(--danger)]">Couldn&apos;t read usage logs: {error}</div>}
      {!data && !error && <div className="text-sm text-[var(--muted)]">Reading local Claude logs…</div>}

      {data && (
        <div className="flex h-full flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Stat label="Today" value={formatUSD(data.today.costUSD)} sub={`${data.today.messages} msgs`} accent="var(--accent)" />
            <Stat label="Last 7 days" value={formatUSD(data.last7DaysCostUSD)} sub={`${formatUSD(data.last30DaysCostUSD)} / 30d`} />
            <Stat label="All-time" value={formatUSD(data.totals.costUSD)} sub={`${data.totals.sessions} sessions`} />
            <Stat label="Tokens" value={formatTokens(data.totals.totalTokens)} sub={`${formatTokens(data.totals.cacheReadTokens)} cached`} accent="var(--accent2)" />
          </div>

          <DailyChart daily={data.daily} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 pt-1">
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">By model</div>
              <div className="space-y-2.5">
                {data.byModel.slice(0, 4).map((m) => (
                  <Bar
                    key={m.model}
                    label={m.model.replace("claude-", "")}
                    value={m.costUSD}
                    max={data.byModel[0]?.costUSD || 1}
                    color={FAMILY_COLOR[m.family] || FAMILY_COLOR.unknown}
                    right={formatUSD(m.costUSD)}
                  />
                ))}
                {data.byModel.length === 0 && <div className="text-[13px] text-[var(--muted)]">No usage recorded yet.</div>}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">Top projects</div>
              <div className="space-y-2.5">
                {data.byProject.slice(0, 4).map((p) => (
                  <Bar
                    key={p.project}
                    label={p.project}
                    value={p.costUSD}
                    max={data.byProject[0]?.costUSD || 1}
                    color="#7c93ff"
                    right={formatUSD(p.costUSD)}
                  />
                ))}
                {data.byProject.length === 0 && <div className="text-[13px] text-[var(--muted)]">No projects yet.</div>}
              </div>
            </div>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--border)] pt-3 text-[10px] text-[var(--faint)]">
            <span title={data.meta.rates} className="cursor-help">
              Computed from <span className="tnum text-[var(--muted)]">{data.meta.files}</span> local log files ·{" "}
              <span className="tnum text-[var(--muted)]">{data.meta.records.toLocaleString()}</span> records
            </span>
            <span className="ml-auto">{lastUpdated ? `updated ${relativeTime(lastUpdated)}` : "…"}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
