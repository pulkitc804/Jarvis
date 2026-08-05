import { isUndergradRole } from "./internships";
import { isTargetEmployer } from "./fortune500";
import { isEarlyCareerProgram, type OpportunityKind } from "./earlyCareer";
import { getJson, pool, postJson, request } from "./scraperCore";

/**
 * Live job-posting sources, ordered by how early they see a role:
 *
 *  1. Employer job boards (Greenhouse / Lever / Ashby / Workday / Amazon) — the
 *     ORIGIN. A posting exists here the moment recruiting publishes it, hours to
 *     days before any community tracker mirrors it, and most carry a real
 *     publish timestamp.
 *  2. Community GitHub trackers — broad, but second-hand and batched.
 *  3. Reddit / Hacker News — occasionally the fastest human signal, but only
 *     counted when a post carries a genuine apply link (see parseRedditRss).
 *
 * Everything is public HTTP: no API keys, no Claude tokens, nothing billed.
 */

export type DetectedJob = {
  company: string;
  role: string;
  url: string;
  location?: string;
  /** Employer's publish time (ISO) when the source reports one. */
  postedAt?: string;
  /** When Jarvis first saw it (ISO) — set on write. */
  firstSeen?: string;
  source?: string;
  /** internship | program — programs get their own section. */
  kind?: OpportunityKind;
};

/* ------------------------------------------------------------------ filters */

// Word-boundary "intern": plain /intern/ also matches "International".
const INTERN_RE = /\bintern(ship|s)?\b|\bco-?op\b|\bstudent researcher\b|\bnew grad\b|\buniversity grad\b/i;
const TECH_RE =
  /software engineer|software dev|\bswe\b|\bsde\b|machine learning|\bml\b|\bai\b|data scien|data eng|applied scien|research (engineer|scientist|intern)|full.?stack|back.?end|front.?end|infrastructure|platform|computer vision|\bnlp\b|deep learning|security engineer|systems engineer/i;
const TARGET_YEAR_RE = /\b2027\b/;
const STALE_YEAR_RE = /\b(2019|2020|2021|2022|2023|2024|2025|2026)\b/;

/** Undergrad-eligible tech internship for the target cycle. */
export function isTargetRole(title: string): boolean {
  if (!title) return false;
  if (!INTERN_RE.test(title)) return false;
  if (!TECH_RE.test(title)) return false;
  if (!isUndergradRole(title)) return false;
  if (TARGET_YEAR_RE.test(title)) return true; // explicit 2027 always wins
  return !STALE_YEAR_RE.test(title); // undated is fine; an older cycle is not
}

/**
 * Bucket a posting, or reject it. Programs are checked first: several genuinely
 * are internships too (Google STEP is an "Intern" title), and when a posting is
 * both, the program framing is the more useful one to file it under.
 */
export function classify(title: string, company = ""): OpportunityKind | null {
  if (!title) return null;
  if (isEarlyCareerProgram(title, company)) {
    // Programs skip the 2027 requirement — they run on their own calendars —
    // but a clearly past cycle is still stale.
    if (STALE_YEAR_RE.test(title) && !TARGET_YEAR_RE.test(title)) return null;
    return "program";
  }
  return isTargetRole(title) ? "internship" : null;
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
    .replace(/&nbsp;/g, " ")
    .replace(/\*\*/g, "")
    // trackers decorate titles with status emoji (⏳ 🛂 🇺🇸 …)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function iso(d: Date | number | string | undefined | null): string | undefined {
  if (d == null) return undefined;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/* ------------------------------------------------------- 1. employer boards */

export type Board =
  | { company: string; ats: "greenhouse" | "lever" | "ashby"; slug: string }
  | { company: string; ats: "workday"; host: string; tenant: string; site: string }
  | { company: string; ats: "amazon" };

/**
 * Every entry below was probed live and confirmed to return postings. Adding a
 * company here is all it takes for Jarvis to watch its board directly.
 */
export const BOARDS: Board[] = [
  // Greenhouse
  { company: "Databricks", ats: "greenhouse", slug: "databricks" },
  { company: "Stripe", ats: "greenhouse", slug: "stripe" },
  { company: "Figma", ats: "greenhouse", slug: "figma" },
  { company: "Anthropic", ats: "greenhouse", slug: "anthropic" },
  { company: "Robinhood", ats: "greenhouse", slug: "robinhood" },
  { company: "Coinbase", ats: "greenhouse", slug: "coinbase" },
  { company: "Discord", ats: "greenhouse", slug: "discord" },
  { company: "Reddit", ats: "greenhouse", slug: "reddit" },
  { company: "Instacart", ats: "greenhouse", slug: "instacart" },
  { company: "Airbnb", ats: "greenhouse", slug: "airbnb" },
  { company: "Pinterest", ats: "greenhouse", slug: "pinterest" },
  { company: "Lyft", ats: "greenhouse", slug: "lyft" },
  { company: "Cloudflare", ats: "greenhouse", slug: "cloudflare" },
  { company: "Datadog", ats: "greenhouse", slug: "datadog" },
  { company: "Roblox", ats: "greenhouse", slug: "roblox" },
  { company: "GitLab", ats: "greenhouse", slug: "gitlab" },
  { company: "Asana", ats: "greenhouse", slug: "asana" },
  { company: "Samsara", ats: "greenhouse", slug: "samsara" },
  { company: "Affirm", ats: "greenhouse", slug: "affirm" },
  { company: "Brex", ats: "greenhouse", slug: "brex" },
  { company: "Chime", ats: "greenhouse", slug: "chime" },
  { company: "Gusto", ats: "greenhouse", slug: "gusto" },
  { company: "Flexport", ats: "greenhouse", slug: "flexport" },
  { company: "Nuro", ats: "greenhouse", slug: "nuro" },
  { company: "MongoDB", ats: "greenhouse", slug: "mongodb" },
  { company: "Elastic", ats: "greenhouse", slug: "elastic" },
  { company: "Scale AI", ats: "greenhouse", slug: "scaleai" },
  { company: "Verkada", ats: "greenhouse", slug: "verkada" },
  { company: "Grafana Labs", ats: "greenhouse", slug: "grafanalabs" },
  { company: "Vercel", ats: "greenhouse", slug: "vercel" },
  { company: "Dropbox", ats: "greenhouse", slug: "dropbox" },
  { company: "SoFi", ats: "greenhouse", slug: "sofi" },
  { company: "Peloton", ats: "greenhouse", slug: "peloton" },
  { company: "Marqeta", ats: "greenhouse", slug: "marqeta" },
  { company: "Betterment", ats: "greenhouse", slug: "betterment" },
  { company: "Cockroach Labs", ats: "greenhouse", slug: "cockroachlabs" },
  { company: "Squarespace", ats: "greenhouse", slug: "squarespace" },
  { company: "SpaceX", ats: "greenhouse", slug: "spacex" },
  { company: "Chicago Trading Company", ats: "greenhouse", slug: "chicagotradingcampus" },
  // Lever
  { company: "Palantir", ats: "lever", slug: "palantir" },
  { company: "Spotify", ats: "lever", slug: "spotify" },
  { company: "Zoox", ats: "lever", slug: "zoox" },
  { company: "Match Group", ats: "lever", slug: "matchgroup" },
  // Ashby
  { company: "OpenAI", ats: "ashby", slug: "openai" },
  { company: "Notion", ats: "ashby", slug: "notion" },
  { company: "Ramp", ats: "ashby", slug: "ramp" },
  { company: "Cursor", ats: "ashby", slug: "cursor" },
  { company: "Linear", ats: "ashby", slug: "linear" },
  { company: "Sierra", ats: "ashby", slug: "sierra" },
  { company: "Harvey", ats: "ashby", slug: "harvey" },
  { company: "Mercor", ats: "ashby", slug: "mercor" },
  { company: "Modal", ats: "ashby", slug: "modal" },
  { company: "Perplexity", ats: "ashby", slug: "perplexity" },
  { company: "ElevenLabs", ats: "ashby", slug: "elevenlabs" },
  { company: "Replit", ats: "ashby", slug: "replit" },
  { company: "Vanta", ats: "ashby", slug: "vanta" },
  { company: "Decagon", ats: "ashby", slug: "decagon" },
  { company: "Abridge", ats: "ashby", slug: "abridge" },
  // Workday
  { company: "Nvidia", ats: "workday", host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" },
  { company: "Salesforce", ats: "workday", host: "salesforce.wd12.myworkdayjobs.com", tenant: "salesforce", site: "External_Career_Site" },
  { company: "Adobe", ats: "workday", host: "adobe.wd5.myworkdayjobs.com", tenant: "adobe", site: "external_experienced" },
  // Bespoke
  { company: "Amazon", ats: "amazon" },
];

type GhJob = { title: string; absolute_url: string; updated_at?: string; first_published?: string; location?: { name?: string } };
type LeverJob = { text: string; hostedUrl: string; createdAt?: number; categories?: { location?: string } };
type AshbyJob = { title: string; jobUrl: string; publishedAt?: string; location?: string; isListed?: boolean };
type WorkdayJob = { title: string; externalPath: string; locationsText?: string; postedOn?: string };
type AmazonJob = { title: string; job_path: string; posted_date?: string; city?: string; state?: string };

/** Workday reports "Posted 5 Days Ago" / "Posted Today" — approximate it. */
function parseWorkdayPosted(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const now = Date.now();
  if (/today/i.test(s)) return iso(now);
  if (/yesterday/i.test(s)) return iso(now - 864e5);
  const m = s.match(/(\d+)\+?\s*day/i);
  if (m) return iso(now - Number(m[1]) * 864e5);
  const mo = s.match(/(\d+)\+?\s*month/i);
  if (mo) return iso(now - Number(mo[1]) * 30 * 864e5);
  return undefined;
}

async function fetchBoard(b: Board): Promise<DetectedJob[]> {
  const out: DetectedJob[] = [];

  if (b.ats === "greenhouse") {
    const d = await getJson<{ jobs?: GhJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs`);
    for (const j of d?.jobs || []) {
      const kind = classify(j.title, b.company);
      if (!kind) continue;
      out.push({
        kind,
        company: b.company,
        role: stripTags(j.title),
        url: cleanUrl(j.absolute_url),
        location: j.location?.name,
        postedAt: iso(j.first_published || j.updated_at),
        source: "greenhouse",
      });
    }
  } else if (b.ats === "lever") {
    const d = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${b.slug}?mode=json`);
    for (const j of Array.isArray(d) ? d : []) {
      const kind = classify(j.text, b.company);
      if (!kind) continue;
      out.push({
        kind,
        company: b.company,
        role: stripTags(j.text),
        url: cleanUrl(j.hostedUrl),
        location: j.categories?.location,
        postedAt: iso(j.createdAt),
        source: "lever",
      });
    }
  } else if (b.ats === "ashby") {
    const d = await getJson<{ jobs?: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${b.slug}`);
    for (const j of d?.jobs || []) {
      if (j.isListed === false) continue;
      const kind = classify(j.title, b.company);
      if (!kind) continue;
      out.push({
        kind,
        company: b.company,
        role: stripTags(j.title),
        url: cleanUrl(j.jobUrl),
        location: j.location,
        postedAt: iso(j.publishedAt),
        source: "ashby",
      });
    }
  } else if (b.ats === "workday") {
    // Workday filters server-side, so ask it for interns instead of pulling
    // the whole board (these tenants carry 900+ postings each).
    for (const q of ["intern 2027", "internship"]) {
      const d = await postJson<{ jobPostings?: WorkdayJob[] }>(`https://${b.host}/wday/cxs/${b.tenant}/${b.site}/jobs`, {
        appliedFacets: {},
        limit: 20,
        offset: 0,
        searchText: q,
      });
      for (const j of d?.jobPostings || []) {
        const kind = classify(j.title, b.company);
        if (!kind) continue;
        out.push({
          kind,
          company: b.company,
          role: stripTags(j.title),
          url: `https://${b.host}/en-US/${b.site}${j.externalPath}`,
          location: j.locationsText,
          postedAt: parseWorkdayPosted(j.postedOn),
          source: "workday",
        });
      }
    }
  } else {
    // Note the /en/ path — the bare /search.json 302s there. Keep the queries
    // broad and let isTargetRole do the filtering: adding "2027" to the query
    // itself makes Amazon's search return nothing.
    const queries = ["software+engineer+intern", "software+development+engineer+intern", "data+scientist+intern", "machine+learning+intern"];
    const pages = await pool(queries, 2, (q) =>
      getJson<{ jobs?: AmazonJob[] }>(`https://www.amazon.jobs/en/search.json?base_query=${q}&result_limit=100`),
    );
    for (const d of pages) {
      for (const j of d?.jobs || []) {
        const kind = classify(j.title, "Amazon");
        if (!kind) continue;
        out.push({
          kind,
          company: "Amazon",
          role: stripTags(j.title),
          url: `https://www.amazon.jobs${j.job_path}`,
          location: [j.city, j.state].filter(Boolean).join(", ") || undefined,
          postedAt: iso(j.posted_date),
          source: "amazon",
        });
      }
    }
  }

  return out;
}

export async function fetchAllBoards(): Promise<DetectedJob[]> {
  // 10 in flight. Higher throttles: the ATS CDNs start refusing connections
  // somewhere past a dozen concurrent requests, which reads as "board dead".
  const results = await pool(BOARDS, 10, (b) => fetchBoard(b).catch(() => []));
  return results.filter(Boolean).flat();
}

/* ------------------------------------------- 2. community GitHub trackers */

/**
 * Curated trackers. Every URL here was verified to return a parseable table —
 * community repos rot fast (branches renamed, repos deleted, README formats
 * changed), and a 404 in this list is silent data loss. Use /HEAD/ rather than
 * a branch name so a default-branch rename doesn't break the fetch.
 */
export const TRACKERS = [
  // SimplifyJobs is the largest list and renders HTML tables, not pipe tables.
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/HEAD/README.md",
  "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/HEAD/README.md",
  "https://raw.githubusercontent.com/zapplyjobs/Internships-2027/HEAD/README.md",
  "https://raw.githubusercontent.com/Chieler/Summer-2027-SWE-Internships/HEAD/README.md",
  "https://raw.githubusercontent.com/sndsh404/summer-2027-internships/HEAD/README.md",
  "https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/HEAD/INTERN_INTL.md",
  "https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/HEAD/NEW_GRAD_USA.md",
  "https://raw.githubusercontent.com/ReaVNaiL/New-Grad-2024/HEAD/README.md",
];

/* ---------------------------------------------- tracker auto-discovery ----
 * A hardcoded tracker list goes stale: new community repos appear constantly
 * and old ones get abandoned. GitHub's search API can enumerate them by
 * "recently updated", so Jarvis finds new trackers on its own.
 *
 * Search is rate-limited (10 req/min unauthenticated), so the discovered list
 * is cached to disk and refreshed a few times a day; READMEs are then fetched
 * on the normal fast cadence.
 */

type RepoHit = { full_name: string; stargazers_count: number; updated_at: string; archived?: boolean; fork?: boolean };

const DISCOVERY_QUERIES = [
  "Summer+2027+internships+in%3Aname%2Cdescription",
  "2027+internship+list+in%3Aname%2Cdescription",
  "SWE+internships+2027+in%3Aname%2Cdescription",
];

/** Repo names that look like an internship listing rather than someone's app. */
const REPO_NAME_RE = /intern|jobs|new.?grad|hiring/i;

export async function discoverTrackerRepos(): Promise<string[]> {
  const found = new Map<string, RepoHit>();
  for (const q of DISCOVERY_QUERIES) {
    const d = await getJson<{ items?: RepoHit[] }>(
      `https://api.github.com/search/repositories?q=${q}&sort=updated&order=desc&per_page=30`,
      { headers: { accept: "application/vnd.github+json" }, retries: 1 },
    );
    for (const r of d?.items || []) {
      if (r.archived || r.fork) continue;
      if (!REPO_NAME_RE.test(r.full_name)) continue;
      // Skip the long tail of personal trackers with no listings in them.
      if (r.stargazers_count < 3) continue;
      found.set(r.full_name, r);
    }
  }
  return [...found.values()]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 25)
    .map((r) => r.full_name);
}

/** Candidate README paths — /HEAD/ resolves whatever the default branch is. */
export function readmeUrlsFor(repo: string): string[] {
  return [
    `https://raw.githubusercontent.com/${repo}/HEAD/README.md`,
    `https://raw.githubusercontent.com/${repo}/HEAD/INTERN.md`,
  ];
}

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
    // These tables are already internship-scoped, so don't demand the literal
    // word "intern" in every row — but the rest of the filters still apply.
    const kind = classify(role, company) ?? (TECH_RE.test(role) && isUndergradRole(role) && !(STALE_YEAR_RE.test(role) && !TARGET_YEAR_RE.test(role)) ? "internship" : null);
    if (!kind) continue;
    const href = applyRaw.match(/href="([^"]+)"/) || applyRaw.match(/\((https?:\/\/[^)]+)\)/);
    if (!href) continue; // closed roles carry no apply link
    if (!isTargetEmployer(company)) continue;
    out.push({ kind, company, role, location: stripTags(locRaw), url: cleanUrl(href[1]), source: "tracker" });
  }
  return out;
}

/** Discovered repo list, refreshed on a slow cadence and cached in memory. */
let discovered: { at: number; urls: string[] } | null = null;
const DISCOVERY_TTL = 6 * 60 * 60 * 1000;

async function trackerUrls(): Promise<string[]> {
  if (!discovered || Date.now() - discovered.at > DISCOVERY_TTL) {
    try {
      const repos = await discoverTrackerRepos();
      discovered = { at: Date.now(), urls: repos.flatMap(readmeUrlsFor) };
    } catch {
      discovered = discovered ?? { at: Date.now(), urls: [] };
    }
  }
  // Curated list first, then whatever discovery turned up; de-duplicated.
  return [...new Set([...TRACKERS, ...discovered.urls])];
}

/**
 * Several trackers — including SimplifyJobs, by far the largest — render their
 * listings as HTML tables rather than markdown pipe tables, so the pipe parser
 * silently returns nothing for them. Same columns, different markup.
 */
function parseTrackerHtmlTable(html: string): DetectedJob[] {
  const out: DetectedJob[] = [];
  let lastCompany = "";
  for (const row of html.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1]);
    if (cells.length < 4) continue;

    let company = stripTags(cells[0]);
    if (!company || company === "↳" || cells[0].includes("↳")) company = lastCompany;
    else lastCompany = company;
    if (!company || /^company$/i.test(company)) continue;

    const role = stripTags(cells[1]);
    if (!role) continue;
    const kind = classify(role, company) ?? (TECH_RE.test(role) && isUndergradRole(role) && !(STALE_YEAR_RE.test(role) && !TARGET_YEAR_RE.test(role)) ? "internship" : null);
    if (!kind) continue;

    // Closed roles render a lock/🔒 instead of an anchor.
    const href = cells[3].match(/href="([^"]+)"/);
    if (!href) continue;
    if (!isTargetEmployer(company)) continue;

    // Last column is an age like "0d" / "13d" — good enough for a posted date.
    const age = stripTags(cells[4] || "").match(/^(\d+)\s*d/i);
    const postedAt = age ? new Date(Date.now() - Number(age[1]) * 864e5).toISOString() : undefined;

    out.push({
      kind,
      company,
      role,
      location: stripTags(cells[2]),
      url: cleanUrl(href[1]),
      postedAt,
      source: "tracker",
    });
  }
  return out;
}

export async function fetchAllTrackers(): Promise<DetectedJob[]> {
  const urls = await trackerUrls();
  const pages = await pool(urls, 8, async (u) => (await request(u)).body);
  return pages.filter(Boolean).flatMap((body) => {
    const md = body as string;
    const rows = parseTrackerTable(md);
    // Fall back to the HTML-table shape when there are no pipe rows.
    return rows.length > 0 ? rows : parseTrackerHtmlTable(md);
  });
}

/** How many tracker READMEs are currently being watched (for the UI). */
export function trackerCount(): number {
  return new Set([...TRACKERS, ...(discovered?.urls || [])]).size;
}

/* ------------------------------------------------- 3. aggregator: Intern Insider
 * Their listing pages don't paginate server-side (every page returns the same
 * rows), but robots.txt allows the sitemap, and sitemap-seo/jobs-open
 * enumerates every open posting with a lastmod date — which sidesteps
 * pagination entirely. /api/ is Disallow'd in robots.txt, so it is never used.
 *
 * Links here point at Intern Insider's own page rather than the employer's ATS,
 * so this source is ranked below the employer boards: where the same role is
 * also on a company board, the direct copy wins and this one is dropped. It
 * therefore only ever contributes roles nothing else found.
 */
const INTERN_INSIDER_SITEMAP = "https://interninsider.me/sitemap-seo/jobs-open";
const II_TTL = 6 * 60 * 60 * 1000;
let iiCache: { at: number; jobs: DetectedJob[] } | null = null;

function deslug(s: string): string {
  return s
    .replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "") // trailing uuid
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/g, "AI")
    .replace(/\bMl\b/g, "ML")
    .replace(/\bSwe\b/g, "SWE")
    .replace(/\bSde\b/g, "SDE")
    .replace(/\bIxp\b/g, "iXp")
    .replace(/\b(Sap|Ibm|Aws|Hp|Ey|Pwc|Kpmg|Nvidia)\b/g, (w) =>
      w.toLowerCase() === "nvidia" ? "NVIDIA" : w.toUpperCase(),
    )
    .trim();
}

export async function fetchInternInsider(): Promise<DetectedJob[]> {
  if (iiCache && Date.now() - iiCache.at < II_TTL) return iiCache.jobs;

  const res = await request(INTERN_INSIDER_SITEMAP, { timeoutMs: 30000, retries: 1 });
  if (!res.ok || !res.body) return iiCache?.jobs ?? [];

  const out: DetectedJob[] = [];
  const re = /<loc>(.*?)<\/loc>\s*<lastmod>(.*?)<\/lastmod>/g;
  for (let m = re.exec(res.body); m; m = re.exec(res.body)) {
    const [, loc, lastmod] = m;
    const slug = loc.replace("https://interninsider.me/internships/", "");
    const parts = slug.split("/");
    if (parts.length < 2) continue;

    const company = deslug(parts[0]);
    const role = deslug(parts[1]);
    // Filter the raw slug too: de-slugging splits "masters" into "Master S",
    // which slips past the graduate-only check that the raw text catches.
    const rawRole = parts[1].replace(/-[0-9a-f-]{30,}$/i, "").replace(/-+/g, " ");
    const kind = classify(role, company);
    if (!kind || (kind === "internship" && !isTargetRole(rawRole))) continue;
    if (!isTargetEmployer(company)) continue; // their catalogue is mostly non-tech

    out.push({
      kind,
      company,
      role,
      url: loc,
      // lastmod is when the listing changed, not strictly when it was posted —
      // close enough to order by, and the dedupe prefers a board's real date.
      postedAt: iso(lastmod),
      source: "interninsider",
    });
  }

  iiCache = { at: Date.now(), jobs: out };
  return out;
}

/* ---------------------------------------------------------------- 4. social */

const SUBREDDITS = ["csMajors", "internships", "cscareerquestions", "developersIndia"];

const APPLY_HOST_RE =
  /https?:\/\/(?:[\w.-]*\.)?(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|jobs\.apple\.com|amazon\.jobs|careers\.google\.com|metacareers\.com|smartrecruiters\.com|icims\.com|workable\.com)\/[^\s"'<>&)]+/i;

/** Titles that ask about a role rather than announce one. */
const QUESTION_RE =
  /\?|\bhas anyone\b|\banyone (else|get|got|hear|know|receive)\b|\bhow do i\b|\bshould i\b|\bwhat (are|is|do)\b|\bdid (you|anyone)\b|\bam i\b|\bis it\b|\bhelp\b|\badvice\b|\brant\b|\bchances\b|\bresume review\b/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Most subreddit posts are questions, not openings. Requiring a real ATS apply
 * link is what separates "this just dropped" from chatter — these land in the
 * same ledger as employer feeds, so precision matters more than volume here.
 */
function parseRedditRss(xml: string): DetectedJob[] {
  const out: DetectedJob[] = [];
  for (const e of xml.split("<entry>").slice(1)) {
    const title = stripTags(decodeEntities(e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ""));
    if (!title || QUESTION_RE.test(title)) continue;
    const kind = classify(title);
    if (!kind) continue;
    const content = decodeEntities(e.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || "");
    const applyLink = content.match(APPLY_HOST_RE)?.[0];
    if (!applyLink) continue;
    const company = guessCompany(`${title} ${applyLink}`);
    if (!company) continue;
    out.push({
      kind,
      company,
      role: title.slice(0, 160),
      url: cleanUrl(applyLink),
      postedAt: iso(e.match(/<published>([^<]+)<\/published>/)?.[1]),
      source: "reddit",
    });
  }
  return out;
}

const KNOWN_COMPANIES = [
  "Google", "Amazon", "Apple", "Microsoft", "Meta", "Nvidia", "Netflix", "Tesla", "Adobe",
  "Salesforce", "Uber", "Lyft", "Airbnb", "Databricks", "Stripe", "OpenAI", "Anthropic",
  "Palantir", "Snowflake", "TikTok", "ByteDance", "LinkedIn", "Coinbase", "Capital One",
  "Bloomberg", "Snap", "Pinterest", "DoorDash", "Roblox", "Figma", "Notion", "Datadog",
  "Cloudflare", "Reddit", "Discord", "Robinhood", "Instacart", "Intel", "Qualcomm", "IBM",
  "Spotify", "Zoox", "Ramp", "Cursor", "Asana", "GitLab", "Affirm", "Brex", "Samsara",
];
export function guessCompany(text: string): string | null {
  for (const c of KNOWN_COMPANIES) {
    if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) return c;
  }
  return null;
}

export async function fetchReddit(): Promise<DetectedJob[]> {
  // scraperCore serialises reddit.com and spaces the requests, so this is safe.
  const feeds = await pool(SUBREDDITS, 4, async (s) => (await request(`https://www.reddit.com/r/${s}/new.rss?limit=50`)).body);
  return feeds.filter(Boolean).flatMap((x) => parseRedditRss(x as string));
}

type HnHit = { objectID: string; comment_text?: string; created_at?: string };

export async function fetchHackerNews(): Promise<DetectedJob[]> {
  const out: DetectedJob[] = [];
  const queries = ["%222027%22%20intern", "intern%202027%20apply"];
  const pages = await pool(queries, 2, (q) =>
    getJson<{ hits?: HnHit[] }>(`https://hn.algolia.com/api/v1/search_by_date?query=${q}&tags=comment&hitsPerPage=50`),
  );
  for (const d of pages) {
    for (const h of d?.hits || []) {
      const text = stripTags(decodeEntities(h.comment_text || ""));
      if (!text) continue;
      const kind = classify(text);
      if (!kind) continue;
      const link = text.match(APPLY_HOST_RE)?.[0];
      if (!link) continue; // same rule as Reddit
      const company = guessCompany(`${text.slice(0, 300)} ${link}`);
      if (!company) continue;
      out.push({
        kind,
        company,
        role: text.replace(/\s+/g, " ").slice(0, 120),
        url: cleanUrl(link),
        postedAt: iso(h.created_at),
        source: "hackernews",
      });
    }
  }
  return out;
}

/* --------------------------------------------------------------- aggregate */

export type SourceReport = { source: string; found: number; ok: boolean; ms: number };

/** Run every family concurrently; a failing family never blocks the others. */
export async function fetchEverything(): Promise<{ jobs: DetectedJob[]; report: SourceReport[] }> {
  const families: Array<[string, () => Promise<DetectedJob[]>]> = [
    ["boards", fetchAllBoards],
    ["trackers", fetchAllTrackers],
    ["interninsider", fetchInternInsider],
    ["reddit", fetchReddit],
    ["hackernews", fetchHackerNews],
  ];

  const settled = await Promise.all(
    families.map(async ([name, run]) => {
      const t0 = Date.now();
      try {
        const jobs = await run();
        return { name, jobs, ok: true, ms: Date.now() - t0 };
      } catch {
        return { name, jobs: [] as DetectedJob[], ok: false, ms: Date.now() - t0 };
      }
    }),
  );

  return {
    jobs: settled.flatMap((s) => s.jobs),
    report: settled.map((s) => ({ source: s.name, found: s.jobs.length, ok: s.ok, ms: s.ms })),
  };
}

/** How many employer boards are being watched — surfaced in the UI. */
export const BOARD_COUNT = BOARDS.length;
