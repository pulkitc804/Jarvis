import { getUsageSummary } from "@/lib/claudeUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = getUsageSummary();
    return Response.json(summary);
  } catch (e) {
    return Response.json(
      { error: (e as Error).message || "Failed to read Claude usage logs" },
      { status: 500 },
    );
  }
}
