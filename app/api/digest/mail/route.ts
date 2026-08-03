import { buildDigest, getDigestState, renderDigest, sendDigestNow } from "@/lib/jobDigestMail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: scheduler state, plus ?preview=1 to see exactly what would be sent. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = getDigestState();
  if (url.searchParams.get("preview") === "1") {
    const hours = Number(url.searchParams.get("hours") || 24);
    const payload = buildDigest(Date.now() - hours * 3600_000);
    const { subject, text } = renderDigest(payload);
    return Response.json({ ...state, preview: { subject, text, newRoles: payload.newRoles.length, stats: payload.stats } });
  }
  return Response.json(state);
}

/** POST: send a digest immediately (used to test the pipeline). */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { hours?: number };
  const since = b.hours ? Date.now() - b.hours * 3600_000 : undefined;
  const res = await sendDigestNow(since);
  return Response.json(res, { status: res.ok ? 200 : 502 });
}
