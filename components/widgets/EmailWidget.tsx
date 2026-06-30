"use client";

import { Panel } from "@/components/Panel";
import { MailIcon } from "@/components/icons";
import { ConnectState } from "@/components/widgets/MeetingsWidget";
import { usePoll } from "@/lib/usePoll";
import { relativeTime } from "@/lib/format";

type Message = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: number;
  unread: boolean;
};
type EmailResp = {
  connected: boolean;
  unread: number;
  messages: Message[];
  setup?: { summary: string; docs: string };
};

export function EmailWidget() {
  const { data, error } = usePoll<EmailResp>("/api/email", 60000);

  return (
    <Panel
      title="Email"
      icon={<MailIcon size={16} />}
      accent="var(--warn)"
      className="lg:col-span-5"
      right={data?.connected ? <span className="tnum text-[12px] text-[var(--warn)]">{data.unread} unread</span> : undefined}
    >
      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
      {data?.connected && data.messages.length > 0 && (
        <div className="scroll-thin max-h-[220px] space-y-1 overflow-y-auto pr-1">
          {data.messages.map((m) => (
            <div key={m.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition hover:bg-white/[0.025]">
              {m.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--warn)]" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${m.unread ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>{m.from}</span>
                  <span className="shrink-0 text-[10px] text-[var(--faint)]">{relativeTime(m.receivedAt)}</span>
                </div>
                <div className="truncate text-[13px] text-[var(--text)]">{m.subject}</div>
                <div className="truncate text-[11px] text-[var(--faint)]">{m.snippet}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {data?.connected && data.messages.length === 0 && (
        <div className="py-6 text-center text-sm text-[var(--muted)]">Inbox zero. ✨</div>
      )}
      {data && !data.connected && <ConnectState summary={data.setup?.summary} />}
      {!data && !error && <div className="text-sm text-[var(--muted)]">Loading…</div>}
    </Panel>
  );
}
