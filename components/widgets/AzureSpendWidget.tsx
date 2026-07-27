"use client";

import { Panel } from "@/components/Panel";
import { ConnectState } from "@/components/widgets/MeetingsWidget";
import { usePoll } from "@/lib/usePoll";
import { relativeTime } from "@/lib/format";

const AzureIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 4h6l4.5 15h-5L8.5 4Z" />
    <path d="m8.5 4-6 12h5l2-4" />
  </svg>
);

type AzureResp =
  | { connected: true; mtdCost: number; currency: string; scope: string; fetchedAt: number }
  | { connected: false; reason: string };

function money(n: number, ccy: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${ccy} ${n.toFixed(2)}`;
  }
}

export function AzureSpendWidget() {
  const { data, error } = usePoll<AzureResp>("/api/azure-spend", 120000);
  const connected = data?.connected === true;

  return (
    <Panel title="Azure Spend" icon={<AzureIcon size={16} />} accent="#3aa0ff" className="lg:col-span-5">
      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
      {connected && (
        <div className="flex h-full flex-col justify-center gap-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">Month to date</div>
          <div className="tnum text-4xl font-semibold text-[var(--text)] glow-text">{money(data.mtdCost, data.currency)}</div>
          <div className="text-[11px] text-[var(--muted)]">
            {data.scope.replace("subscriptions/", "sub ")} · updated {relativeTime(data.fetchedAt)}
          </div>
        </div>
      )}
      {data && !data.connected && <ConnectState reason={data.reason} />}
      {!data && !error && <div className="text-sm text-[var(--muted)]">Loading…</div>}
    </Panel>
  );
}
