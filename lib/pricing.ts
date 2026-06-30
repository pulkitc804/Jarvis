/**
 * Per-model pricing for Claude, in USD per 1,000,000 tokens.
 * Source: the claude-api skill pricing table (cached 2026-06).
 *
 * Cache economics (relative to the model's input rate):
 *   - cache read         ≈ 0.10x input
 *   - cache write (5m)   ≈ 1.25x input
 *   - cache write (1h)   ≈ 2.00x input
 *
 * These multipliers are applied in costForEntry() below, so the cost we show
 * matches what the Claude API actually bills — not a rough estimate.
 */

export type Rate = { input: number; output: number };

// Keyed by a coarse family we can match from the model id string.
const FAMILY_RATES: Record<string, Rate> = {
  fable: { input: 10, output: 50 },
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
};

export const CACHE_MULTIPLIERS = {
  read: 0.1,
  write5m: 1.25,
  write1h: 2.0,
} as const;

export function familyForModel(model: string): keyof typeof FAMILY_RATES | "unknown" {
  const m = model.toLowerCase();
  if (m.includes("fable") || m.includes("mythos")) return "fable";
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  return "unknown";
}

export function rateForModel(model: string): Rate | null {
  const fam = familyForModel(model);
  return fam === "unknown" ? null : FAMILY_RATES[fam];
}

export type TokenBundle = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
};

/** Cost in USD for one usage record, using exact cache-tier multipliers. */
export function costForEntry(model: string, t: TokenBundle): number {
  const rate = rateForModel(model);
  if (!rate) return 0; // unknown / synthetic models — count tokens but no cost
  const inPerTok = rate.input / 1_000_000;
  const outPerTok = rate.output / 1_000_000;
  return (
    t.inputTokens * inPerTok +
    t.outputTokens * outPerTok +
    t.cacheReadTokens * inPerTok * CACHE_MULTIPLIERS.read +
    t.cacheWrite5mTokens * inPerTok * CACHE_MULTIPLIERS.write5m +
    t.cacheWrite1hTokens * inPerTok * CACHE_MULTIPLIERS.write1h
  );
}
