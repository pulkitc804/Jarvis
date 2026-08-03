import { accountList, actOnMessage, listMessages, type MailAction } from "@/lib/mailSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 40), 100);
  const account = url.searchParams.get("account") || undefined;
  const result = await listMessages(limit, account);
  return Response.json({ ...result, accounts: accountList(), account: account || accountList()[0]?.id || null });
}

/** Flag / move actions: read, unread, star, unstar, archive, delete. */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { uid?: string; action?: MailAction; account?: string };
  if (!b.uid || !b.action) return Response.json({ error: "uid and action are required" }, { status: 400 });
  const res = await actOnMessage(b.uid, b.action, b.account);
  return Response.json(res, { status: res.ok ? 200 : 502 });
}
