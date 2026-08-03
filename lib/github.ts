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
      /** True when a token is set, so private/org activity can be seen. */
      privateVisible: boolean;
      watchedRepos: string[];
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

type RepoCommit = { sha: string; commit: { message: string; author?: { date?: string } }; html_url: string; author?: { login?: string } };

/**
 * Commits you authored in a specific repo. This is how private/org work shows
 * up (e.g. the Blaze platform repo): the public events feed omits private
 * activity entirely, so those repos have to be read directly — which needs a
 * GITHUB_TOKEN whose account can see them.
 */
async function fetchRepoCommits(repo: string, author: string, signal: AbortSignal): Promise<GithubEvent[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits?author=${encodeURIComponent(author)}&per_page=10`,
      { headers: headers(), signal },
    );
    if (!res.ok) return [];
    const commits = (await res.json()) as RepoCommit[];
    if (!Array.isArray(commits)) return [];
    return commits.map((c) => ({
      id: c.sha,
      type: "PushEvent",
      repo,
      summary: (c.commit?.message || "").split("\n")[0].slice(0, 90) || "Commit",
      url: c.html_url,
      createdAt: c.commit?.author?.date ? new Date(c.commit.author.date).getTime() : Date.now(),
    }));
  } catch {
    return [];
  }
}

export async function getGithubActivity(): Promise<GithubSummary> {
  const username = process.env.GITHUB_USERNAME;
  if (!username) return { connected: false, reason: "Set GITHUB_USERNAME in .env.local." };
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.result;

  // Comma-separated "owner/repo" list — private repos included, given a token.
  const extraRepos = (process.env.GITHUB_REPOS || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  const hasToken = !!process.env.GITHUB_TOKEN;

  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 15000);
    const [profileRes, eventsRes, ...repoResults] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, { headers: headers(), signal: c.signal }),
      // With a token, /users/{u}/events includes private activity the public feed hides.
      fetch(`https://api.github.com/users/${username}/events${hasToken ? "" : "/public"}?per_page=30`, {
        headers: headers(),
        signal: c.signal,
      }),
      ...extraRepos.map((r) => fetchRepoCommits(r, username, c.signal)),
    ]).finally(() => clearTimeout(t));

    if (!profileRes.ok) return { connected: false, reason: `GitHub API error ${profileRes.status}` };
    const profile = await profileRes.json();
    const rawEvents = eventsRes.ok ? await eventsRes.json() : [];

    const feed = [
      ...(Array.isArray(rawEvents) ? rawEvents.map(summarize) : []),
      ...(repoResults as GithubEvent[][]).flat(),
    ];
    // Same commit can arrive from both the events feed and a direct repo read.
    const seen = new Set<string>();
    const events = feed
      .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 12);

    const result: GithubSummary = {
      connected: true,
      username,
      publicRepos: profile.public_repos ?? 0,
      followers: profile.followers ?? 0,
      events,
      fetchedAt: Date.now(),
      privateVisible: hasToken,
      watchedRepos: extraRepos,
    };
    cache = { at: Date.now(), result };
    return result;
  } catch (e) {
    return { connected: false, reason: `Couldn't reach GitHub: ${(e as Error).message}` };
  }
}
