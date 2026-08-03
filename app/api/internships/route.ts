import {
  allJobUrls,
  listInternships,
  readHiddenCompanies,
  setCompanyHidden,
  updateJob,
  upcomingDeadlines,
  type Stage,
} from "@/lib/internships";
import { ensureLinkSweeper } from "@/lib/linkHealth";
import { ensureDigestScheduler } from "@/lib/jobDigestMail";
import { addManualJob, deleteManualJob } from "@/lib/manualJobs";
import { aiConfigured } from "@/lib/aiClient";
import { ensureFetcherRunning, refreshDetected, getFetcherState } from "@/lib/internshipFetcher";
import { tectonicAvailable } from "@/lib/localTools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Kick off the background loops (once per server lifetime).
  ensureFetcherRunning();
  ensureLinkSweeper(allJobUrls);
  ensureDigestScheduler();
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
    hiddenCompanies: readHiddenCompanies(),
    fetcher: getFetcherState(),
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
    referral?: boolean;
    favorite?: boolean;
    hidden?: boolean;
    notes?: string;
    // manual add
    add?: { company?: string; role?: string; url?: string; location?: string; via?: string };
    // mute/unmute an entire company
    hideCompany?: { company: string; hidden: boolean };
  };

  if (b.hideCompany?.company) {
    const list = setCompanyHidden(b.hideCompany.company, b.hideCompany.hidden);
    return Response.json({ ok: true, hiddenCompanies: list });
  }

  // Hand-entered role (Instagram, Discord, a referral — anywhere a feed can't reach).
  if (b.add) {
    const { company, role } = b.add;
    if (!company?.trim() || !role?.trim()) {
      return Response.json({ error: "company and role are required" }, { status: 400 });
    }
    const job = addManualJob({ ...b.add, company, role });
    return Response.json({ ok: true, job });
  }

  if (!b.id) return Response.json({ error: "id required" }, { status: 400 });
  updateJob(b.id, {
    applied: b.applied,
    stage: b.stage,
    deadlineAt: b.deadlineAt,
    deadlineLabel: b.deadlineLabel,
    referral: b.referral,
    favorite: b.favorite,
    hidden: b.hidden,
    notes: b.notes,
  });
  return Response.json({ ok: true });
}

/** Remove a hand-entered role (feed-sourced ones can't be deleted this way). */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  return deleteManualJob(id)
    ? Response.json({ ok: true })
    : Response.json({ error: "not a manually added role" }, { status: 404 });
}
