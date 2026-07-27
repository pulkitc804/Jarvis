"use client";

import { useEffect, useState } from "react";
import { triggerRefresh } from "@/lib/refreshBus";
import { RefreshIcon } from "@/components/icons";

function greeting(h: number): string {
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Working late";
}

export function ClockHeader({ name = "Pulkit" }: { name?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  function refreshAll() {
    setSpinning(true);
    triggerRefresh();
    setTimeout(() => setSpinning(false), 900);
  }

  const time = now
    ? now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
    : "--:--:--";
  const date = now
    ? now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "";
  const hour = now ? now.getHours() : 9;
  // Gate behind `now` too — resolving the zone during SSR would emit the
  // server's timezone and mismatch the browser's on hydration.
  const tz = now ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  return (
    <header className="relative z-10 flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-[var(--good)]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[var(--muted)]">
            Jarvis · Command Center
          </span>
        </div>
        <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--text)]">
          {greeting(hour)}, <span className="glow-text text-[var(--accent)]">{name}</span>.
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{date}</p>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={refreshAll}
          title="Refresh all panels now"
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white/[0.02] px-3 py-2 text-[12px] font-medium text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--accent)]"
        >
          <RefreshIcon size={14} className={spinning ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
        <div className="text-right">
          <div className="tnum text-3xl sm:text-4xl font-medium text-[var(--text)] glow-text">{time}</div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--faint)]">{tz || " "}</div>
        </div>
      </div>
    </header>
  );
}
