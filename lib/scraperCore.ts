/**
 * HTTP core for the job scraper.
 *
 * Everything the scraper hits is a public endpoint, but it hits a lot of them
 * every few minutes, so this layer exists to be a good citizen and to stay fast:
 *   - a concurrency pool, so 40+ boards never open 40 sockets at once
 *   - conditional GET (ETag / Last-Modified) so unchanged boards cost ~nothing
 *   - bounded retries with exponential backoff + jitter on transient failures
 *   - per-host serialisation for hosts that rate-limit aggressively
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export type FetchResult = {
  ok: boolean;
  status: number;
  /** True when the server answered 304 and we served the cached body. */
  notModified: boolean;
  body: string | null;
  ms: number;
  error?: string;
};

type CacheEntry = { etag?: string; lastModified?: string; body: string };
const conditionalCache = new Map<string, CacheEntry>();

/** Hosts that punish parallelism — requests to these are serialised. */
const SERIAL_HOSTS = [/(^|\.)reddit\.com$/i];
const hostChains = new Map<string, Promise<unknown>>();

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function once(url: string, init: RequestInit, timeoutMs: number): Promise<FetchResult> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const cached = conditionalCache.get(url);
    const headers: Record<string, string> = {
      "user-agent": UA,
      accept: "application/json,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9",
      ...((init.headers as Record<string, string>) || {}),
    };
    if (cached?.etag) headers["if-none-match"] = cached.etag;
    if (cached?.lastModified) headers["if-modified-since"] = cached.lastModified;

    const res = await fetch(url, { ...init, headers, signal: ctrl.signal });
    const ms = Date.now() - started;

    if (res.status === 304 && cached) {
      return { ok: true, status: 304, notModified: true, body: cached.body, ms };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, notModified: false, body: null, ms, error: `HTTP ${res.status}` };
    }

    const body = await res.text();
    const etag = res.headers.get("etag") || undefined;
    const lastModified = res.headers.get("last-modified") || undefined;
    // Only worth caching when the server gave us a validator to send back.
    if (etag || lastModified) conditionalCache.set(url, { etag, lastModified, body });

    return { ok: true, status: res.status, notModified: false, body, ms };
  } catch (e) {
    const err = e as Error;
    return {
      ok: false,
      status: 0,
      notModified: false,
      body: null,
      ms: Date.now() - started,
      error: err.name === "AbortError" ? "timeout" : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export type RequestOpts = {
  timeoutMs?: number;
  retries?: number;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
};

/** Retryable: transient network errors, rate limits, and 5xx. */
function shouldRetry(r: FetchResult): boolean {
  return !r.ok && (r.status === 0 || r.status === 429 || r.status >= 500);
}

export async function request(url: string, opts: RequestOpts = {}): Promise<FetchResult> {
  const { timeoutMs = 15000, retries = 2, method = "GET", body, headers } = opts;
  const init: RequestInit = { method, body, headers };

  const run = async (): Promise<FetchResult> => {
    let last: FetchResult = { ok: false, status: 0, notModified: false, body: null, ms: 0, error: "not attempted" };
    for (let attempt = 0; attempt <= retries; attempt++) {
      last = await once(url, init, timeoutMs);
      if (last.ok || !shouldRetry(last)) return last;
      if (attempt < retries) {
        // exponential backoff with jitter, so retries don't sync up across sources
        const wait = Math.min(400 * 2 ** attempt, 4000) + Math.floor(Math.random() * 250);
        await sleep(wait);
      }
    }
    return last;
  };

  const host = hostOf(url);
  if (!SERIAL_HOSTS.some((re) => re.test(host))) return run();

  // Chain requests to this host end-to-end, with a gap between them.
  const prev = hostChains.get(host) ?? Promise.resolve();
  const next = prev.then(() => run()).then(async (r) => {
    await sleep(1200);
    return r;
  });
  hostChains.set(
    host,
    next.catch(() => undefined),
  );
  return next;
}

export async function getJson<T>(url: string, opts: RequestOpts = {}): Promise<T | null> {
  const r = await request(url, opts);
  if (!r.ok || !r.body) return null;
  try {
    return JSON.parse(r.body) as T;
  } catch {
    return null;
  }
}

export async function postJson<T>(url: string, payload: unknown, opts: RequestOpts = {}): Promise<T | null> {
  return getJson<T>(url, {
    ...opts,
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
  });
}

/** Run tasks with a bounded number in flight; never rejects. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = undefined as R;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

/** Number of URLs currently held in the conditional-GET cache. */
export function cachedUrlCount(): number {
  return conditionalCache.size;
}
