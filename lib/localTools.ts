import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

/**
 * Local, zero-API-key capability: compile a tailored LaTeX résumé to a PDF
 * (via tectonic) so Jarvis can show a real PDF preview in-app. Cached by
 * content hash so re-opening the same résumé is instant.
 */

const execFileAsync = promisify(execFile);

function resolveBin(candidates: string[]): string | null {
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export const TECTONIC_BIN = resolveBin(["/opt/homebrew/bin/tectonic", "/usr/local/bin/tectonic", "/usr/bin/tectonic"]);

export function tectonicAvailable(): boolean {
  return TECTONIC_BIN != null;
}

// A launchd-started server has a bare environment; give tectonic HOME (for its
// package cache) and a sane PATH.
const SUBPROC_ENV = {
  ...process.env,
  HOME: os.homedir(),
  PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
};

const PDF_CACHE = path.join(os.tmpdir(), "jarvis-pdf");

/** Where finished, ready-to-upload resumes land. */
export const SUBMIT_DIR = process.env.SUBMIT_RESUMES_DIR || path.join(os.homedir(), "Desktop", "submit resumes");

const LAST_NAME = process.env.RESUME_LAST_NAME || "Chaudhary";
const FIRST_NAME = process.env.RESUME_FIRST_NAME || "Pulkit";

/**
 * `Chaudhary_Pulkit_<Role>.pdf` — last name, first name, then the role, so the
 * files sort by candidate and read correctly to a recruiter downloading them.
 * The role is trimmed of the boilerplate that bloats ATS titles.
 */
export function submissionFileName(company: string, role: string, ext = "pdf"): string {
  const cleanRole = role
    .replace(/\((?:[^)]*)\)/g, " ") // drop parenthetical qualifiers
    .replace(/\b(summer|fall|spring|winter)?\s*20\d\d\b/gi, " ")
    .replace(/\b(united states|us|remote|multiple locations)\b/gi, " ")
    .replace(/[–—-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const company_ = company.replace(/[^\w\s]/g, "").replace(/\s+/g, "_").trim();
  const role_ = cleanRole.split(/\s+/).slice(0, 6).join("_");
  return `${LAST_NAME}_${FIRST_NAME}_${company_}_${role_}.${ext}`.replace(/_+/g, "_");
}

/** Compile a tailored resume and drop it in the submit folder, ready to upload. */
export async function saveSubmissionPdf(
  tex: string,
  company: string,
  role: string,
): Promise<{ ok: true; file: string } | { ok: false; error: string }> {
  try {
    const pdf = await compilePdf(tex);
    await fs.promises.mkdir(SUBMIT_DIR, { recursive: true });
    const file = path.join(SUBMIT_DIR, submissionFileName(company, role));
    await fs.promises.writeFile(file, pdf);
    // Keep the LaTeX beside it so the resume can be tweaked and recompiled.
    await fs.promises.writeFile(file.replace(/\.pdf$/, ".tex"), tex, "utf8");
    return { ok: true, file };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Compile LaTeX to a PDF (cached by content hash). Throws if tectonic is missing or the doc fails to build. */
export async function compilePdf(tex: string): Promise<Buffer> {
  if (!TECTONIC_BIN) throw new Error("tectonic not installed");
  const hash = crypto.createHash("sha1").update(tex).digest("hex").slice(0, 16);
  const pdfPath = path.join(PDF_CACHE, `${hash}.pdf`);
  try {
    return await fs.promises.readFile(pdfPath);
  } catch {
    /* not cached yet */
  }
  await fs.promises.mkdir(PDF_CACHE, { recursive: true });
  const texPath = path.join(PDF_CACHE, `${hash}.tex`);
  await fs.promises.writeFile(texPath, tex, "utf8");
  await execFileAsync(TECTONIC_BIN, [texPath, "--outdir", PDF_CACHE, "-c", "minimal", "--keep-logs"], {
    timeout: 90_000,
    env: SUBPROC_ENV,
  });
  return fs.promises.readFile(pdfPath);
}
