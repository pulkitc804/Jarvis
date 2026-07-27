import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";

/**
 * Full mail client backend: list, read full bodies, and send replies.
 * Uses the same IMAP credentials as the dashboard Email widget, plus SMTP for
 * sending. Gmail: GMAIL_IMAP_USER + GMAIL_IMAP_APP_PASSWORD. Everything is
 * server-side; nothing is sent without an explicit user action in the UI.
 */

type Cfg = { host: string; port: number; user: string; pass: string; smtpHost: string; smtpPort: number };

function config(): Cfg | null {
  const gUser = process.env.GMAIL_IMAP_USER;
  const gPass = process.env.GMAIL_IMAP_APP_PASSWORD;
  if (gUser && gPass) {
    return { host: "imap.gmail.com", port: 993, user: gUser, pass: gPass, smtpHost: "smtp.gmail.com", smtpPort: 465 };
  }
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;
  if (host && user && pass) {
    return {
      host,
      port: Number(process.env.IMAP_PORT || 993),
      user,
      pass,
      smtpHost: process.env.SMTP_HOST || host.replace(/^imap/, "smtp"),
      smtpPort: Number(process.env.SMTP_PORT || 465),
    };
  }
  return null;
}

function newClient(cfg: Cfg) {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type MailListItem = {
  uid: string;
  from: string;
  fromAddress: string;
  subject: string;
  date: number;
  unread: boolean;
};
export type MailListResult =
  | { connected: true; unread: number; total: number; messages: MailListItem[] }
  | { connected: false; reason: string };

export async function listMessages(limit = 40): Promise<MailListResult> {
  const cfg = config();
  if (!cfg) return { connected: false, reason: "Email not configured (GMAIL_IMAP_USER + GMAIL_IMAP_APP_PASSWORD)." };
  const client = newClient(cfg);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const messages: MailListItem[] = [];
    let unread = 0;
    let total = 0;
    try {
      const mbox = client.mailbox && typeof client.mailbox !== "boolean" ? client.mailbox : null;
      total = mbox?.exists ?? 0;
      const status = await client.status("INBOX", { unseen: true });
      unread = status.unseen ?? 0;
      if (total > 0) {
        const from = Math.max(1, total - (limit - 1));
        for await (const msg of client.fetch(`${from}:*`, { uid: true, envelope: true, flags: true })) {
          const env = msg.envelope;
          const f = env?.from?.[0];
          messages.push({
            uid: String(msg.uid),
            from: f?.name || f?.address || "(unknown)",
            fromAddress: f?.address || "",
            subject: env?.subject || "(no subject)",
            date: env?.date ? new Date(env.date).getTime() : Date.now(),
            unread: !(msg.flags?.has("\\Seen") ?? false),
          });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    messages.sort((a, b) => b.date - a.date);
    return { connected: true, unread, total, messages };
  } catch (e) {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    return { connected: false, reason: `IMAP error: ${(e as Error).message}` };
  }
}

export type FullMessage = {
  uid: string;
  from: string;
  fromAddress: string;
  to: string;
  subject: string;
  date: number;
  text: string;
  messageId: string;
  references: string;
};

export async function getMessage(uid: string): Promise<{ ok: true; message: FullMessage } | { ok: false; reason: string }> {
  const cfg = config();
  if (!cfg) return { ok: false, reason: "Email not configured." };
  const client = newClient(cfg);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
      if (!msg || !msg.source) return { ok: false, reason: "Message not found." };
      const parsed = await simpleParser(msg.source);
      try {
        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
      } catch {
        /* ignore */
      }
      const env = msg.envelope;
      const fromVal = parsed.from?.value?.[0];
      const refs = parsed.references;
      const message: FullMessage = {
        uid,
        from: fromVal?.name || parsed.from?.text || env?.from?.[0]?.address || "",
        fromAddress: fromVal?.address || env?.from?.[0]?.address || "",
        to: parsed.to && !Array.isArray(parsed.to) ? parsed.to.text : "",
        subject: parsed.subject || env?.subject || "(no subject)",
        date: parsed.date ? parsed.date.getTime() : env?.date ? new Date(env.date).getTime() : Date.now(),
        text: parsed.text || (parsed.html ? stripHtml(parsed.html) : "(no text content)"),
        messageId: parsed.messageId || "",
        references: Array.isArray(refs) ? refs.join(" ") : refs || "",
      };
      return { ok: true, message };
    } finally {
      lock.release();
    }
  } catch (e) {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    return { ok: false, reason: (e as Error).message };
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "Email not configured." };
  if (!opts.to.trim()) return { ok: false, error: "Recipient is required." };
  const transport = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  try {
    const info = await transport.sendMail({
      from: cfg.user,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      inReplyTo: opts.inReplyTo || undefined,
      references: opts.references || undefined,
    });
    return { ok: true, id: info.messageId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
