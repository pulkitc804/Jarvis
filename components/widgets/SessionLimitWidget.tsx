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
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
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
  const [nowMs, setNowMs] = useState<number>(() => 0);

  // tick every second for a live countdown
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const session = data?.session;
  const plan = data?.plan || "Claude";
  const officialOk = official?.available === true;
  const fiveHour = officialOk ? official.fiveHour : null;

  // Headline ring: official 5h utilization if we have it, else time elapsed in the window.
  let ringPct = 0;
  let ringColor = "var(--accent)";
  let centerMain = "—";
  let centerSub = "no active session";
  let resetMs: number | null = null;

  if (officialOk && fiveHour?.usedPct != null) {
    ringPct = fiveHour.usedPct;
    ringColor = levelColor(ringPct);
    centerMain = `${Math.round(ringPct)}%`;
    centerSub = "5h limit used";
    resetMs = fiveHour.resetsAt;
  } else if (session?.active && session.startedAt && session.resetsAt) {
    const elapsed = nowMs ? nowMs - session.startedAt : 0;
    ringPct = (elapsed / FIVE_H_MS) * 100;
    ringColor = "var(--accent)";
    resetMs = session.resetsAt;
    centerMain = `${Math.round(ringPct)}%`;
    centerSub = "of window";
  } else {
    ringPct = 0;
    centerMain = "0%";
    centerSub = "window ready";
  }

  const remainingMs = resetMs && nowMs ? resetMs - nowMs : null;
  // honest reference: this session vs your own busiest 5h window
  const peakPct = session && session.peakTokens > 0 ? (session.tokens / session.peakTokens) * 100 : 0;

  return (
    <Panel
      title="Session Limit"
      icon={<ChipIcon size={16} />}
      className="lg:col-span-7"
      right={
        <span className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
          {plan}
        </span>
      }
    >
      {!data && <div className="text-sm text-[var(--muted)]">Reading session…</div>}
      {data && (
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <Gauge pct={ringPct} color={ringColor} size={176}>
            <div className="tnum text-[26px] font-semibold leading-none text-[var(--text)] glow-text">{centerMain}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--faint)]">{centerSub}</div>
          </Gauge>

          <div className="min-w-0 flex-1 w-full space-y-3.5">
            {/* Big live countdown */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">
                {session?.active ? "Session resets in" : "Next session window"}
              </div>
              <div className="tnum text-3xl font-semibold text-[var(--text)]">
                {remainingMs != null ? fmtCountdown(remainingMs) : session?.active ? "—:—:—" : "full 5:00:00"}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-[var(--border)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">This session</div>
                <div className="tnum mt-0.5 text-lg font-semibold text-[var(--text)]">
                  {session?.active ? session.messages.toLocaleString() : 0} <span className="text-[12px] font-normal text-[var(--muted)]">msgs</span>
                </div>
                <div className="tnum text-[11px] text-[var(--muted)]">{formatTokens(session?.active ? session.tokens : 0)} tokens</div>
              </div>
              <div className="rounded-lg border border-[var(--border)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">This week</div>
                <div className="tnum mt-0.5 text-lg font-semibold text-[var(--text)]">
                  {(data.week?.messages ?? 0).toLocaleString()} <span className="text-[12px] font-normal text-[var(--muted)]">msgs</span>
                </div>
                <div className="tnum text-[11px] text-[var(--muted)]">{formatTokens(data.week?.tokens ?? 0)} tokens</div>
              </div>
            </div>

            {officialOk && official.sevenDay?.usedPct != null ? (
              <MiniBar
                label="Weekly limit used"
                pct={official.sevenDay.usedPct}
                color={levelColor(official.sevenDay.usedPct)}
                right={`${Math.round(official.sevenDay.usedPct)}%`}
              />
            ) : (
              <MiniBar
                label="vs your busiest 5h session"
                pct={peakPct}
                color="var(--accent2)"
                right={`${Math.round(peakPct)}%`}
              />
            )}

            <div className="text-[10px] leading-relaxed text-[var(--faint)]">
              {officialOk
                ? "Official Anthropic limits, live."
                : official?.available === false
                  ? `Live session window from your local logs. Official %: ${official.reason}`
                  : "Live session window from your local logs."}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
