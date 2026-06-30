import { execFileSync } from "node:child_process";

/**
 * Best-effort fetch of the OFFICIAL Anthropic subscription usage from the same
 * endpoint Claude Code's `/usage` uses (`/api/oauth/usage`). This is the only
 * source of the true 5-hour and weekly limit percentages.
 *
 * Token resolution (server-side only — never sent to the browser):
 *   1. process.env.CLAUDE_CODE_OAUTH_TOKEN  (preferred; no keychain prompt)
 *   2. macOS keychain item "Claude Code-credentials"  (only if
 *      CLAUDE_OAUTH_FROM_KEYCHAIN=1, since reading it can pop a GUI prompt)
 *
 * If no valid token is available we return { available: false, reason } — we
 * never fabricate a percentage.
 */

const ENDPOINT = "https://api.anthropic.com/api/oauth/usage";

export type LimitWindow = {
  usedPct: number | null;
  resetsAt: number | null; // epoch ms
  used: number | null;
  allowed: number | null;
};

export type OfficialUsage =
  | {
      available: true;
      fiveHour: LimitWindow | null;
      sevenDay: LimitWindow | null;
      sevenDayOpus: LimitWindow | null;
      sevenDaySonnet: LimitWindow | null;
      fetchedAt: number;
    }
  | { available: false; reason: string };

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pctOf(w: Record<string, unknown> | undefined | null): number | null {
  if (!w || typeof w !== "object") return null;
  const usedPct = num(w.used_percentage);
  if (usedPct != null) return clamp(usedPct);
  const util = num(w.utilization);
  if (util != null) return clamp(util <= 1 ? util * 100 : util);
  const remPct = num(w.remaining_percentage);
  if (remPct != null) return clamp(100 - remPct);
  const used = num(w.used);
  const allowed = num(w.allowed);
  if (used != null && allowed != null && allowed > 0) return clamp((used / allowed) * 100);
  return null;
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}

function resetMs(w: Record<string, unknown> | undefined | null): number | null {
  if (!w) return null;
  const r = (w.resets_at ?? w.reset_at) as unknown;
  if (r == null) return null;
  if (typeof r === "number") return r < 1e12 ? r * 1000 : r;
  const t = Date.parse(String(r));
  return Number.isFinite(t) ? t : null;
}

function toWindow(w: Record<string, unknown> | undefined | null): LimitWindow | null {
  if (!w || typeof w !== "object") return null;
  const usedPct = pctOf(w);
  const resetsAt = resetMs(w);
  if (usedPct == null && resetsAt == null) return null;
  return { usedPct, resetsAt, used: num(w.used), allowed: num(w.allowed) };
}

function resolveToken(): { token: string } | { error: string } {
  const env = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (env && env.trim()) return { token: env.trim() };
  if (process.env.CLAUDE_OAUTH_FROM_KEYCHAIN !== "1") {
    return { error: "Set CLAUDE_CODE_OAUTH_TOKEN to show official Anthropic limits." };
  }
  try {
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { encoding: "utf8", timeout: 5000 },
    );
    const obj = JSON.parse(raw);
    const a = obj.claudeAiOauth || obj;
    const token: string = a.accessToken || "";
    const exp = a.expiresAt ? (a.expiresAt < 1e12 ? a.expiresAt * 1000 : a.expiresAt) : 0;
    if (!token) return { error: "No access token in keychain item." };
    if (exp && exp < Date.now()) return { error: "Claude Code token expired — sign in to Claude Code to refresh." };
    return { token };
  } catch {
    return { error: "Couldn't read the Claude Code keychain credential." };
  }
}

export async function getOfficialUsage(): Promise<OfficialUsage> {
  const t = resolveToken();
  if ("error" in t) return { available: false, reason: t.error };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(ENDPOINT, {
      headers: {
        Authorization: `Bearer ${t.token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "anthropic-version": "2023-06-01",
        "User-Agent": "jarvis-dashboard",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.status === 401) return { available: false, reason: "Token expired or invalid — sign in to Claude Code." };
    if (res.status === 429) return { available: false, reason: "Rate limited by Anthropic — try again shortly." };
    if (!res.ok) return { available: false, reason: `Anthropic returned HTTP ${res.status}.` };

    const data = (await res.json()) as Record<string, unknown>;
    const fiveHour = toWindow(data.five_hour as Record<string, unknown>);
    const sevenDay = toWindow(data.seven_day as Record<string, unknown>);
    const sevenDayOpus = toWindow(data.seven_day_opus as Record<string, unknown>);
    const sevenDaySonnet = toWindow(data.seven_day_sonnet as Record<string, unknown>);
    if (!fiveHour && !sevenDay) return { available: false, reason: "Usage response not recognized." };
    return { available: true, fiveHour, sevenDay, sevenDayOpus, sevenDaySonnet, fetchedAt: Date.now() };
  } catch (e) {
    return { available: false, reason: (e as Error).name === "AbortError" ? "Anthropic request timed out." : "Request failed." };
  }
}
