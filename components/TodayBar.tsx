"use client";

import Link from "next/link";
import { usePoll } from "@/lib/usePoll";

type Meeting = { id: string; title: string; start: number; allDay: boolean };
type MeetingsResp = { connected: boolean; meetings?: Meeting[] };
type Deadline = { id: string; company: string; deadlineAt: number; deadlineLabel: string | null };
type InternshipsResp = { upcomingDeadlines: Deadline[] };

function countdown(ms: number): string {
  const diff = ms - Date.now();
  if (diff < 0) return "now";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h ${mins % 60}m`;
  return `in ${Math.round(hrs / 24)}d`;
}

/** Compact strip of the most time-sensitive things: next meeting, next deadline. */
export function TodayBar() {
  const { data: meetings } = usePoll<MeetingsResp>("/api/meetings", 60000);
  const { data: internships } = usePoll<InternshipsResp>("/api/internships?all=0", 60000);

  const nextMeeting = meetings?.connected ? (meetings.meetings || []).find((m) => m.start > Date.now()) : undefined;
  const nextDeadline = internships?.upcomingDeadlines?.[0];

  if (!nextMeeting && !nextDeadline) return null;

  return (
    <div className="relative z-10 mb-4 flex flex-wrap items-center gap-2 text-[12px]">
      {nextMeeting && (
        <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white/[0.02] px-3 py-1.5">
          <span className="text-[var(--faint)]">Next meeting</span>
          <span className="truncate font-medium text-[var(--text)]" style={{ maxWidth: 220 }}>{nextMeeting.title}</span>
          <span className="text-[var(--accent)]">{countdown(nextMeeting.start)}</span>
        </span>
      )}
      {nextDeadline && (
        <Link
          href="/internships"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 transition"
          style={{ borderColor: "var(--warn)", color: "var(--warn)" }}
        >
          <span className="opacity-70">{nextDeadline.deadlineLabel || "Deadline"}</span>
          <span className="font-medium">{nextDeadline.company}</span>
          <span>{countdown(nextDeadline.deadlineAt)}</span>
        </Link>
      )}
    </div>
  );
}
