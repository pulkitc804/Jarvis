import { isBigTech, isUndergradRole } from "./internships";

/**
 * Live job-posting sources, in rough order of how early they see a role:
 *
 *  1. ATS boards (Greenhouse / Lever / Ashby) — the ORIGIN. A posting exists
 *     here the moment recruiting publishes it, hours-to-days before any
 *     community tracker picks it up, and each carries a real publish timestamp.
 *  2. Community GitHub trackers — broad coverage, but second-hand and batched.
 *  3. Reddit — where students often post a role minutes after it drops.
 *
 * All of it is plain HTTP against public endpoints: no API keys, no Claude
 * tokens, nothing charged against the subscription.
 */

export type DetectedJob = {
  company: string;
  role: string;
  url: string;
  location?: string;
  /** When the employer published it (ISO). Absent when a source doesn't say. */
  postedAt?: string;
  /** When Jarvis first saw it (ISO) — always set on write. */
  firstSeen?: string;
  source?: string;
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

async function getText(url: string, ms = 15000): Promise<string | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    const res = await fetch(url, { signal: c.signal, headers: { "user-agent": UA, accept: "*/*" } }).finally(() =>
      clearTimeout(t),
    );
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}
async function getJson<T>(url: string, ms = 15000): Promise<T | null> {
  const txt = await getText(url, ms);
  if (!txt) return null;
  try {
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ filters */

// Word-boundary "intern" — plain /intern/ also matches "International".
const INTERN_RE = /\bintern(ship|s)?\b|\bco-?op\b|\bstudent researcher\b|\buniversity (grad|program)\b|\bnew grad\b/i;
const TECH_RE =
  /software engineer|software dev|\bswe\b|\bsde\b|machine learning|\bml\b|\bai\b|data scien|data eng|applied scien|research (engineer|scientist|intern)|full.?stack|back.?end|front.?end|infrastructure|platform|computer vision|\bnlp\b|deep learning/i;
// Roles for a *future* summer. Anything explicitly tied to an older cycle is stale.
const TARGET_YEAR_RE = /\b2027\b/;
const STALE_YEAR_RE = /\b(2020|2021|2022|2023|2024|2025|2026)\b/;

/** Keep only undergrad-eligible tech internships for the target cycle. */
export function isTargetRole(title: string): boolean {
  if (!title) return false;
  if (!INTERN_RE.test(title)) return false;
  if (!TECH_RE.test(title)) return false;
  if (!isUndergradRole(title)) return false;
  // Explicitly 2027 wins; otherwise accept undated titles but reject old cycles.
  if (TARGET_YEAR_RE.test(title)) return true;
  return !STALE_YEAR_RE.test(title);
}

function cleanUrl(u: string): string {
  return u.replace(/[?&]utm_source=[^&]*/g, "").replace(/[?&]$/, "").trim();
}

function stripTags(s: string): string {
  return s
    .replace(/<br\s*\/?>|<\/br>/gi, ", ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\*\*/g, "")
    // Trackers decorate titles with status emoji (⏳ 🛂 🇺🇸 …) — strip them all.
    .replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------- 1. ATS boards */

type Ats = { company: string; slug: string; ats: "greenhouse" | "lever" | "ashby" };

// Curated, all verified to return live JSON. These are the origin of postings —
// add a company here and Jarvis sees its roles the hour they go up.
export const ATS_BOARDS: Ats[] = [
  { company: "Databricks", slug: "databricks", ats: "greenhouse" },
  { company: "Stripe", slug: "stripe", ats: "greenhouse" },
  { company: "Figma", slug: "figma", ats: "greenhouse" },
  { company: "Anthropic", slug: "anthropic", ats: "greenhouse" },
  { company: "Robinhood", slug: "robinhood", ats: "greenhouse" },
  { company: "Coinbase", slug: "coinbase", ats: "greenhouse" },
  { company: "Discord", slug: "discord", ats: "greenhouse" },
  { company: "Reddit", slug: "reddit", ats: "greenhouse" },
  { company: "Instacart", slug: "instacart", ats: "greenhouse" },
  { company: "Palantir", slug: "palantir", ats: "lever" },
  { company: "OpenAI", slug: "openai", ats: "ashby" },
  { company: "Notion", slug: "notion", ats: "ashby" },
];

type GhJob = {
  title: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
};
type LeverJob = {
  text: string;
  hostedUrl: string;
  createdAt?: number;
  categories?: { location?: string };
};
type AshbyJob = { title: string; jobUrl: string; publishedAt?: string; location?: string; isListed?: boolean };

async function fetchAtsBoard(b: Ats): Promise<DetectedJob[]> {
  const out: DetectedJob[] = [];
  if (b.ats === "greenhouse") {
    const d = await getJson<{ jobs?: GhJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs`);
    for (const j of d?.jobs || []) {
      if (!isTargetRole(j.title)) continue;
      out.push({
        company: b.company,
        role: stripTags(j.title),
        url: cleanUrl(j.absolute_url),
        location: j.location?.name,
        postedAt: j.first_published || j.updated_at,
        source: "greenhouse",
      });
    }
  } else if (b.ats === "lever") {
    const d = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${b.slug}?mode=json`);
    for (const j of Array.isArray(d) ? d : []) {
      if (!isTargetRole(j.text)) continue;
      out.push({
        company: b.company,
        role: stripTags(j.text),
        url: cleanUrl(j.hostedUrl),
        location: j.categories?.location,
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
        source: "lever",
      });
    }
  } else {
    const d = await getJson<{ jobs?: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${b.slug}`);
    for (const j of d?.jobs || []) {
      if (j.isListed === false) continue;
      if (!isTargetRole(j.title)) continue;
      out.push({
        company: b.company,
        role: stripTags(j.title),
        url: cleanUrl(j.jobUrl),
        location: j.location,
        postedAt: j.publishedAt,
        source: "ashby",
      });
    }
  }
  return out;
}

export async function fetchAllAts(): Promise<DetectedJob[]> {
  const results = await Promise.all(ATS_BOARDS.map((b) => fetchAtsBoard(b).catch(() => [])));
  return results.flat();
}

/* ------------------------------------------------- 2. Community GitHub trackers */

export const TRACKERS = [
  "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/README.md",
  "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/main/README.md",
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/README.md",
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/main/README.md",
  "https://raw.githubusercontent.com/cvrve/Summer2027-Internships/main/README.md",
  "https://raw.githubusercontent.com/Ouckah/Summer2027-Internships/main/README.md",
  "https://raw.githubusercontent.com/sndsh404/summer-2027-internships/main/README.md",
  "https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main/INTERN.md",
  "https://raw.githubusercontent.com/speedyapply/2026-SWE-College-Jobs/main/INTERN.md",
  "https://raw.githubusercontent.com/speedyapply/2026-AI-College-Jobs/main/INTERN.md",
  "https://raw.githubusercontent.com/coderQuad/New-Grad-Positions/main/README.md",
];

function parseTrackerTable(md: string): DetectedJob[] {
  const out: DetectedJob[] = [];
  let lastCompany = "";
  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    const [c0, roleRaw, locRaw, applyRaw] = cells;
    if (/^-+$/.test(c0) || /^company$/i.test(stripTags(c0))) continue;
    let company = stripTags(c0);
    if (!company || c0.includes("↳") || company === "↳") company = lastCompany;
    else lastCompany = company;
    if (!company) continue;
    const role = stripTags(roleRaw);
    // Tracker tables are already internship-scoped, so require the tech/undergrad
    // filters but not the literal word "intern" in every title.
    if (!TECH_RE.test(role) || !isUndergradRole(role)) continue;
    if (STALE_YEAR_RE.test(role) && !TARGET_YEAR_RE.test(role)) continue;
    const href = applyRaw.match(/href="([^"]+)"/) || applyRaw.match(/\((https?:\/\/[^)]+)\)/);
    if (!href) continue; // closed roles carry no apply link
    if (!isBigTech(company)) continue;
    out.push({ company, role, location: stripTags(locRaw), url: cleanUrl(href[1]), source: "tracker" });
  }
  return out;
}

export async function fetchAllTrackers(): Promise<DetectedJob[]> {
  const pages = await Promise.all(TRACKERS.map((u) => getText(u).catch(() => null)));
  return pages.filter(Boolean).flatMap((md) => parseTrackerTable(md as string));
}

/* ---------------------------------------------------------------- 3. Reddit */

// Reddit blocks its JSON API for non-browser clients, but the RSS feeds stay
// open. Students frequently post a role within minutes of it going live.
const SUBREDDITS = ["csMajors", "internships", "cscareerquestions"];

/** Apply links students paste into posts — the ones worth following. */
const APPLY_HOST_RE = /https?:\/\/(?:[\w.-]*\.)?(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|jobs\.apple\.com|amazon\.jobs|careers\.google\.com|metacareers\.com|smartrecruiters\.com|icims\.com)\/[^\s"'<>&]+/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// Most subreddit posts are questions ("anyone heard back after the OA?"), not
// openings. Requiring a real ATS apply link in the body is what separates a
// genuine "this just dropped" post from chatter — precision over volume, since
// these land in the same ledger as the employer feeds.
function parseRedditRss(xml: string): DetectedJob[] {
  const out: DetectedJob[] = [];
  const entries = xml.split("<entry>").slice(1);
  for (const e of entries) {
    const title = stripTags(decodeEntities(e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ""));
    if (!title || !isTargetRole(title)) continue;
    if (QUESTION_RE.test(title)) continue; // discussion, not a posting

    const content = decodeEntities(e.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || "");
    const applyLink = content.match(APPLY_HOST_RE)?.[0];
    if (!applyLink) continue; // no apply link → not an actionable posting

    const company = guessCompany(`${title} ${applyLink}`);
    if (!company) continue;

    out.push({
      company,
      role: title.slice(0, 160),
      url: cleanUrl(applyLink),
      postedAt: e.match(/<published>([^<]+)<\/published>/)?.[1],
      source: "reddit",
    });
  }
  return out;
}

/** Titles that are asking about a role rather than announcing one. */
const QUESTION_RE =
  /\?|\bhas anyone\b|\banyone (else|get|got|hear|know|receive)\b|\bhow do i\b|\bshould i\b|\bwhat (are|is|do)\b|\bdid (you|anyone)\b|\bam i\b|\bis it\b|\bhelp\b|\badvice\b|\brant\b|\bchances\b|\bresume review\b/i;

/** Pull a known big-tech name out of free text (Reddit titles, HN comments). */
const KNOWN_COMPANIES = [
  "Google", "Amazon", "Apple", "Microsoft", "Meta", "Nvidia", "Netflix", "Tesla", "Adobe",
  "Salesforce", "Uber", "Lyft", "Airbnb", "Databricks", "Stripe", "OpenAI", "Anthropic",
  "Palantir", "Snowflake", "TikTok", "ByteDance", "LinkedIn", "Coinbase", "Capital One",
  "Bloomberg", "Snap", "Pinterest", "DoorDash", "Roblox", "Figma", "Notion", "Datadog",
  "Cloudflare", "Reddit", "Discord", "Robinhood", "Instacart", "Intel", "Qualcomm", "IBM",
];
export function guessCompany(text: string): string | null {
  for (const c of KNOWN_COMPANIES) {
    if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) return c;
  }
  return null;
}

export async function fetchReddit(): Promise<DetectedJob[]> {
  const out: DetectedJob[] = [];
  // Sequential with a short gap: Reddit 429s concurrent hits from one IP.
  for (const s of SUBREDDITS) {
    const xml = await getText(`https://www.reddit.com/r/${s}/new.rss?limit=50`).catch(() => null);
    if (xml) out.push(...parseRedditRss(xml));
    await new Promise((r) => setTimeout(r, 1200));
  }
  return out;
}

/* ------------------------------------------------------ 4. Hacker News search */

type HnHit = { objectID: string; comment_text?: string; story_title?: string; created_at?: string };

/** HN "Who is hiring" comments and story text, searched newest-first. */
export async function fetchHackerNews(): Promise<DetectedJob[]> {
  const d = await getJson<{ hits?: HnHit[] }>(
    "https://hn.algolia.com/api/v1/search_by_date?query=%222027%22%20intern&tags=comment&hitsPerPage=50",
  );
  const out: DetectedJob[] = [];
  for (const h of d?.hits || []) {
    const text = stripTags(decodeEntities(h.comment_text || ""));
    if (!text || !isTargetRole(text)) continue;
    // Same rule as Reddit: an apply link is what makes it a posting, not a chat.
    const link = text.match(APPLY_HOST_RE)?.[0];
    if (!link) continue;
    const company = guessCompany(`${text.slice(0, 300)} ${link}`);
    if (!company) continue;
    out.push({
      company,
      role: text.replace(/\s+/g, " ").slice(0, 120),
      url: cleanUrl(link),
      postedAt: h.created_at,
      source: "hackernews",
    });
  }
  return out;
}

/* --------------------------------------------------------------- aggregate */

export type SourceReport = { source: string; found: number; ok: boolean };

/** Run every source concurrently; one failing source never blocks the rest. */
export async function fetchEverything(): Promise<{ jobs: DetectedJob[]; report: SourceReport[] }> {
  const tasks: Array<[string, Promise<DetectedJob[]>]> = [
    ["ats", fetchAllAts()],
    ["trackers", fetchAllTrackers()],
    ["reddit", fetchReddit()],
    ["hackernews", fetchHackerNews()],
  ];
  const settled = await Promise.all(
    tasks.map(async ([name, p]) => {
      try {
        return { name, jobs: await p, ok: true };
      } catch {
        return { name, jobs: [] as DetectedJob[], ok: false };
      }
    }),
  );
  return {
    jobs: settled.flatMap((s) => s.jobs),
    report: settled.map((s) => ({ source: s.name, found: s.jobs.length, ok: s.ok })),
  };
}
