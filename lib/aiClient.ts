/**
 * Minimal Claude API caller for the internship subagents (score + tailor).
 * Uses ANTHROPIC_API_KEY if set, otherwise a Claude OAuth token
 * (CLAUDE_CODE_OAUTH_TOKEN, which carries user:inference). Server-side only.
 */

export type AiResult = { ok: true; text: string } | { ok: false; error: string; needsCreds?: boolean };

export function aiConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN);
}

export async function callClaude(opts: {
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<AiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const oauth = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!apiKey && !oauth) {
    return { ok: false, error: "AI not configured — set ANTHROPIC_API_KEY in .env.local.", needsCreds: true };
  }
  const headers: Record<string, string> = { "content-type": "application/json", "anthropic-version": "2023-06-01" };
  if (apiKey) headers["x-api-key"] = apiKey;
  else {
    headers["authorization"] = `Bearer ${oauth}`;
    headers["anthropic-beta"] = "oauth-2025-04-20";
  }
  const body: Record<string, unknown> = {
    model: opts.model || process.env.INTERNSHIP_MODEL || "claude-sonnet-4-6",
    max_tokens: opts.maxTokens || 2000,
    messages: [{ role: "user", content: opts.prompt }],
  };
  if (opts.system) body.system = opts.system;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `Claude API HTTP ${res.status}: ${t.slice(0, 220)}` };
    }
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("\n")
      .trim();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: (e as Error).name === "AbortError" ? "Claude request timed out." : (e as Error).message };
  }
}

/** Pull the first {...} JSON object out of a model response. */
export function extractJson<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}
