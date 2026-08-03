"use client";

import { Panel } from "@/components/Panel";
import { Gauge } from "@/components/Gauge";
import { ChipIcon } from "@/components/icons";
import { usePoll } from "@/lib/usePoll";
import { formatTokens } from "@/lib/format";
import type { UsageSummary } from "@/lib/claudeUsage";
import type { OfficialUsage } from "@/lib/officialUsage";
import { useEffect, useState } from "react";

const FIVE_H_MS = 5 * 60 * 60 * 1000;

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "0:00:00";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function levelColor(pct: number): string {
  if (pct >= 85) return "var(--danger)";
  if (pct >= 60) return "var(--warn)";
  return "var(--accent)";
}

function MiniBar({ label, pct, color, right }: { label: string; pct: number; color: string; right: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-[var(--muted)]">{label}</span>
        <span className="tnum text-[12px] text-[var(--text)]">{right}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </div>
    </div>
  );
}

export function SessionLimitWidget() {
  const { data } = usePoll<UsageSummary>("/api/claude-usage", 10000);
  const { data: official } = usePoll<OfficialUsage>("/api/usage-limit", 60000);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const session = data?.session;
  const plan = data?.plan || "Claude";
  const officialOk = official?.available === true;
  const fiveHour = officialOk ? official.fiveHour : null;
  const sevenDay = officialOk ? official.sevenDay : null;
  const sessionActive = !!(session?.active && (session.resetsAt == null || !nowMs || nowMs < session.resetsAt));

  // With official data → real usage %. Without → a TIME gauge (ring = elapsed,
  // center = countdown). Never a percentage that implies "limit used".
  let ringPct = 0;
  let ringColor = "var(--accent)";
  let centerMain = "5:00:00";
  let centerSub = "ready";
  let resetMs: number | null = null;

  if (officialOk && fiveHour?.usedPct != null) {
    ringPct = fiveHour.usedPct;
    ringColor = levelColor(ringPct);
    centerMain = `${Math.round(ringPct)}%`;
    centerSub = "5h used";
    resetMs = fiveHour.resetsAt;
  } else if (sessionActive && session?.startedAt && session.resetsAt) {
    ringPct = Math.max(0, Math.min(100, ((nowMs - session.startedAt) / FIVE_H_MS) * 100));
    resetMs = session.resetsAt;
    centerMain = nowMs ? fmtCountdown(session.resetsAt - nowMs) : "—:—:—";
    centerSub = "until reset";
  }

  return (
    <Panel
      title="Session Window"
      icon={<ChipIcon size={16} />}
      className="lg:col-span-7"
      right={
        <span className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">{plan}</span>
      }
    >
      {!data && <div className="text-sm text-[var(--muted)]">Reading session…</div>}
      {data && (
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <Gauge pct={ringPct} color={ringColor} size={176}>
            <div className="tnum text-[24px] font-semibold leading-none text-[var(--text)] ">{centerMain}</div>
            <div className="mt-1 label">{centerSub}</div>
          </Gauge>

          <div className="min-w-0 flex-1 w-full space-y-3.5">
            <div>
              <div className="label">
                {officialOk ? "5-hour limit resets in" : sessionActive ? "Session resets in" : "Next window"}
              </div>
              <div className="tnum text-2xl font-semibold text-[var(--text)]">
                {resetMs && nowMs ? fmtCountdown(resetMs - nowMs) : officialOk ? "—" : "starts on next use"}
              </div>
              {resetMs && <div className="text-[11px] text-[var(--muted)]">at {fmtClock(resetMs)}</div>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-[var(--border)] px-3 py-2">
                <div className="label">Used this session</div>
                <div className="tnum mt-0.5 text-lg font-semibold text-[var(--text)]">
                  {sessionActive ? session.messages.toLocaleString() : 0} <span className="text-[12px] font-normal text-[var(--muted)]">msgs</span>
                </div>
                <div className="tnum text-[11px] text-[var(--muted)]">{formatTokens(sessionActive ? session.tokens : 0)} tokens</div>
              </div>
              <div className="rounded-lg border border-[var(--border)] px-3 py-2">
                <div className="label">Used this week</div>
                <div className="tnum mt-0.5 text-lg font-semibold text-[var(--text)]">
                  {(data.week?.messages ?? 0).toLocaleString()} <span className="text-[12px] font-normal text-[var(--muted)]">msgs</span>
                </div>
                <div className="tnum text-[11px] text-[var(--muted)]">{formatTokens(data.week?.tokens ?? 0)} tokens</div>
              </div>
            </div>

            {officialOk && sevenDay?.usedPct != null && (
              <MiniBar label="Weekly limit used" pct={sevenDay.usedPct} color={levelColor(sevenDay.usedPct)} right={`${Math.round(sevenDay.usedPct)}%`} />
            )}

            <div className="text-[10px] leading-relaxed text-[var(--faint)]">
              {officialOk
                ? "Exact — read live from Claude's own usage data (matches /usage)."
                : "Real usage from your local logs. Anthropic doesn't expose the exact cap, so this shows what you've actually used and when the 5-hour window resets — not a % of your limit."}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
