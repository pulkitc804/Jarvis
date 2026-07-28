import { getJobById, updateJob } from "@/lib/internships";
import { readResume } from "@/lib/resume";
import { aiConfigured, callClaude } from "@/lib/aiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tailoring runs ONLY on explicit request (this route), never automatically.
// - With an ANTHROPIC_API_KEY set: tailor instantly here (paid).
// - Without one (default): record a request; the scraper task — which already
//   runs inference on the user's Claude subscription — fulfills it on its next
//   run and writes the tailored LaTeX into seen_jobs.json (free).
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { id?: string };
  if (!b.id) return Response.json({ error: "id required" }, { status: 400 });
  const job = getJobById(b.id);
  if (!job) return Response.json({ error: "job not found" }, { status: 404 });

  if (aiConfigured()) {
    const resume = readResume();
    if (!resume.ok) return Response.json({ error: `resume.tex not found at ${resume.path}` }, { status: 400 });
    const prompt = `Tailor this LaTeX resume for the target role. Swap and emphasize keywords, reorder and rephrase bullets to mirror what the role wants — but NEVER invent experience, employers, or facts. Keep the LaTeX valid and compilable.

COMPANY: ${job.company}
ROLE: ${job.role}
${job.scoreReason ? `FIT NOTES (address these gaps where truthful): ${job.scoreReason}\n` : ""}
RESUME (LaTeX):
${resume.text}

Return ONLY the full tailored LaTeX document — no explanation, no markdown fences.`;
    const r = await callClaude({ prompt, model: process.env.INTERNSHIP_TAILOR_MODEL || "claude-opus-4-8", maxTokens: 8000 });
    if (!r.ok) return Response.json({ error: r.error }, { status: 502 });
    const tex = r.text.trim().replace(/^```(?:latex|tex)?\s*/i, "").replace(/```\s*$/i, "").trim();
    if (!tex.includes("\\documentclass")) return Response.json({ error: "tailored output didn't look like LaTeX" }, { status: 502 });
    updateJob(b.id, { tailoredResume: tex, worthTailoring: true, tailorRequested: false });
    return Response.json({ ok: true, mode: "instant" });
  }

  // Free path: queue for the scraper.
  updateJob(b.id, { tailorRequested: true, tailorRequestedAt: Date.now(), worthTailoring: true });
  return Response.json({ ok: true, mode: "queued" });
}
