"use client";

import { Panel } from "@/components/Panel";
import { ConnectState } from "@/components/widgets/MeetingsWidget";
import { usePoll } from "@/lib/usePoll";
import { relativeTime } from "@/lib/format";

const SendIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

type TgMessage = { id: string; from: string; chat: string; text: string; date: number };
type TgResp =
  | { connected: true; messages: TgMessage[]; botName: string | null }
  | { connected: false; reason: string };

export function TelegramWidget() {
  const { data, error } = usePoll<TgResp>("/api/telegram", 30000);
  const connected = data?.connected === true;

  return (
    <Panel
      title="Telegram"
      icon={<SendIcon size={15} />}
      accent="#34b7f1"
      className="lg:col-span-12"
      right={connected && data.botName ? <span className="text-[11px] text-[var(--muted)]">{data.botName}</span> : undefined}
    >
      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
      {connected && data.messages.length > 0 && (
        <div className="scroll-thin max-h-[260px] space-y-1 overflow-y-auto pr-1">
          {data.messages.map((m) => (
            <div key={m.id} className="rounded-lg px-2.5 py-2 transition hover:bg-white/[0.025]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-medium text-[var(--text)]">{m.from}</span>
                <span className="shrink-0 text-[10px] text-[var(--faint)]">{relativeTime(m.date)}</span>
              </div>
              <div className="text-[13px] text-[var(--muted)] line-clamp-2">{m.text}</div>
              {m.chat !== "direct" && m.chat !== m.from && (
                <div className="mt-0.5 text-[10px] text-[var(--faint)]">in {m.chat}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {connected && data.messages.length === 0 && (
        <div className="py-6 text-center text-sm text-[var(--muted)]">No recent messages to your bot.</div>
      )}
      {data && !data.connected && <ConnectState reason={data.reason} />}
      {!data && !error && <div className="text-sm text-[var(--muted)]">Loading…</div>}
    </Panel>
  );
}
