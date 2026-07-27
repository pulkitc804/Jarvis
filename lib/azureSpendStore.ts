import fs from "node:fs";
import path from "node:path";

export type AzureSpend = {
  azureSpend: number;
  budget: number;
  month: string;
  pct: number;
  updatedAt: number;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "azure-spend.json");

const DEFAULT: AzureSpend = {
  azureSpend: 0,
  budget: 0,
  month: "",
  pct: 0,
  updatedAt: 0,
};

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify(DEFAULT, null, 2), "utf8");
}

export function readAzureSpend(): AzureSpend {
  ensure();
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      return {
        azureSpend: typeof obj.azureSpend === "number" ? obj.azureSpend : 0,
        budget: typeof obj.budget === "number" ? obj.budget : 0,
        month: typeof obj.month === "string" ? obj.month : "",
        pct: typeof obj.pct === "number" ? obj.pct : 0,
        updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : 0,
      };
    }
    return { ...DEFAULT };
  } catch {
    return { ...DEFAULT };
  }
}

function writeAzureSpend(data: AzureSpend) {
  ensure();
  // Atomic write: serialize to a temp file then rename over the target. Rename
  // is atomic within a filesystem, so a reader never sees a partial file and a
  // crash mid-write leaves either the old or the new complete file — never a
  // truncated one that would parse-fail and wipe the stored value.
  const tmp = path.join(DATA_DIR, `azure-spend.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, FILE);
}

export function saveAzureSpend(
  patch: Pick<AzureSpend, "azureSpend" | "budget" | "month" | "pct">,
): AzureSpend {
  const data: AzureSpend = {
    azureSpend: patch.azureSpend,
    budget: patch.budget,
    month: patch.month,
    pct: patch.pct,
    updatedAt: Date.now(),
  };
  writeAzureSpend(data);
  return data;
}
