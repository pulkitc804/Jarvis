import ical from "node-ical";

/**
 * Pulls upcoming meetings from one or more secret iCal (.ics) URLs.
 * Set CALENDAR_ICS_URLS (comma-separated) in .env.local — e.g. the "Secret
 * address in iCal format" from Google Calendar settings, or any Outlook/Apple
 * published calendar URL. No OAuth flow needed; fully accurate live data.
 */

export type Meeting = {
  id: string;
  title: string;
  start: number; // epoch ms
  end: number; // epoch ms
  allDay: boolean;
  location?: string;
  attendees?: string[];
};

export type MeetingsResult =
  | { connected: true; meetings: Meeting[]; fetchedAt: number }
  | { connected: false; reason: string };

const WINDOW_MS = 8 * 24 * 60 * 60 * 1000; // upcoming 8 days

let cache: { at: number; result: MeetingsResult } | null = null;

export async function getMeetings(): Promise<MeetingsResult> {
  const raw = process.env.CALENDAR_ICS_URLS || process.env.CALENDAR_ICS_URL || "";
  const urls = raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (urls.length === 0) {
    return { connected: false, reason: "Set CALENDAR_ICS_URLS to your calendar's secret iCal URL." };
  }
  if (cache && Date.now() - cache.at < 30_000) return cache.result;

  const now = Date.now();
  const windowEnd = now + WINDOW_MS;
  const meetings: Meeting[] = [];

  try {
    for (const url of urls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = await ical.async.fromURL(url);
      for (const key of Object.keys(data)) {
        const ev = data[key];
        if (!ev || ev.type !== "VEVENT") continue;
        const durationMs =
          ev.end && ev.start ? new Date(ev.end).getTime() - new Date(ev.start).getTime() : 30 * 60 * 1000;
        const allDay =
          ev.datetype === "date" ||
          (!!ev.start && (ev.start as { dateOnly?: boolean }).dateOnly === true);
        const attendees = normalizeAttendees(ev.attendee);
        const base = {
          title: String(ev.summary || "(no title)"),
          location: ev.location ? String(ev.location) : undefined,
          attendees,
          allDay,
        };

        if (ev.rrule) {
          // Expand recurrences that fall inside the window.
          const occ: Date[] = ev.rrule.between(new Date(now - durationMs), new Date(windowEnd), true);
          const exdates: Record<string, Date> = ev.exdate || {};
          for (const d of occ) {
            const key2 = d.toISOString().slice(0, 10);
            if (exdates[key2]) continue; // cancelled occurrence
            const start = d.getTime();
            meetings.push({
              id: `${ev.uid}-${start}`,
              start,
              end: start + durationMs,
              ...base,
            });
          }
        } else if (ev.start) {
          const start = new Date(ev.start).getTime();
          const end = ev.end ? new Date(ev.end).getTime() : start + durationMs;
          if (end >= now && start <= windowEnd) {
            meetings.push({ id: String(ev.uid || key), start, end, ...base });
          }
        }
      }
    }
  } catch (e) {
    return { connected: false, reason: `Couldn't fetch calendar: ${(e as Error).message}` };
  }

  meetings.sort((a, b) => a.start - b.start);
  const result: MeetingsResult = { connected: true, meetings: meetings.slice(0, 12), fetchedAt: now };
  cache = { at: Date.now(), result };
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAttendees(att: any): string[] | undefined {
  if (!att) return undefined;
  const arr = Array.isArray(att) ? att : [att];
  const names = arr
    .map((a) => {
      if (typeof a === "string") return a.replace(/^mailto:/i, "");
      const cn = a?.params?.CN;
      const val = typeof a?.val === "string" ? a.val.replace(/^mailto:/i, "") : "";
      return cn || val;
    })
    .filter(Boolean);
  return names.length ? names.slice(0, 6) : undefined;
}
