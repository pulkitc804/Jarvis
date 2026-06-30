import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { costForEntry, familyForModel } from "./pricing";

/**
 * Reads local Claude Code usage logs from ~/.claude/projects/<project>/*.jsonl
 * and aggregates real token usage + cost. No network, no API key — everything
 * is derived from files already on disk, so every number is verifiable:
 * the raw rows live in the files we report in `meta.files`.
 */

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

type Entry = {
  ts: number; // epoch ms
  model: string;
  project: string;
  session: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  costUSD: number;
  dedupKey: string;
};

type FileCache = { mtimeMs: number; size: number; entries: Entry[] };
// Persist across requests in the dev server so polling stays cheap: we only
// re-read files whose mtime/size changed.
const fileCache = new Map<string, FileCache>();

function localDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function listJsonlFiles(): string[] {
  // Walk recursively: usage lives both in top-level session transcripts
  // (<project>/<session>.jsonl) and in nested subagent transcripts
  // (<project>/<session>/subagents/agent-*.jsonl).
  const files: string[] = [];
  const stack: string[] = [PROJECTS_DIR];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && e.name.endsWith(".jsonl")) files.push(p);
    }
  }
  return files;
}

function parseFile(filePath: string, mtimeMs: number): Entry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const out: Entry[] = [];
  for (const line of raw.split("\n")) {
    // Cheap pre-filter: skip any line that can't be an assistant usage row.
    if (line.length < 40 || !line.includes('"input_tokens"')) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type !== "assistant") continue;
    const message = obj.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    if (!usage) continue;

    const model = (message?.model as string) || "unknown";
    const inputTokens = Number(usage.input_tokens) || 0;
    const outputTokens = Number(usage.output_tokens) || 0;
    const cacheReadTokens = Number(usage.cache_read_input_tokens) || 0;

    // Split cache writes into 5m / 1h tiers when the breakdown is present so
    // cost matches actual billing; otherwise fall back to the 5m rate.
    const cacheCreation = usage.cache_creation as Record<string, unknown> | undefined;
    const totalWrite = Number(usage.cache_creation_input_tokens) || 0;
    let cacheWrite5mTokens = 0;
    let cacheWrite1hTokens = 0;
    if (cacheCreation) {
      cacheWrite5mTokens = Number(cacheCreation.ephemeral_5m_input_tokens) || 0;
      cacheWrite1hTokens = Number(cacheCreation.ephemeral_1h_input_tokens) || 0;
    }
    if (cacheWrite5mTokens + cacheWrite1hTokens === 0 && totalWrite > 0) {
      cacheWrite5mTokens = totalWrite;
    }

    const tokens = { inputTokens, outputTokens, cacheReadTokens, cacheWrite5mTokens, cacheWrite1hTokens };
    // Fall back to the file's mtime (not epoch 0) for a missing/garbled
    // timestamp, so the row still lands in a real day bucket and totals stay
    // consistent with the daily/today series.
    const parsedTs = Date.parse((obj.timestamp as string) || "");
    const ts = Number.isFinite(parsedTs) ? parsedTs : mtimeMs;
    const cwd = (obj.cwd as string) || "";
    const project = cwd ? path.basename(cwd) : path.basename(path.dirname(filePath));
    const id = (message?.id as string) || "";
    const reqId = (obj.requestId as string) || "";
    const session = (obj.sessionId as string) || "";

    out.push({
      ts,
      model,
      project,
      session,
      ...tokens,
      costUSD: costForEntry(model, tokens),
      dedupKey: `${id}:${reqId}`,
    });
  }
  return out;
}

function loadAllEntries(): { entries: Entry[]; fileCount: number } {
  const files = listJsonlFiles();
  const all: Entry[] = [];
  for (const f of files) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(f);
    } catch {
      continue;
    }
    const cached = fileCache.get(f);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      all.push(...cached.entries);
      continue;
    }
    const entries = parseFile(f, stat.mtimeMs);
    fileCache.set(f, { mtimeMs: stat.mtimeMs, size: stat.size, entries });
    all.push(...entries);
  }
  return { entries: all, fileCount: files.length };
}

export type UsageSummary = {
  generatedAt: number;
  meta: {
    files: number;
    records: number;
    source: string;
    rates: string;
  };
  totals: {
    costUSD: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    sessions: number;
  };
  today: { costUSD: number; tokens: number; messages: number };
  last7DaysCostUSD: number;
  last30DaysCostUSD: number;
  daily: { date: string; costUSD: number; tokens: number }[];
  byModel: { model: string; family: string; costUSD: number; tokens: number; messages: number }[];
  byProject: { project: string; costUSD: number; tokens: number; messages: number }[];
};

export function getUsageSummary(): UsageSummary {
  const { entries: raw, fileCount } = loadAllEntries();

  // Dedup: the same assistant message can be logged multiple times — first as a
  // streaming/partial row (small output_tokens) and later as the final, complete
  // row. Keep the row with the largest output_tokens per (message id, requestId)
  // so output tokens and output cost aren't undercounted.
  const byKey = new Map<string, Entry>();
  const entries: Entry[] = [];
  for (const e of raw) {
    if (e.dedupKey === ":") {
      entries.push(e); // no message id / requestId — can't dedup, keep as-is
      continue;
    }
    const prev = byKey.get(e.dedupKey);
    if (!prev || e.outputTokens > prev.outputTokens) byKey.set(e.dedupKey, e);
  }
  entries.push(...byKey.values());

  const totals = {
    costUSD: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    sessions: 0,
  };

  const dayMap = new Map<string, { costUSD: number; tokens: number }>();
  const modelMap = new Map<string, { costUSD: number; tokens: number; messages: number }>();
  const projectMap = new Map<string, { costUSD: number; tokens: number; messages: number }>();

  const todayKey = localDayKey(Date.now());
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let last7 = 0;
  let last30 = 0;
  const today = { costUSD: 0, tokens: 0, messages: 0 };
  const sessions = new Set<string>();

  for (const e of entries) {
    if (e.session) sessions.add(e.session);
    const writeTokens = e.cacheWrite5mTokens + e.cacheWrite1hTokens;
    const tok = e.inputTokens + e.outputTokens + e.cacheReadTokens + writeTokens;

    totals.costUSD += e.costUSD;
    totals.totalTokens += tok;
    totals.inputTokens += e.inputTokens;
    totals.outputTokens += e.outputTokens;
    totals.cacheReadTokens += e.cacheReadTokens;
    totals.cacheWriteTokens += writeTokens;

    const dk = localDayKey(e.ts);
    const dEntry = dayMap.get(dk) || { costUSD: 0, tokens: 0 };
    dEntry.costUSD += e.costUSD;
    dEntry.tokens += tok;
    dayMap.set(dk, dEntry);

    const mEntry = modelMap.get(e.model) || { costUSD: 0, tokens: 0, messages: 0 };
    mEntry.costUSD += e.costUSD;
    mEntry.tokens += tok;
    mEntry.messages += 1;
    modelMap.set(e.model, mEntry);

    const pName = e.project || "unknown";
    const pEntry = projectMap.get(pName) || { costUSD: 0, tokens: 0, messages: 0 };
    pEntry.costUSD += e.costUSD;
    pEntry.tokens += tok;
    pEntry.messages += 1;
    projectMap.set(pName, pEntry);

    if (dk === todayKey) {
      today.costUSD += e.costUSD;
      today.tokens += tok;
      today.messages += 1;
    }
    if (e.ts >= now - 7 * day) last7 += e.costUSD;
    if (e.ts >= now - 30 * day) last30 += e.costUSD;
  }
  totals.sessions = sessions.size || fileCount;

  // Build a continuous 30-day daily series (fill gaps with zeros).
  const daily: { date: string; costUSD: number; tokens: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const key = localDayKey(now - i * day);
    const v = dayMap.get(key) || { costUSD: 0, tokens: 0 };
    daily.push({ date: key, costUSD: v.costUSD, tokens: v.tokens });
  }

  const byModel = [...modelMap.entries()]
    .map(([model, v]) => ({ model, family: familyForModel(model), ...v }))
    .sort((a, b) => b.costUSD - a.costUSD);

  const byProject = [...projectMap.entries()]
    .map(([project, v]) => ({ project, ...v }))
    .sort((a, b) => b.costUSD - a.costUSD)
    .slice(0, 8);

  return {
    generatedAt: now,
    meta: {
      files: fileCount,
      records: entries.length,
      source: PROJECTS_DIR,
      rates: "Opus $5/$25 · Sonnet $3/$15 · Haiku $1/$5 · Fable $10/$50 per 1M (in/out); cache read 0.1x, write 1.25x/2x",
    },
    totals,
    today,
    last7DaysCostUSD: last7,
    last30DaysCostUSD: last30,
    daily,
    byModel,
    byProject,
  };
}
