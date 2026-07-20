# Jarvis — personal command center

A live, always-open dashboard for your Mac that pulls **everything you track into one place**:
your Claude **session limit**, tasks, meetings, email, and Telegram. Local-first, fast to iterate
on, and built to keep open all day.

![session limit](https://img.shields.io/badge/session_limit-live-3ce0ff)
![local-first](https://img.shields.io/badge/local--first-yes-46e08a)

## What's in it

| Panel | Status | Source |
| --- | --- | --- |
| **Session limit** | ✅ Live | Your real 5-hour session window from local `~/.claude` logs — countdown ticks every second. Shows the true Anthropic % when an OAuth token is provided. |
| **Cost & tokens** | ✅ Live | Token/cost detail from the same logs (cache-tier-accurate) |
| **Tasks** | ✅ Live | Local file-backed store (`data/tasks.json`) |
| **Meetings** | 🔌 Connect | Any calendar's secret iCal URL (Google / Outlook / Apple) |
| **Email** | 🔌 Connect | Gmail (or any IMAP) via an app password |
| **Telegram** | 🔌 Connect | Telegram Bot API |

### About the session limit

Anthropic does **not** publish your plan's exact token cap, so Jarvis won't invent one. What it
shows is **accurate**:

- The **5-hour session window** reconstructed from your real message timestamps — when it started,
  when it resets, and a **per-second countdown** to reset. (Plan detected: e.g. *Claude Max 5×*.)
- Usage **this session** and **this week** (messages + tokens), straight from your logs.
- A reference bar: this session **vs your own busiest 5-hour window**, clearly labeled (not the
  official cap).
- The **true Anthropic 5h / weekly %** — the exact figures Claude Code's `/usage` shows — *if* you
  provide an OAuth token (see below). Otherwise it says so plainly rather than guessing.

## Run it

```bash
npm install
cp .env.local.example .env.local   # then fill in what you want to connect
npm run dev                        # → http://localhost:3000
```

### Run it as a Mac desktop app

Jarvis reads **local** data (your `~/.claude` logs, `.env.local` credentials), so it runs on your
Mac as a background service — not on a cloud host. One command sets up a real desktop app:

```bash
npm run install-app     # builds + creates ~/Applications/Jarvis.app
```

Then open **Jarvis** from Spotlight / `~/Applications` and drag it to your Dock. Double-clicking it
starts the server (if needed) and opens the dashboard in its **own dedicated window** (no browser
chrome, its own Dock icon).

Handy commands:

| Command | Does |
| --- | --- |
| `npm run desktop` | Start the server (if down) and open the app window |
| `npm run serve` | Start the background server only → http://localhost:3000 |
| `scripts/jarvis stop` / `status` | Stop / check the server |
| `scripts/enable-autostart.sh` | **Opt-in:** keep it running and relaunch on login (macOS LaunchAgent) |
| `scripts/disable-autostart.sh` | Undo auto-start |

> Prefer no extra app? Open <http://localhost:3000> in Chrome → ⋮ → *Cast, save & share* →
> *Install page as app* for a one-click PWA instead.
>
> Want it reachable from your phone/other devices? Point a private tunnel (Tailscale, or
> `ngrok http 3000`) at the local server — the data still lives only on your Mac.

## Connecting data sources

Everything below is read **server-side only** and lives in `.env.local` (gitignored — secrets never
leave your machine). See [`.env.local.example`](.env.local.example) for the exact variables.

| Panel | What to add | Where to get it |
| --- | --- | --- |
| **Official Claude %** | `CLAUDE_CODE_OAUTH_TOKEN` | A Claude OAuth token (`sk-ant-oat01-…`). On macOS you can instead set `CLAUDE_OAUTH_FROM_KEYCHAIN=1` to read it from the Claude Code keychain item at runtime. Tokens expire, so this is optional polish on top of the always-accurate local window. |
| **Meetings** | `CALENDAR_ICS_URLS` | Google Calendar → Settings → your calendar → **Secret address in iCal format**. Comma-separate multiple calendars. Works with Outlook/Apple published URLs too. Recurring events are expanded correctly. |
| **Email** | `GMAIL_IMAP_USER` + `GMAIL_IMAP_APP_PASSWORD` | A Google **App Password** (Account → Security → App passwords; needs 2-Step Verification). Non-Gmail: `IMAP_HOST` / `IMAP_PORT` / `IMAP_USER` / `IMAP_PASSWORD`. |
| **Telegram** | `TELEGRAM_BOT_TOKEN` | Create a bot via **@BotFather**. A bot sees messages sent *to it* and in groups/channels it's in — not your personal DMs with others (Telegram doesn't expose those to bots). |

Until a panel is configured it shows an honest "Not connected" state with the exact variable to set.

## Architecture

```
app/
  page.tsx                 # dashboard grid (session hero on top)
  api/
    claude-usage/route.ts  # session window + cost/tokens (live, local logs)
    usage-limit/route.ts   # official Anthropic % via /api/oauth/usage (if token)
    tasks/route.ts         # file-backed task CRUD
    meetings/route.ts      # iCal calendars
    email/route.ts         # IMAP inbox
    telegram/route.ts      # Telegram Bot API
lib/
  claudeUsage.ts           # log parser, 5h-window reconstruction, cost math
  officialUsage.ts         # OAuth usage endpoint reader (server-side token)
  meetingsSource.ts        # node-ical fetch + recurrence expansion
  emailSource.ts           # imapflow inbox reader
  telegramSource.ts        # Bot API getUpdates
  pricing.ts · tasksStore.ts · usePoll.ts · format.ts
components/
  ClockHeader.tsx · Panel.tsx · Gauge.tsx · widgets/*
```

Next.js 16 (App Router) + Tailwind v4. The session countdown ticks client-side every second;
usage and integrations poll on intervals and pause when the tab is hidden.

## Add a new panel

1. `app/api/<thing>/route.ts` returning your data.
2. `components/widgets/<Thing>Widget.tsx` (copy one; use the `usePoll` hook).
3. Add it to the grid in `app/page.tsx` with a `lg:col-span-*`.

---

Made to be tinkered with. 🛠️
