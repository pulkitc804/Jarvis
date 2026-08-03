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
    <header className="relative z-10 mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--text)]">
          {greeting(hour)}, {name}
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--muted)]">{date}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={refreshAll}
          title="Refresh all panels now"
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
        >
          <RefreshIcon size={13} className={spinning ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
        <div className="text-right">
          <div className="tnum text-[26px] font-medium leading-none text-[var(--text)]">{time}</div>
          <div className="mt-1 text-[11px] text-[var(--faint)]">{tz || " "}</div>
        </div>
      </div>
    </header>
  );
}
