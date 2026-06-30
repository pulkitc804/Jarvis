"use client";

import { Panel } from "@/components/Panel";
import { CalendarIcon, PlugIcon } from "@/components/icons";
import { usePoll } from "@/lib/usePoll";

type Meeting = {
  id: string;
  title: string;
  start: number;
  end: number;
  attendees?: string[];
  location?: string;
  url?: string;
};
type MeetingsResp = {
  connected: boolean;
  meetings: Meeting[];
  setup?: { summary: string; docs: string };
};

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function MeetingsWidget() {
  const { data, error } = usePoll<MeetingsResp>("/api/meetings", 60000);

  return (
    <Panel title="Meetings" icon={<CalendarIcon size={16} />} accent="var(--accent2)" className="lg:col-span-7">
      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
      {data?.connected && data.meetings.length > 0 && (
        <div className="space-y-2">
          {data.meetings.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5">
              <div className="tnum w-16 shrink-0 text-sm text-[var(--accent)]">{fmtTime(m.start)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-[var(--text)]">{m.title}</div>
                {m.attendees && <div className="truncate text-[11px] text-[var(--muted)]">{m.attendees.join(", ")}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {data?.connected && data.meetings.length === 0 && (
        <div className="py-6 text-center text-sm text-[var(--muted)]">No meetings on the calendar.</div>
      )}
      {data && !data.connected && <ConnectState summary={data.setup?.summary} />}
      {!data && !error && <div className="text-sm text-[var(--muted)]">Loading…</div>}
    </Panel>
  );
}

export function ConnectState({ summary }: { summary?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--border-strong)] bg-white/[0.012] px-4 py-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--accent2)]/12 text-[var(--accent2)]">
        <PlugIcon size={18} />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--text)]">Not connected yet</div>
        <div className="text-[12px] text-[var(--muted)]">{summary || "Wire up a live data source to populate this panel."}</div>
      </div>
    </div>
  );
}
