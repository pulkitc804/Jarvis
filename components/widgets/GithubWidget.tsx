"use client";

import { usePoll } from "@/lib/usePoll";
import { Panel } from "@/components/Panel";

const GithubIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.36-3.37-1.36-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.89 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 2.5-.35c.85 0 1.71.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
  </svg>
);

type Event = { id: string; summary: string; repo: string; url: string; createdAt: number };
type Resp =
  | { connected: true; username: string; publicRepos: number; followers: number; events: Event[] }
  | { connected: false; reason: string };

function relTime(ms: number) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function GithubWidget() {
  const { data } = usePoll<Resp>("/api/github", 5 * 60000);

  return (
    <Panel title="GitHub" icon={<GithubIcon size={15} />} accent="#c9d1d9" className="lg:col-span-5">
      {!data && <div className="text-sm text-[var(--muted)]">Loading…</div>}
      {data && !data.connected && (
        <div className="text-[13px] leading-relaxed text-[var(--muted)]">
          Not connected — set <code className="text-[var(--accent)]">GITHUB_USERNAME</code> in <code>.env.local</code>.
        </div>
      )}
      {data && data.connected && (
        <div className="flex h-full flex-col gap-3">
          <div className="flex items-center gap-4 text-[12px] text-[var(--muted)]">
            <span>
              <span className="tnum font-semibold text-[var(--text)]">{data.publicRepos}</span> repos
            </span>
            <span>
              <span className="tnum font-semibold text-[var(--text)]">{data.followers}</span> followers
            </span>
          </div>
          <div className="space-y-1.5">
            {data.events.length === 0 && <div className="text-[13px] text-[var(--faint)]">No recent public activity.</div>}
            {data.events.slice(0, 5).map((e) => (
              <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] transition hover:bg-white/[0.025]">
                <span className="min-w-0 flex-1 truncate text-[var(--text)]">
                  {e.summary} <span className="text-[var(--faint)]">· {e.repo}</span>
                </span>
                <span className="shrink-0 text-[11px] text-[var(--faint)]">{relTime(e.createdAt)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
