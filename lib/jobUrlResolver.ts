import { getJson, request } from "./scraperCore";

/**
 * Turn a pasted apply link into a real job record.
 *
 * The channels that break news fastest (an Instagram post, a Discord drop, a
 * friend's text) can't be scraped, but they almost always carry the apply URL.
 * Pasting that link here gets the authoritative company, title, location and
 * publish date straight from the employer's own ATS — no typing, no guessing.
 */

export type ResolvedJob = {
  company: string;
  role: string;
  url: string;
  location?: string;
  postedAt?: string;
  ats?: string;
};

function titleCase(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function iso(v: string | number | undefined | null): string | undefined {
  if (v == null) return undefined;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

type GhJob = { title: string; absolute_url: string; updated_at?: string; first_published?: string; location?: { name?: string }; company_name?: string };
type LeverJob = { text: string; hostedUrl: string; createdAt?: number; categories?: { location?: string } };
type AshbyJob = { id: string; title: string; jobUrl: string; publishedAt?: string; location?: string };

export async function resolveJobUrl(rawUrl: string): Promise<ResolvedJob | { error: string }> {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return { error: "That doesn't look like a URL." };
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  // ── Greenhouse: job-boards.greenhouse.io/<board>/jobs/<id> (also boards.*)
  if (host.endsWith("greenhouse.io")) {
    const board = parts[0];
    const id = parts[parts.indexOf("jobs") + 1] || u.searchParams.get("gh_jid");
    if (board && id) {
      const d = await getJson<GhJob>(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`);
      if (d?.title) {
        return {
          company: d.company_name || titleCase(board),
          role: d.title,
          url: `https://job-boards.greenhouse.io/${board}/jobs/${id}`,
          location: d.location?.name,
          postedAt: iso(d.first_published || d.updated_at),
          ats: "greenhouse",
        };
      }
    }
  }

  // ── Lever: jobs.lever.co/<company>/<uuid>
  if (host.endsWith("lever.co")) {
    const [company, id] = parts;
    if (company && id) {
      const d = await getJson<LeverJob>(`https://api.lever.co/v0/postings/${company}/${id}`);
      if (d?.text) {
        return {
          company: titleCase(company),
          role: d.text,
          url: d.hostedUrl || rawUrl,
          location: d.categories?.location,
          postedAt: iso(d.createdAt),
          ats: "lever",
        };
      }
    }
  }

  // ── Ashby: jobs.ashbyhq.com/<company>/<uuid> — no single-posting endpoint,
  //    so pull the board and match on id.
  if (host.endsWith("ashbyhq.com")) {
    const [company, id] = parts;
    if (company) {
      const d = await getJson<{ jobs?: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${company}`);
      const hit = (d?.jobs || []).find((j) => j.id === id) || (d?.jobs || [])[0];
      if (hit && (!id || hit.id === id)) {
        return {
          company: titleCase(company),
          role: hit.title,
          url: hit.jobUrl || rawUrl,
          location: hit.location,
          postedAt: iso(hit.publishedAt),
          ats: "ashby",
        };
      }
    }
  }

  // ── Anything else: fall back to the page's own <title>, which is usually
  //    "<Role> - <Company>" or similar. Better than an empty form.
  const res = await request(rawUrl, { timeoutMs: 15000, retries: 1 });
  if (res.ok && res.body) {
    const raw = res.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
    const title = raw
      .replace(/&amp;/g, "&")
      .replace(/&#\d+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (title) {
      // Split on the usual separators to guess role vs company.
      const bits = title.split(/\s+[|–—-]\s+/).filter(Boolean);
      const company = bits.length > 1 ? bits[bits.length - 1] : titleCase(host.replace(/^(www|jobs|careers|boards)\./, "").split(".")[0]);
      const role = bits.length > 1 ? bits.slice(0, -1).join(" - ") : title;
      return { company: company.slice(0, 80), role: role.slice(0, 160), url: rawUrl, ats: "page-title" };
    }
  }

  return { error: "Couldn't read that posting — fill the fields in manually." };
}
