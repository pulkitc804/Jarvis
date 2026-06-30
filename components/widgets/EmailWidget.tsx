"use client";

import { Panel } from "@/components/Panel";
import { MailIcon } from "@/components/icons";
import { ConnectState } from "@/components/widgets/MeetingsWidget";
import { usePoll } from "@/lib/usePoll";
import { relativeTime } from "@/lib/format";

type Email = {
  id: string;
  from: string;
  subject: string;
  receivedAt: number;
  unread: boolean;
};
type EmailResp =
  | { connected: true; unread: number; messages: Email[] }
  | { connected: false; reason: string };

export function EmailWidget() {
  const { data, error } = usePoll<EmailResp>("/api/email", 60000);
  const connected = data?.connected === true;

  return (
    <Panel
      title="Email"
      icon={<MailIcon size={16} />}
      accent="var(--warn)"
      className="lg:col-span-5"
      right={connected ? <span className="tnum text-[12px] text-[var(--warn)]">{data.unread} unread</span> : undefined}
    >
      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
      {connected && data.messages.length > 0 && (
        <div className="scroll-thin max-h-[260px] space-y-0.5 overflow-y-auto pr-1">
          {data.messages.map((m) => (
            <div key={m.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition hover:bg-white/[0.025]">
              {m.unread ? (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--warn)]" />
              ) : (
                <span className="mt-1.5 h-2 w-2 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-[13px] ${m.unread ? "text-[var(--text)] font-medium" : "text-[var(--muted)]"}`}>
                    {m.from}
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--faint)]">{relativeTime(m.receivedAt)}</span>
                </div>
                <div className={`truncate text-[13px] ${m.unread ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>{m.subject}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {connected && data.messages.length === 0 && (
        <div className="py-6 text-center text-sm text-[var(--muted)]">Inbox zero. ✨</div>
      )}
      {data && !data.connected && <ConnectState reason={data.reason} />}
      {!data && !error && <div className="text-sm text-[var(--muted)]">Loading…</div>}
    </Panel>
  );
}
