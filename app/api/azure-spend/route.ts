import { getAzureSpend } from "@/lib/azureSpend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getAzureSpend();
  return Response.json(result);
}
