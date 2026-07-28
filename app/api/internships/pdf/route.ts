import { getJobById } from "@/lib/internships";
import { compilePdf, tectonicAvailable } from "@/lib/localTools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compiles a job's tailored LaTeX resume to a PDF for in-app preview/download.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const job = getJobById(id);
  if (!job?.tailoredResume) return Response.json({ error: "no tailored resume for this job" }, { status: 404 });
  if (!tectonicAvailable()) return Response.json({ error: "tectonic (LaTeX engine) not installed" }, { status: 500 });

  try {
    const pdf = await compilePdf(job.tailoredResume);
    const download = url.searchParams.get("download") === "1";
    const safe = (job.company || "resume").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="tailored-${safe}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return Response.json({ error: "compile failed: " + String((e as Error)?.message || e) }, { status: 502 });
  }
}
