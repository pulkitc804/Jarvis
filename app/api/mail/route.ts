import { listMessages } from "@/lib/mailSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 40), 100);
  const result = await listMessages(limit);
  return Response.json(result);
}
