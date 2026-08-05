/**
 * Fellowships and early-career programs — a different shape of opportunity to
 * a standard internship, and one a "SWE Intern 2027" filter throws away.
 *
 * These are the freshman/sophomore pipelines (Google STEP, Microsoft Explore,
 * Meta University), diversity and access fellowships (MLT, SEO, CodePath,
 * Rewriting the Code), and the insight/discovery days quant firms run for
 * first-years. They rarely say "intern" in the title and almost never say a
 * year, so they need their own detector rather than a loosened one.
 */

/**
 * Full-time roles that happen to contain program vocabulary — "Sr. Program
 * Manager, Data for Good", "Early Talent Program Coordinator". These are jobs
 * that run the programs, not seats in them.
 */
const NOT_A_STUDENT_ROLE_RE =
  /\b(sr\.?|senior|staff|principal|lead|head of|manager|director|coordinator|recruiter|representative|specialist|partner|executive|vp|president|architect|consultant)\b/i;

/**
 * Full-time bands that borrow programme vocabulary. "Early Career" at Notion
 * and Anduril is a new-grad FULL-TIME role, not a student programme, and this
 * tracker is for 2027 summer internships.
 */
const FULL_TIME_BAND_RE =
  /\b(early career|new ?grad(uate)?|entry[- ]level|full[- ]time|experienced)\b/i;

/** Programs must still be technical — a Teacher Fellow isn't in scope. */
const TECH_CONTEXT_RE =
  /\b(software|engineer|engineering|swe|sde|comput|data|machine learning|\bml\b|\bai\b|technolog|technical|tech|quant|trading|developer|cyber|security|product|research|stem|analytics)\b/i;

/** Named programs, matched case-insensitively as substrings of the title. */
const NAMED_PROGRAMS = [
  // Big tech early-career pipelines
  "step intern", "student training in engineering", "cssi", "computer science summer institute",
  "explore intern", "microsoft explore", "meta university", "above and beyond",
  "career prep", "uber career prep", "engineering residency", "apprenticeship",
  "futureforce", "future engineer", "ignite program", "nvidia ignite",
  "accelerate program", "catalyst program", "early insight", "insight program",
  // Re-admitted now that the seniority guard rejects the roles that RUN these
  // programmes — previously these pulled in coordinators and recruiters.
  "emerging talent", "early talent", "campus program",
  "university program", "student program", "launch program", "propel program",
  "amplify program", "launchpad", "pathways program", "bridge program",
  "immersion program", "externship", "pre-internship", "leadership development program", "software engineering program",   "discovery day", "discover program", "spring insight", "sophomore summit",
  "freshman leaders", "first year", "first-year", "rising sophomore", "rising freshman",
  // Finance / quant early programs
  "code for good", "data for good", "winning women", "advancing black pathways",
  "possibilities summit", "insight series", "early advantage", "trading challenge",
  "quant challenge", "estimathon", "academy program", "point72 academy",
  "discover citadel", "future leaders", "women in trading", "women in technology",
  "ftpp", "first year trading", "sig discovery", "imc discover", "optiver insight",
  // Fellowships & access programs
  "fellowship", "fellow program", "scholars program", "scholarship program",
  "mlt career prep", "management leadership for tomorrow", "seo career",
  "sponsors for educational opportunity", "codepath", "rewriting the code",
  "colorstack", "break through tech", "kleiner perkins fellow", "neo scholar",
  "thiel fellow", "interact fellow", "z fellows", "contrary", "pear garage",
];

/** Signals a program is aimed at first- or second-years even if unnamed. */
const EARLY_YEAR_RE =
  /\b(freshman|freshmen|sophomore|first[-\s]?year|second[-\s]?year|rising (freshman|sophomore)|1st year|2nd year|underclassmen|pre[-\s]?internship|early identification)\b/i;

// "residency" alone is a trap — Cloudflare's "Data Residency" is a systems
// role, not a program. It only counts in an explicit programme phrase above.
const FELLOWSHIP_RE = /\b(fellowship|fellow|scholars?\s+program|apprenticeship)\b/i;

const NAMED_RE = new RegExp(
  NAMED_PROGRAMS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i",
);

/** Programs that are explicitly for graduate students only. */
const GRAD_PROGRAM_RE = /\b(ph\.?d|doctoral|post-?doc|mba|master'?s|graduate students?)\b/i;

/**
 * True when a posting is a fellowship or an early-career program rather than a
 * standard internship. Deliberately independent of the 2027 filter: these open
 * on their own calendars and usually carry no year at all.
 */
export function isEarlyCareerProgram(title: string, company = ""): boolean {
  if (!title) return false;
  const t = `${title} ${company}`;
  if (GRAD_PROGRAM_RE.test(title)) return false;
  // Reject the roles that *run* these programs rather than seats in them.
  if (NOT_A_STUDENT_ROLE_RE.test(title)) return false;
  if (FULL_TIME_BAND_RE.test(title)) return false;

  // An explicit freshman/sophomore signal is enough on its own — that phrasing
  // is only ever used for student programs.
  if (EARLY_YEAR_RE.test(t)) return true;

  // Technical relevance is judged on the TITLE alone. Including the company
  // name here let "Finance Fellow" through at Scale AI purely because "AI" is
  // in the employer's name.
  if (!TECH_CONTEXT_RE.test(title)) return false;
  return NAMED_RE.test(t) || FELLOWSHIP_RE.test(title);
}

/** Which bucket a posting belongs in. */
export type OpportunityKind = "internship" | "program";

/** Label the flavour of program, for display. */
export function programKindLabel(title: string): string {
  if (/\bfellow(ship)?\b/i.test(title)) return "fellowship";
  if (EARLY_YEAR_RE.test(title)) return "freshman/soph";
  if (/\b(residency|apprenticeship)\b/i.test(title)) return "residency";
  if (/\b(scholars?|scholarship)\b/i.test(title)) return "scholars";
  if (/\b(insight|discovery|summit|challenge)\b/i.test(title)) return "insight day";
  return "program";
}
