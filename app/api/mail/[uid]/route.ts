import { getMessage } from "@/lib/mailSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ uid: string }> }) {
  const { uid } = await ctx.params;
  const result = await getMessage(uid);
  return Response.json(result, { status: result.ok ? 200 : 404 });
}
