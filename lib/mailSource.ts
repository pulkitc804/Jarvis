import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";

/**
 * Full mail client backend: list, read full bodies, and send replies.
 * Uses the same IMAP credentials as the dashboard Email widget, plus SMTP for
 * sending. Gmail: GMAIL_IMAP_USER + GMAIL_IMAP_APP_PASSWORD. Everything is
 * server-side; nothing is sent without an explicit user action in the UI.
 */

type Cfg = {
  id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  smtpHost: string;
  smtpPort: number;
};

/**
 * Every configured mailbox. Rutgers ScarletMail is Google Workspace, so it uses
 * the same imap.gmail.com endpoints — it just needs its own App Password.
 */
export function accounts(): Cfg[] {
  const list: Cfg[] = [];
  const g = (k: string) => process.env[k];

  if (g("GMAIL_IMAP_USER") && g("GMAIL_IMAP_APP_PASSWORD")) {
    list.push({
      id: "personal",
      label: g("GMAIL_IMAP_USER") as string,
      host: "imap.gmail.com",
      port: 993,
      user: g("GMAIL_IMAP_USER") as string,
      pass: g("GMAIL_IMAP_APP_PASSWORD") as string,
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
    });
  }
  if (g("RUTGERS_IMAP_USER") && g("RUTGERS_IMAP_APP_PASSWORD")) {
    list.push({
      id: "rutgers",
      label: g("RUTGERS_IMAP_USER") as string,
      host: g("RUTGERS_IMAP_HOST") || "imap.gmail.com",
      port: Number(g("RUTGERS_IMAP_PORT") || 993),
      user: g("RUTGERS_IMAP_USER") as string,
      pass: g("RUTGERS_IMAP_APP_PASSWORD") as string,
      smtpHost: g("RUTGERS_SMTP_HOST") || "smtp.gmail.com",
      smtpPort: Number(g("RUTGERS_SMTP_PORT") || 465),
    });
  }
  if (g("IMAP_HOST") && g("IMAP_USER") && g("IMAP_PASSWORD")) {
    list.push({
      id: "other",
      label: g("IMAP_USER") as string,
      host: g("IMAP_HOST") as string,
      port: Number(g("IMAP_PORT") || 993),
      user: g("IMAP_USER") as string,
      pass: g("IMAP_PASSWORD") as string,
      smtpHost: g("SMTP_HOST") || (g("IMAP_HOST") as string).replace(/^imap/, "smtp"),
      smtpPort: Number(g("SMTP_PORT") || 465),
    });
  }
  return list;
}

export function accountList(): Array<{ id: string; label: string }> {
  return accounts().map((a) => ({ id: a.id, label: a.label }));
}

function config(accountId?: string): Cfg | null {
  const all = accounts();
  if (all.length === 0) return null;
  if (!accountId) return all[0];
  return all.find((a) => a.id === accountId) || all[0];
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
  flagged: boolean;
  account: string;
};
export type MailListResult =
  | { connected: true; unread: number; total: number; messages: MailListItem[] }
  | { connected: false; reason: string };

export async function listMessages(limit = 40, accountId?: string): Promise<MailListResult> {
  const cfg = config(accountId);
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
            flagged: msg.flags?.has("\\Flagged") ?? false,
            account: cfg.id,
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

export async function getMessage(
  uid: string,
  accountId?: string,
): Promise<{ ok: true; message: FullMessage } | { ok: false; reason: string }> {
  const cfg = config(accountId);
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

export type MailAction = "read" | "unread" | "star" | "unstar" | "archive" | "delete";

/** Flag / move operations on a message. Archive and delete move to Gmail's
 *  All Mail and Trash respectively, matching what the web client does. */
export async function actOnMessage(
  uid: string,
  action: MailAction,
  accountId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = config(accountId);
  if (!cfg) return { ok: false, error: "Email not configured." };
  const client = newClient(cfg);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      if (action === "read") await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
      else if (action === "unread") await client.messageFlagsRemove(uid, ["\\Seen"], { uid: true });
      else if (action === "star") await client.messageFlagsAdd(uid, ["\\Flagged"], { uid: true });
      else if (action === "unstar") await client.messageFlagsRemove(uid, ["\\Flagged"], { uid: true });
      else if (action === "delete") {
        const trash = cfg.host.includes("gmail") ? "[Gmail]/Trash" : "Trash";
        await client.messageMove(uid, trash, { uid: true });
      } else if (action === "archive") {
        // Gmail archives by removing the message from INBOX entirely.
        if (cfg.host.includes("gmail")) await client.messageMove(uid, "[Gmail]/All Mail", { uid: true });
        else await client.messageFlagsAdd(uid, ["\\Deleted"], { uid: true });
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return { ok: true };
  } catch (e) {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    return { ok: false, error: (e as Error).message };
  }
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  accountId?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const cfg = config(opts.accountId);
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
      html: opts.html || undefined,
      inReplyTo: opts.inReplyTo || undefined,
      references: opts.references || undefined,
    });
    return { ok: true, id: info.messageId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
