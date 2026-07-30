import { listInternships, updateJob, upcomingDeadlines, type Stage } from "@/lib/internships";
import { aiConfigured } from "@/lib/aiClient";
import { ensureFetcherRunning, refreshDetected } from "@/lib/internshipFetcher";
import { tectonicAvailable } from "@/lib/localTools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Kick off the free background tracker-fetch loop (once per server lifetime).
  ensureFetcherRunning();
  const url = new URL(request.url);
  // ?refresh=1 forces an immediate fetch (used by the refresh buttons) so new
  // roles appear on demand instead of only on the ~5-min background cadence.
  if (url.searchParams.get("refresh") === "1") await refreshDetected();
  const bigTechOnly = url.searchParams.get("all") !== "1";
  const { internships, scraperConnected, scraperFile, detectedCount } = listInternships();
  const bigTechCount = internships.filter((i) => i.bigTech).length;
  const shown = bigTechOnly ? internships.filter((i) => i.bigTech) : internships;
  return Response.json({
    internships: shown,
    total: internships.length,
    bigTechCount,
    appliedCount: internships.filter((i) => i.applied).length,
    stageCounts: internships.reduce<Record<string, number>>((acc, i) => ((acc[i.stage] = (acc[i.stage] || 0) + 1), acc), {}),
    upcomingDeadlines: upcomingDeadlines(),
    scraperConnected,
    scraperFile,
    detectedCount,
    // Scoring is done by the scraper task (no API key); when aiConfigured is
    // true the in-app Score button also works.
    aiConfigured: aiConfigured(),
    // Tailoring is on-demand only. Instant if an API key is set; otherwise the
    // click queues a request the scraper fulfills for free. PDF preview via tectonic.
    tailoringInstant: aiConfigured(),
    pdfAvailable: tectonicAvailable(),
  });
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as {
    id?: string;
    applied?: boolean;
    stage?: Stage;
    deadlineAt?: number | null;
    deadlineLabel?: string | null;
    notes?: string;
  };
  if (!b.id) return Response.json({ error: "id required" }, { status: 400 });
  updateJob(b.id, {
    applied: b.applied,
    stage: b.stage,
    deadlineAt: b.deadlineAt,
    deadlineLabel: b.deadlineLabel,
    notes: b.notes,
  });
  return Response.json({ ok: true });
}
