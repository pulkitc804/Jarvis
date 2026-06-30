export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meetings / calendar feed.
 *
 * Not yet wired to a live source. To make this real, return an array of
 * `meetings` in the shape below from Google Calendar (OAuth) and/or the
 * Granola MCP. The UI already renders this shape, so dropping in real data
 * here is all that's needed.
 */
export async function GET() {
  return Response.json({
    connected: false,
    provider: null,
    meetings: [] as {
      id: string;
      title: string;
      start: number; // epoch ms
      end: number; // epoch ms
      attendees?: string[];
      location?: string;
      url?: string;
    }[],
    setup: {
      summary: "Connect Google Calendar or Granola to see upcoming meetings here.",
      docs: "See README → Connecting data sources.",
    },
  });
}
