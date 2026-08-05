import { resolveJobUrl } from "@/lib/jobUrlResolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Paste an apply link, get back the real company / role / location / date. */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { url?: string };
  if (!b.url?.trim()) return Response.json({ error: "url required" }, { status: 400 });
  const r = await resolveJobUrl(b.url);
  if ("error" in r) return Response.json(r, { status: 422 });
  return Response.json({ ok: true, job: r });
}
