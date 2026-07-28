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
