import { ImapFlow } from "imapflow";

/**
 * Reads recent inbox mail over IMAP. For Gmail set GMAIL_IMAP_USER +
 * GMAIL_IMAP_APP_PASSWORD (a Google "App Password", not your login password).
 * For other providers set IMAP_HOST / IMAP_PORT / IMAP_USER / IMAP_PASSWORD.
 * Credentials stay server-side and are never sent to the browser.
 */

export type Email = {
  id: string;
  from: string;
  subject: string;
  receivedAt: number;
  unread: boolean;
};

export type EmailResult =
  | { connected: true; unread: number; messages: Email[]; fetchedAt: number }
  | { connected: false; reason: string };

let cache: { at: number; result: EmailResult } | null = null;

function config() {
  const gUser = process.env.GMAIL_IMAP_USER;
  const gPass = process.env.GMAIL_IMAP_APP_PASSWORD;
  if (gUser && gPass) {
    return { host: "imap.gmail.com", port: 993, secure: true, user: gUser, pass: gPass };
  }
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;
  if (host && user && pass) {
    return { host, port: Number(process.env.IMAP_PORT || 993), secure: true, user, pass };
  }
  return null;
}

export async function getEmail(): Promise<EmailResult> {
  const cfg = config();
  if (!cfg) {
    return {
      connected: false,
      reason: "Set GMAIL_IMAP_USER + GMAIL_IMAP_APP_PASSWORD (a Google App Password) in .env.local.",
    };
  }
  if (cache && Date.now() - cache.at < 25_000) return cache.result;

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const messages: Email[] = [];
    let unread = 0;
    try {
      const mbox = client.mailbox && typeof client.mailbox !== "boolean" ? client.mailbox : null;
      const total = mbox?.exists ?? 0;
      const status = await client.status("INBOX", { unseen: true });
      unread = status.unseen ?? 0;

      if (total > 0) {
        const from = Math.max(1, total - 19); // last 20 messages
        for await (const msg of client.fetch(`${from}:*`, { envelope: true, flags: true })) {
          const env = msg.envelope;
          const fromAddr = env?.from?.[0];
          messages.push({
            id: String(msg.uid),
            from: fromAddr?.name || fromAddr?.address || "(unknown)",
            subject: env?.subject || "(no subject)",
            receivedAt: env?.date ? new Date(env.date).getTime() : Date.now(),
            unread: !(msg.flags?.has("\\Seen") ?? false),
          });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();

    messages.sort((a, b) => b.receivedAt - a.receivedAt);
    const result: EmailResult = { connected: true, unread, messages: messages.slice(0, 12), fetchedAt: Date.now() };
    cache = { at: Date.now(), result };
    return result;
  } catch (e) {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    return { connected: false, reason: `IMAP error: ${(e as Error).message}` };
  }
}
