/**
 * Instant, deterministic résumé tailoring — no model call, no API key, no wait.
 *
 * It tailors by RE-EMPHASIS only: the skills categories are reordered so the
 * most role-relevant leads, and the most relevant project is promoted above the
 * other. Nothing is rewritten or generated, so every fact, number and phrase
 * stays exactly as written — which is both the honest constraint and the reason
 * this can run instantly.
 *
 * When ANTHROPIC_API_KEY is set the route prefers a model rewrite, which can
 * rephrase bullets; this is the always-available floor.
 */

export type SkillLabel = "Languages" | "Familiar" | "Frameworks & Tools" | "ML & AI" | "Practices" | "Awards & Orgs";

const DEFAULT_ORDER: SkillLabel[] = ["Languages", "Familiar", "Frameworks & Tools", "ML & AI", "Practices", "Awards & Orgs"];

type Focus = { order: SkillLabel[]; preferProject?: "guardian" | "scarletai" };

/** Map a role title to what should lead the résumé. */
export function focusFor(role: string, company = ""): Focus {
  const t = `${role} ${company}`.toLowerCase();

  const isML = /\b(ml|machine learning|ai|llm|aigc|genai|generative|nlp|deep learning|research scien|applied scien|data scien)\b/.test(t);
  const isInfra = /\b(infra|infrastructure|platform|devops|sre|site reliability|distributed|backend|systems|cloud)\b/.test(t);
  const isMobile = /\b(ios|android|mobile|swift|kotlin|app)\b/.test(t) || /\bapple\b/.test(t);
  const isData = /\b(data engineer|analytics|data analyst|etl|warehouse)\b/.test(t);

  if (isML) return { order: ["ML & AI", "Languages", "Frameworks & Tools", "Practices", "Familiar", "Awards & Orgs"], preferProject: "scarletai" };
  if (isInfra) return { order: ["Frameworks & Tools", "Languages", "Practices", "ML & AI", "Familiar", "Awards & Orgs"] };
  if (isMobile) return { order: ["Languages", "Familiar", "Frameworks & Tools", "ML & AI", "Practices", "Awards & Orgs"], preferProject: "guardian" };
  if (isData) return { order: ["Languages", "ML & AI", "Practices", "Frameworks & Tools", "Familiar", "Awards & Orgs"] };
  // Generic SWE: lead with languages and fundamentals.
  return { order: ["Languages", "Practices", "Frameworks & Tools", "ML & AI", "Familiar", "Awards & Orgs"] };
}

const LABEL_RE = /\\textbf\{(Languages|Familiar|Frameworks \\& Tools|ML \\& AI|Practices|Awards \\& Orgs):\}/g;

function texLabel(l: SkillLabel): string {
  return l.replace(/&/g, "\\&");
}

/** Reorder the Technical Skills lines in place. */
function applySkillOrder(tex: string, order: SkillLabel[]): string {
  const block = tex.match(/(\\textbf\{(?:Languages|Familiar|Frameworks \\& Tools|ML \\& AI|Practices|Awards \\& Orgs):\}[\s\S]*?)(\n\s*\}\})/);
  if (!block) return tex;

  const body = block[1];
  // Split the block into one entry per label.
  const starts: Array<{ label: string; idx: number }> = [];
  LABEL_RE.lastIndex = 0;
  for (let m = LABEL_RE.exec(body); m; m = LABEL_RE.exec(body)) starts.push({ label: m[1], idx: m.index });
  if (starts.length < 2) return tex;

  const entries = new Map<string, string>();
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].idx : body.length;
    entries.set(
      s.label,
      body
        .slice(s.idx, end)
        .replace(/\\\\\s*$/, "")
        .trim(),
    );
  });

  const wanted = [...order.map(texLabel), ...DEFAULT_ORDER.map(texLabel)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of wanted) {
    if (entries.has(label) && !seen.has(label)) {
      seen.add(label);
      out.push(entries.get(label) as string);
    }
  }
  if (out.length === 0) return tex;

  const rebuilt = out.join(" \\\\\n     ") + "\n";
  return tex.slice(0, block.index! ) + tex.slice(block.index!).replace(body, rebuilt);
}

/** Promote whichever project matches the role above the other. */
function applyProjectOrder(tex: string, prefer: "guardian" | "scarletai" | undefined): string {
  if (!prefer) return tex;
  const sec = tex.match(/(\\section\{Technical Projects\}[\s\S]*?)(\\resumeSubHeadingListEnd)/);
  if (!sec) return tex;
  const body = sec[1];
  const heads: number[] = [];
  const re = /\\resumeProjectHeading/g;
  for (let m = re.exec(body); m; m = re.exec(body)) heads.push(m.index);
  if (heads.length < 2) return tex;

  const pre = body.slice(0, heads[0]);
  const first = body.slice(heads[0], heads[1]).replace(/\\vspace\{-10pt\}/g, "").trimEnd();
  const second = body.slice(heads[1]).replace(/\\vspace\{-10pt\}/g, "").trimEnd();

  const firstIsGuardian = /Guardian/i.test(first);
  const wantGuardianFirst = prefer === "guardian";
  if (firstIsGuardian === wantGuardianFirst) return tex; // already in the right order

  const rebuilt = `${pre}${second}\n\n      \\vspace{-10pt}\n\n    ${first}\n\n`;
  return tex.slice(0, sec.index!) + rebuilt + tex.slice(sec.index! + body.length);
}

/**
 * Returns tailored LaTeX. Content words are guaranteed identical to the input —
 * only ordering changes — so this can never introduce a claim you didn't write.
 */
export function tailorResumeTex(baseTex: string, company: string, role: string): string {
  const focus = focusFor(role, company);
  let out = applySkillOrder(baseTex, focus.order);
  out = applyProjectOrder(out, focus.preferProject);
  return out;
}

/** Bag-of-words equality check used to prove nothing was invented. */
export function sameContentWords(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/\\[a-zA-Z]+\*?/g, " ")
      .replace(/[^A-Za-z0-9.%$]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 1)
      .sort()
      .join(" ");
  return norm(a) === norm(b);
}
