import { getJobById, updateJob } from "@/lib/internships";
import { readResume } from "@/lib/resume";
import { aiConfigured, callClaude, extractJson } from "@/lib/aiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchJobText(url: string): Promise<string> {
  if (!url) return "";
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    const res = await fetch(url, { signal: c.signal, headers: { "user-agent": "Mozilla/5.0" } }).finally(() => clearTimeout(t));
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000);
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { id?: string };
  if (!b.id) return Response.json({ error: "id required" }, { status: 400 });
  if (!aiConfigured())
    return Response.json({ error: "AI not configured — add ANTHROPIC_API_KEY to .env.local.", needsCreds: true }, { status: 400 });
  const job = getJobById(b.id);
  if (!job) return Response.json({ error: "job not found" }, { status: 404 });
  const resume = readResume();
  if (!resume.ok) return Response.json({ error: `resume.tex not found at ${resume.path}` }, { status: 400 });

  const jd = await fetchJobText(job.url);
  const prompt = `You are a resume-fit evaluator for a Rutgers CS undergrad targeting Summer 2027 SWE/AI-ML/Data internships.

COMPANY: ${job.company}
ROLE: ${job.role}
JOB POSTING (may be partial or empty):
${jd || "(could not fetch — infer typical requirements from the company + role title)"}

RESUME (LaTeX source):
${resume.text.slice(0, 8000)}

Return ONLY a JSON object:
{"score": <integer 0-100, resume↔role fit>, "worthTailoring": <true|false — would tailoring the resume meaningfully raise interview odds?>, "reason": "<1-2 sentences>", "missingKeywords": ["<up to 8 skills/keywords the role wants that the resume under-emphasizes>"]}`;

  const r = await callClaude({ prompt, model: process.env.INTERNSHIP_SCORE_MODEL, maxTokens: 800 });
  if (!r.ok) return Response.json({ error: r.error }, { status: 502 });
  const parsed = extractJson<{ score: number; worthTailoring: boolean; reason: string; missingKeywords: string[] }>(r.text);
  if (!parsed) return Response.json({ error: "could not parse AI response" }, { status: 502 });

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  const gaps = Array.isArray(parsed.missingKeywords) && parsed.missingKeywords.length ? ` · gaps: ${parsed.missingKeywords.join(", ")}` : "";
  updateJob(b.id, { score, worthTailoring: !!parsed.worthTailoring, scoreReason: (parsed.reason || "") + gaps });
  return Response.json({ ok: true, score, worthTailoring: !!parsed.worthTailoring, reason: parsed.reason, missingKeywords: parsed.missingKeywords });
}
