import { getMessage } from "@/lib/mailSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ uid: string }> }) {
  const { uid } = await ctx.params;
  const account = new URL(req.url).searchParams.get("account") || undefined;
  const result = await getMessage(uid, account);
  return Response.json(result, { status: result.ok ? 200 : 404 });
}
