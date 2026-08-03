import { sendMail } from "@/lib/mailSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    to?: string;
    subject?: string;
    text?: string;
    inReplyTo?: string;
    references?: string;
    accountId?: string | null;
  };
  if (!body.to || !body.text) {
    return Response.json({ ok: false, error: "Recipient and message body are required." }, { status: 400 });
  }
  const result = await sendMail({
    to: body.to,
    subject: body.subject || "(no subject)",
    text: body.text,
    inReplyTo: body.inReplyTo,
    references: body.references,
    accountId: body.accountId || undefined,
  });
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
