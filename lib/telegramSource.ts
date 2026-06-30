/**
 * Reads recent Telegram messages via the Bot API (getUpdates).
 * Set TELEGRAM_BOT_TOKEN in .env.local (create a bot with @BotFather).
 *
 * Note: a bot can see messages sent *to it* and in groups/channels it's a
 * member of — not your personal one-to-one DMs with other people (Telegram
 * doesn't expose those to bots). Message your bot, or add it to a group, to
 * see traffic here. This is the safe, no-account-login integration.
 */

export type TgMessage = {
  id: string;
  from: string;
  chat: string;
  text: string;
  date: number; // epoch ms
};

export type TelegramResult =
  | { connected: true; messages: TgMessage[]; botName: string | null; fetchedAt: number }
  | { connected: false; reason: string };

let cache: { at: number; result: TelegramResult } | null = null;

export async function getTelegram(): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { connected: false, reason: "Set TELEGRAM_BOT_TOKEN (from @BotFather) in .env.local." };
  }
  if (cache && Date.now() - cache.at < 15_000) return cache.result;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    // offset omitted → does not consume/confirm updates, so we can keep reading.
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=25`, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const data = (await res.json()) as {
      ok: boolean;
      description?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result?: any[];
    };
    if (!data.ok) {
      const why = /webhook/i.test(data.description || "")
        ? "A webhook is set on this bot, so getUpdates is disabled. Delete the webhook to use this panel."
        : data.description || "Telegram API error.";
      return { connected: false, reason: why };
    }

    const messages: TgMessage[] = [];
    for (const u of data.result || []) {
      const m = u.message || u.channel_post || u.edited_message;
      if (!m) continue;
      const fromName =
        [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") ||
        m.from?.username ||
        (m.chat?.title ?? "Unknown");
      const chat = m.chat?.title || m.chat?.username || m.chat?.first_name || "direct";
      const text = m.text || m.caption || (m.sticker ? "🌟 sticker" : m.photo ? "📷 photo" : "(non-text message)");
      messages.push({
        id: String(u.update_id),
        from: String(fromName),
        chat: String(chat),
        text: String(text),
        date: (m.date ? m.date * 1000 : Date.now()),
      });
    }
    messages.sort((a, b) => b.date - a.date);

    // Best-effort bot name (cheap, same token).
    let botName: string | null = null;
    try {
      const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
      botName = me?.result?.username ? `@${me.result.username}` : null;
    } catch {
      /* ignore */
    }

    const result: TelegramResult = {
      connected: true,
      messages: messages.slice(0, 12),
      botName,
      fetchedAt: Date.now(),
    };
    cache = { at: Date.now(), result };
    return result;
  } catch (e) {
    return { connected: false, reason: (e as Error).name === "AbortError" ? "Telegram request timed out." : "Request failed." };
  }
}
