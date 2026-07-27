import { getJobById, updateJob } from "@/lib/internships";
import { readResume } from "@/lib/resume";
import { aiConfigured, callClaude } from "@/lib/aiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { id?: string };
  if (!b.id) return Response.json({ error: "id required" }, { status: 400 });
  if (!aiConfigured())
    return Response.json({ error: "AI not configured — add ANTHROPIC_API_KEY to .env.local.", needsCreds: true }, { status: 400 });
  const job = getJobById(b.id);
  if (!job) return Response.json({ error: "job not found" }, { status: 404 });
  const resume = readResume();
  if (!resume.ok) return Response.json({ error: "resume.tex not found" }, { status: 400 });

  const prompt = `Tailor this LaTeX resume for the target role. Swap and emphasize keywords, reorder and rephrase bullet points to mirror what the role wants, and adjust the skills section to surface relevant terminology — but NEVER invent experience, employers, or facts. Keep the LaTeX valid and compilable.

COMPANY: ${job.company}
ROLE: ${job.role}
${job.scoreReason ? `FIT NOTES (address these gaps where truthful): ${job.scoreReason}\n` : ""}
RESUME (LaTeX):
${resume.text}

Return ONLY the full tailored LaTeX document — no explanation, no markdown fences.`;

  const r = await callClaude({ prompt, model: process.env.INTERNSHIP_TAILOR_MODEL || "claude-opus-4-8", maxTokens: 8000 });
  if (!r.ok) return Response.json({ error: r.error }, { status: 502 });
  let tex = r.text.trim();
  tex = tex.replace(/^```(?:latex|tex)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!tex.includes("\\")) return Response.json({ error: "tailored output didn't look like LaTeX" }, { status: 502 });
  updateJob(b.id, { tailoredResume: tex });
  return Response.json({ ok: true, length: tex.length });
}
