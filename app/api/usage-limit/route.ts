import { getOfficialUsage } from "@/lib/officialUsage";
import { readPlanUsage } from "@/lib/planUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Primary: the Claude desktop app's local usage cache (the exact %s /usage
  // shows — no token needed). Fall back to the OAuth endpoint if unavailable.
  const plan = readPlanUsage();
  if (plan.available) {
    return Response.json({
      available: true,
      source: "desktop",
      sampledAt: plan.sampledAt,
      fiveHour: { usedPct: plan.fiveHourPct, resetsAt: plan.fiveHourResetsAt, used: null, allowed: null },
      sevenDay: { usedPct: plan.weeklyPct, resetsAt: null, used: null, allowed: null },
      sevenDayOpus: null,
      sevenDaySonnet: null,
      fetchedAt: plan.sampledAt,
    });
  }
  const usage = await getOfficialUsage();
  return Response.json(usage);
}
