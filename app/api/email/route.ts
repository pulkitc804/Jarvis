import { getEmail } from "@/lib/emailSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getEmail();
  return Response.json(result);
}
