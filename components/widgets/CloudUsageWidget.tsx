"use client";

import { Panel } from "@/components/Panel";
import { usePoll } from "@/lib/usePoll";
import { formatTokens, formatUSD } from "@/lib/format";
import type { UsageSummary } from "@/lib/claudeUsage";

const CloudIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.34 9.4 4 4 0 0 0 7 19h10.5Z" />
  </svg>
);

const LockIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white/[0.015] px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">{label}</div>
      <div className="tnum mt-1 text-2xl font-semibold text-[var(--text)]">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

export function CloudUsageWidget() {
  const { data } = usePoll<UsageSummary>("/api/claude-usage", 15000);
  const cloud = data?.cloud;
  const has = cloud && cloud.tokens > 0;

  return (
    <Panel
      title="Cloud Usage"
      icon={<CloudIcon size={16} />}
      accent="#8b7cff"
      className="lg:col-span-5"
      right={
        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">
          <LockIcon size={11} /> anonymous
        </span>
      }
    >
      {!data && <div className="text-sm text-[var(--muted)]">Reading…</div>}
      {data && has && (
        <div className="flex h-full flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            <Tile label="Cloud messages" value={cloud!.messages.toLocaleString()} sub="not counted toward your 5h limit" />
            <Tile label="Cloud tokens" value={formatTokens(cloud!.tokens)} sub={`~${formatUSD(cloud!.costUSD)} est.`} />
          </div>
          <div className="mt-auto flex items-start gap-2 rounded-lg border border-[var(--border)] bg-white/[0.012] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
            <LockIcon size={13} />
            <span>
              Aggregate volume only — no project names or content shown. Kept separate from your
              subscription window so the 5-hour limit stays accurate.
            </span>
          </div>
        </div>
      )}
      {data && !has && (
        <div className="flex h-full flex-col justify-center gap-2 py-2">
          <div className="text-sm text-[var(--text)]">No cloud usage tracked yet.</div>
          <div className="text-[12px] leading-relaxed text-[var(--muted)]">
            Route overflow work through Azure/Foundry (or Bedrock) to keep going past your subscription
            limit, then tag those projects with <code className="text-[var(--accent)]">JARVIS_CLOUD_PROJECTS</code>{" "}
            in <code>.env.local</code>. Their usage shows here as anonymous totals — never the work
            itself. (Bedrock&apos;s <code>anthropic.*</code> model IDs are detected automatically.)
          </div>
        </div>
      )}
    </Panel>
  );
}
