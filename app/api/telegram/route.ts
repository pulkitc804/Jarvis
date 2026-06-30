import { getTelegram } from "@/lib/telegramSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getTelegram();
  return Response.json(result);
}
