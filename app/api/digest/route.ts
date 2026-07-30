import { buildDigest, digestText } from "@/lib/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A future Slack/email routine can hit this route and post `text` verbatim —
// same data the dashboard widget renders, just pre-formatted.
export async function GET() {
  const digest = buildDigest();
  return Response.json({ ...digest, text: digestText(digest) });
}
