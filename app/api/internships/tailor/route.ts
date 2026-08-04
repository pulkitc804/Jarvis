import { getJobById, updateJob } from "@/lib/internships";
import { readResume } from "@/lib/resume";
import { aiConfigured, callClaude } from "@/lib/aiClient";
import { saveSubmissionPdf } from "@/lib/localTools";
import { sameContentWords, tailorResumeTex } from "@/lib/resumeTailor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tailoring runs ONLY on explicit request, and always returns immediately.
 *
 *  - With ANTHROPIC_API_KEY: a model rewrite, which can rephrase bullets.
 *  - Without one (default): deterministic re-emphasis (lib/resumeTailor.ts) —
 *    instant, free, and provably incapable of inventing a claim, since the
 *    content words are asserted identical to the source résumé.
 *
 * Either way the result is compiled and dropped into the submit folder as
 * Chaudhary_Pulkit_<Company>_<Role>.pdf, ready to upload.
 */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { id?: string; useModel?: boolean };
  if (!b.id) return Response.json({ error: "id required" }, { status: 400 });
  const job = getJobById(b.id);
  if (!job) return Response.json({ error: "job not found" }, { status: 404 });
  const resume = readResume();
  if (!resume.ok) return Response.json({ error: `resume.tex not found at ${resume.path}` }, { status: 400 });

  try {
    let tex: string;
    let mode: "model" | "instant";

    if (aiConfigured() && b.useModel !== false) {
      const prompt = `Tailor this LaTeX resume for the target role. Swap and emphasize keywords, reorder and rephrase bullets to mirror what the role wants — but NEVER invent experience, employers, or facts. Keep the LaTeX valid and compilable.

COMPANY: ${job.company}
ROLE: ${job.role}
${job.scoreReason ? `FIT NOTES (address these gaps where truthful): ${job.scoreReason}\n` : ""}
RESUME (LaTeX):
${resume.text}

Return ONLY the full tailored LaTeX document — no explanation, no markdown fences.`;
      const r = await callClaude({ prompt, model: process.env.INTERNSHIP_TAILOR_MODEL || "claude-opus-4-8", maxTokens: 8000 });
      if (!r.ok) return Response.json({ error: r.error }, { status: 502 });
      tex = r.text.trim().replace(/^```(?:latex|tex)?\s*/i, "").replace(/```\s*$/i, "").trim();
      mode = "model";
    } else {
      tex = tailorResumeTex(resume.text, job.company, job.role);
      mode = "instant";
    }

    if (!tex.includes("\\documentclass")) {
      return Response.json({ error: "tailored output didn't look like LaTeX" }, { status: 502 });
    }

    // Deterministic path must never alter content — fail loudly rather than
    // silently ship a résumé that drifted from the source.
    const factsIntact = mode === "instant" ? sameContentWords(resume.text, tex) : null;
    if (mode === "instant" && !factsIntact) {
      return Response.json({ error: "internal: tailoring altered résumé content; refusing to save" }, { status: 500 });
    }

    updateJob(b.id, { tailoredResume: tex, worthTailoring: true, tailorRequested: false });
    const saved = await saveSubmissionPdf(tex, job.company, job.role);

    return Response.json({
      ok: true,
      mode,
      factsIntact,
      file: saved.ok ? saved.file : null,
      saveError: saved.ok ? null : saved.error,
    });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message || e) }, { status: 502 });
  }
}
