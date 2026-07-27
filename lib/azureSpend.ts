/**
 * Month-to-date Azure spend via the Cost Management API. Reuses the same Azure
 * service-principal you'd set up for the Foundry backend:
 *   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SUBSCRIPTION_ID
 * The service principal needs the "Cost Management Reader" role on the
 * subscription. Credentials stay server-side; only a total figure is shown.
 */

export type AzureSpend =
  | { connected: true; mtdCost: number; currency: string; scope: string; fetchedAt: number }
  | { connected: false; reason: string };

let cache: { at: number; result: AzureSpend } | null = null;

function cfg() {
  const tenant = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const secret = process.env.AZURE_CLIENT_SECRET;
  const sub = process.env.AZURE_SUBSCRIPTION_ID;
  if (tenant && clientId && secret && sub) return { tenant, clientId, secret, sub };
  return null;
}

async function getToken(c: NonNullable<ReturnType<typeof cfg>>): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: c.clientId,
    client_secret: c.secret,
    scope: "https://management.azure.com/.default",
  });
  const res = await fetch(`https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Azure auth failed (HTTP ${res.status})`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("No access token from Azure");
  return json.access_token;
}

export async function getAzureSpend(): Promise<AzureSpend> {
  const c = cfg();
  if (!c) {
    return {
      connected: false,
      reason: "Set AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_SUBSCRIPTION_ID in .env.local.",
    };
  }
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.result;

  try {
    const token = await getToken(c);
    const scope = `subscriptions/${c.sub}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(
      `https://management.azure.com/${scope}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          type: "ActualCost",
          timeframe: "MonthToDate",
          dataset: {
            granularity: "None",
            aggregation: { totalCost: { name: "Cost", function: "Sum" } },
          },
        }),
      },
    ).finally(() => clearTimeout(timer));

    if (res.status === 401 || res.status === 403) {
      return { connected: false, reason: "Azure denied access — the service principal needs 'Cost Management Reader' on the subscription." };
    }
    if (!res.ok) return { connected: false, reason: `Azure Cost API returned HTTP ${res.status}.` };

    const data = (await res.json()) as {
      properties?: { columns?: { name: string }[]; rows?: (string | number)[][] };
    };
    const cols = data.properties?.columns || [];
    const rows = data.properties?.rows || [];
    const costIdx = cols.findIndex((c2) => /cost/i.test(c2.name));
    const curIdx = cols.findIndex((c2) => /currency/i.test(c2.name));
    const row = rows[0] || [];
    const mtdCost = Number(row[costIdx >= 0 ? costIdx : 0]) || 0;
    const currency = String(row[curIdx >= 0 ? curIdx : 1] || process.env.AZURE_COST_CURRENCY || "USD");

    const result: AzureSpend = { connected: true, mtdCost, currency, scope, fetchedAt: Date.now() };
    cache = { at: Date.now(), result };
    return result;
  } catch (e) {
    return { connected: false, reason: (e as Error).name === "AbortError" ? "Azure request timed out." : `Azure error: ${(e as Error).message}` };
  }
}
