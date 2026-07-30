/**
 * Recent public GitHub activity — the unauthenticated REST API (60 req/hr per
 * IP, plenty for a personal dashboard polling every few minutes with a cache).
 * Set GITHUB_TOKEN in .env.local to raise that ceiling if needed.
 */

export type GithubEvent = {
  id: string;
  type: string;
  repo: string;
  summary: string;
  url: string;
  createdAt: number;
};

export type GithubSummary =
  | {
      connected: true;
      username: string;
      publicRepos: number;
      followers: number;
      events: GithubEvent[];
      fetchedAt: number;
    }
  | { connected: false; reason: string };

let cache: { at: number; result: GithubSummary } | null = null;
const CACHE_MS = 5 * 60 * 1000;

function headers() {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "jarvis-dashboard" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

function summarize(ev: { type: string; repo?: { name: string }; payload?: Record<string, unknown>; created_at: string; id: string }): GithubEvent {
  const repo = ev.repo?.name || "unknown/repo";
  const url = `https://github.com/${repo}`;
  let summary = ev.type.replace(/Event$/, "");
  const payload = ev.payload || {};
  if (ev.type === "PushEvent") {
    // `commits` is omitted on some payloads; `size` (total commits pushed) is
    // the reliable count, so prefer it and fall back to the array length.
    const size = typeof payload.size === "number" ? payload.size : 0;
    const commits = size || (Array.isArray(payload.commits) ? payload.commits.length : 0);
    summary = commits > 0 ? `Pushed ${commits} commit${commits === 1 ? "" : "s"}` : "Pushed";
  } else if (ev.type === "PullRequestEvent") {
    summary = `${String(payload.action || "updated")} PR`;
  } else if (ev.type === "IssuesEvent") {
    summary = `${String(payload.action || "updated")} issue`;
  } else if (ev.type === "CreateEvent") {
    summary = `Created ${String(payload.ref_type || "ref")}`;
  } else if (ev.type === "WatchEvent") {
    summary = "Starred";
  } else if (ev.type === "ForkEvent") {
    summary = "Forked";
  }
  return { id: ev.id, type: ev.type, repo, summary, url, createdAt: new Date(ev.created_at).getTime() };
}

export async function getGithubActivity(): Promise<GithubSummary> {
  const username = process.env.GITHUB_USERNAME;
  if (!username) return { connected: false, reason: "Set GITHUB_USERNAME in .env.local." };
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.result;

  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    const [profileRes, eventsRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, { headers: headers(), signal: c.signal }),
      fetch(`https://api.github.com/users/${username}/events/public?per_page=15`, { headers: headers(), signal: c.signal }),
    ]).finally(() => clearTimeout(t));

    if (!profileRes.ok) return { connected: false, reason: `GitHub API error ${profileRes.status}` };
    const profile = await profileRes.json();
    const rawEvents = eventsRes.ok ? await eventsRes.json() : [];

    const result: GithubSummary = {
      connected: true,
      username,
      publicRepos: profile.public_repos ?? 0,
      followers: profile.followers ?? 0,
      events: Array.isArray(rawEvents) ? rawEvents.slice(0, 8).map(summarize) : [],
      fetchedAt: Date.now(),
    };
    cache = { at: Date.now(), result };
    return result;
  } catch (e) {
    return { connected: false, reason: `Couldn't reach GitHub: ${(e as Error).message}` };
  }
}
