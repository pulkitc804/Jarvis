import { getOfficialUsage } from "@/lib/officialUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const usage = await getOfficialUsage();
  return Response.json(usage);
}
