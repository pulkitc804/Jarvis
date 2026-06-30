"use client";

import { Panel } from "@/components/Panel";
import { CalendarIcon, PlugIcon } from "@/components/icons";
import { usePoll } from "@/lib/usePoll";

type Meeting = {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
  attendees?: string[];
};
type MeetingsResp =
  | { connected: true; meetings: Meeting[] }
  | { connected: false; reason: string };

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function MeetingsWidget() {
  const { data, error } = usePoll<MeetingsResp>("/api/meetings", 60000);
  const connected = data?.connected === true;

  return (
    <Panel title="Meetings" icon={<CalendarIcon size={16} />} accent="var(--accent2)" className="lg:col-span-7">
      {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
      {connected && data.meetings.length > 0 && (
        <div className="scroll-thin max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
          {data.meetings.map((m) => {
            const soon = m.start - Date.now() < 60 * 60 * 1000 && m.start > Date.now();
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5">
                <div className="w-20 shrink-0">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--faint)]">{dayLabel(m.start)}</div>
                  <div className="tnum text-sm" style={{ color: soon ? "var(--accent)" : "var(--text)" }}>
                    {m.allDay ? "all day" : fmtTime(m.start)}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-[var(--text)]">{m.title}</div>
                  {(m.location || m.attendees) && (
                    <div className="truncate text-[11px] text-[var(--muted)]">
                      {m.location || (m.attendees ? m.attendees.join(", ") : "")}
                    </div>
                  )}
                </div>
                {soon && <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />}
              </div>
            );
          })}
        </div>
      )}
      {connected && data.meetings.length === 0 && (
        <div className="py-6 text-center text-sm text-[var(--muted)]">No meetings in the next 8 days.</div>
      )}
      {data && !data.connected && <ConnectState reason={data.reason} />}
      {!data && !error && <div className="text-sm text-[var(--muted)]">Loading…</div>}
    </Panel>
  );
}

export function ConnectState({ reason }: { reason?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--border-strong)] bg-white/[0.012] px-4 py-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--accent2)]/12 text-[var(--accent2)]">
        <PlugIcon size={18} />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--text)]">Not connected</div>
        <div className="text-[12px] text-[var(--muted)]">{reason || "Add credentials in .env.local to go live."}</div>
      </div>
    </div>
  );
}
