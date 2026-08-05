/**
 * Fortune 500 companies that actually hire software / data interns.
 *
 * This is a curated subset of the F500 rather than all 500 — the omitted ones
 * are utilities, insurers, distributors and holding companies that don't run
 * SWE internship programs, so listing them would add no matches and a lot of
 * false-positive surface. Names are matched case-insensitively on word
 * boundaries after normalisation, so "Alphabet (Google)" and "Google LLC" both
 * resolve.
 *
 * NOT Fortune 500, deliberately tracked anyway (see NOTABLE below): SpaceX,
 * Palantir, Stripe, OpenAI, Databricks and similar are private or too small by
 * revenue to make the list, but are exactly the employers this search targets.
 */

export const FORTUNE_500 = [
  // Tech & software
  "apple", "microsoft", "alphabet", "google", "youtube", "amazon", "aws", "meta", "facebook",
  "instagram", "whatsapp", "nvidia", "intel", "ibm", "oracle", "cisco", "qualcomm", "amd",
  "broadcom", "micron", "texas instruments", "applied materials", "analog devices", "hp",
  "hewlett packard", "hpe", "dell", "salesforce", "adobe", "netflix", "uber", "lyft", "airbnb",
  "paypal", "block", "square", "intuit", "servicenow", "workday", "vmware", "palo alto networks",
  "crowdstrike", "fortinet", "snowflake", "datadog", "cloudflare", "twilio", "zoom", "dropbox",
  "ebay", "expedia", "booking", "doordash", "coinbase", "western digital", "seagate", "corning",
  "motorola", "arista", "juniper", "nortonlifelock", "gen digital", "sap", "accenture",
  "cognizant", "infosys", "dxc", "leidos", "booz allen", "caci", "saic", "gartner",

  // Finance, banking, payments, insurance
  "jpmorgan", "jpmorgan chase", "bank of america", "citigroup", "citi", "wells fargo",
  "goldman sachs", "morgan stanley", "american express", "capital one", "discover",
  "charles schwab", "blackrock", "blackstone", "state street", "bny mellon", "pnc",
  "us bancorp", "truist", "fifth third", "citizens financial", "ally", "synchrony",
  "visa", "mastercard", "fiserv", "fidelity national", "global payments", "berkshire hathaway",
  "progressive", "allstate", "geico", "travelers", "aig", "metlife", "prudential", "aflac",
  "cigna", "elevance", "humana", "centene", "unitedhealth", "nationwide", "liberty mutual",
  "mass mutual", "new york life", "northwestern mutual", "usaa", "tiaa", "principal financial",

  // Retail, consumer, media
  "walmart", "costco", "target", "home depot", "lowe's", "lowes", "best buy", "kroger",
  "walgreens", "cvs", "publix", "albertsons", "dollar general", "dollar tree", "tjx",
  "nordstrom", "macy's", "gap", "nike", "starbucks", "mcdonald's", "chipotle", "yum brands",
  "darden", "procter gamble", "unilever", "colgate", "kimberly clark", "general mills",
  "kellogg", "kraft heinz", "conagra", "campbell", "hershey", "mars", "pepsico", "coca cola",
  "keurig", "molson coors", "constellation brands", "estee lauder", "disney", "comcast",
  "nbcuniversal", "warner bros", "paramount", "fox", "charter", "dish", "sirius",

  // Healthcare & pharma
  "johnson johnson", "pfizer", "merck", "abbvie", "abbott", "bristol myers", "eli lilly",
  "amgen", "gilead", "moderna", "regeneron", "vertex", "biogen", "baxter", "becton dickinson",
  "boston scientific", "medtronic", "stryker", "zimmer", "danaher", "thermo fisher",
  "mckesson", "cencora", "cardinal health", "hca", "tenet", "labcorp", "quest diagnostics",

  // Industrial, aerospace, auto, energy
  "boeing", "lockheed martin", "raytheon", "rtx", "northrop grumman", "general dynamics",
  "l3harris", "honeywell", "ge", "general electric", "ge aerospace", "3m", "caterpillar",
  "deere", "john deere", "cummins", "paccar", "emerson", "eaton", "parker hannifin",
  "illinois tool works", "rockwell automation", "dover", "textron", "howmet",
  "ford", "general motors", "gm", "tesla", "rivian", "lucid", "goodyear", "borgwarner",
  "exxon", "exxonmobil", "chevron", "conocophillips", "marathon", "phillips 66", "valero",
  "schlumberger", "halliburton", "baker hughes", "duke energy", "nextera", "southern company",
  "dominion", "exelon", "aep", "sempra", "pg&e", "consolidated edison",

  // Transport, logistics, hospitality, telecom
  "ups", "fedex", "union pacific", "csx", "norfolk southern", "delta", "united airlines",
  "american airlines", "southwest airlines", "alaska air", "jetblue", "marriott", "hilton",
  "hyatt", "las vegas sands", "mgm resorts", "caesars", "royal caribbean", "carnival",
  "at&t", "verizon", "t-mobile", "lumen", "frontier communications",

  // Real estate, professional services, other
  "cbre", "jll", "aecom", "jacobs", "fluor", "kbr", "ecolab", "sherwin williams", "ppg",
  "dow", "dupont", "linde", "air products", "lyondellbasell", "nucor", "steel dynamics",
  "freeport", "newmont", "international paper", "westrock", "weyerhaeuser", "whirlpool",
  "stanley black decker", "masco", "mohawk", "lennar", "dr horton", "pultegroup", "nvr",
  "waste management", "republic services", "cintas", "aramark", "sysco", "us foods",
  "performance food", "tyson", "hormel", "smithfield", "adm", "bunge", "cargill",
];

/**
 * Not Fortune 500 by revenue, but squarely in scope for a big-tech internship
 * search — mostly private, pre-IPO, or high-value-but-small-revenue employers.
 * Kept separate so the distinction stays honest rather than pretending these
 * are F500.
 */
export const NOTABLE_NON_F500 = [
  "spacex", "palantir", "stripe", "openai", "anthropic", "databricks", "figma", "notion",
  "linkedin", "tiktok", "bytedance", "snap", "snapchat", "pinterest", "reddit", "discord",
  "roblox", "instacart", "robinhood", "plaid", "brex", "ramp", "scale ai", "scaleai",
  "anduril", "waymo", "cruise", "zoox", "nuro", "rivian", "bloomberg", "jane street",
  "citadel", "two sigma", "jump trading", "hudson river trading", "optiver", "imc",
  "de shaw", "millennium", "point72", "chicago trading", "akuna", "drw", "sig",
  "susquehanna", "spotify", "atlassian", "gitlab", "mongodb", "elastic", "hashicorp",
  "vercel", "cockroach", "confluent", "grafana", "samsara", "verkada", "affirm", "chime",
  "gusto", "flexport", "asana", "squarespace", "sofi", "marqeta", "betterment", "peloton",
];

function normalize(c: string): string {
  return c
    .toLowerCase()
    .replace(/[.,'’]/g, " ")
    .replace(/&/g, " ")
    .replace(/\b(inc|llc|corp|corporation|co|ltd|plc|holdings|group|company|technologies|technology|labs|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(list: string[], company: string): boolean {
  const n = " " + normalize(company) + " ";
  return list.some((t) => n.includes(" " + normalize(t) + " "));
}

export function isFortune500(company: string): boolean {
  return matches(FORTUNE_500, company);
}

export function isNotable(company: string): boolean {
  return matches(NOTABLE_NON_F500, company);
}

/** F500 or a notable private employer — the default "worth my time" tier. */
export function isTargetEmployer(company: string): boolean {
  return isFortune500(company) || isNotable(company);
}
