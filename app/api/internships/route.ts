import { listInternships, updateJob } from "@/lib/internships";
import { aiConfigured } from "@/lib/aiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bigTechOnly = url.searchParams.get("all") !== "1";
  const { internships, scraperConnected, scraperFile } = listInternships();
  const bigTechCount = internships.filter((i) => i.bigTech).length;
  const shown = bigTechOnly ? internships.filter((i) => i.bigTech) : internships;
  return Response.json({
    internships: shown,
    total: internships.length,
    bigTechCount,
    appliedCount: internships.filter((i) => i.applied).length,
    scraperConnected,
    scraperFile,
    // When false, scoring/tailoring is done automatically by the scraper task
    // (no on-demand buttons); when true, the in-app Score/Tailor buttons work.
    aiConfigured: aiConfigured(),
  });
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { id?: string; applied?: boolean; notes?: string };
  if (!b.id) return Response.json({ error: "id required" }, { status: 400 });
  updateJob(b.id, { applied: b.applied, notes: b.notes });
  return Response.json({ ok: true });
}
