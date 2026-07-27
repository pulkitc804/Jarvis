import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Primary resume source (LaTeX — ideal for keyword tailoring).
const RESUME_TEX = path.join(os.homedir(), "resume", "resume.tex");

export function readResume(): { ok: boolean; text: string; path: string } {
  try {
    return { ok: true, text: fs.readFileSync(RESUME_TEX, "utf8"), path: RESUME_TEX };
  } catch {
    return { ok: false, text: "", path: RESUME_TEX };
  }
}
