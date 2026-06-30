export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Email feed.
 *
 * Not yet wired to a live source. To make this real, return `messages` in the
 * shape below from the Gmail API (OAuth). The UI already renders this shape.
 */
export async function GET() {
  return Response.json({
    connected: false,
    provider: null,
    unread: 0,
    messages: [] as {
      id: string;
      from: string;
      subject: string;
      snippet: string;
      receivedAt: number; // epoch ms
      unread: boolean;
    }[],
    setup: {
      summary: "Connect Gmail (OAuth) to see unread and important mail here.",
      docs: "See README → Connecting data sources.",
    },
  });
}
