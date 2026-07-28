# Jarvis — personal command center

A live, always-open dashboard for your Mac that pulls **everything you track into one place**:
your Claude **session limit**, an **internship tracker**, tasks, meetings, and email. Local-first,
fast to iterate on, and built to keep open all day.

![session limit](https://img.shields.io/badge/session_limit-live-3ce0ff)
![local-first](https://img.shields.io/badge/local--first-yes-46e08a)

## What's in it

| Panel | Status | Source |
| --- | --- | --- |
| **Session limit** | ✅ Live | Your real 5-hour session window from Claude's own usage data — countdown ticks every second, matches `/usage`. |
| **Internships** | ✅ Live | Auto-updating big-tech Summer-2027 SWE/ML/DS feed (undergrad-only) with fit scores, on-demand résumé tailoring, and PDF preview |
| **Tasks** | ✅ Live | Local file-backed store (`data/tasks.json`) |
| **Meetings** | 🔌 Connect | Any calendar's secret iCal URL (Google / Outlook / Apple) |
| **Email** | 🔌 Connect | Gmail (or any IMAP) via an app password |

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

### Run it as a native Mac app

It's a real **Electron** desktop app — its own window, its own Dock icon, its own process (not a
browser). Two ways to get it:

**A. Linked to this folder (quick, recommended):**

```bash
npm run install-app     # builds + creates ~/Applications/Jarvis.app
```

Open **Jarvis** from Spotlight / `~/Applications` and drag it to your Dock. Double-clicking launches
a native window running the local server. (`npm run app` runs the same thing from the terminal.)

**B. Self-contained bundle (movable, no repo needed to run):**

```bash
npm run dist            # → release/mac-arm64/Jarvis.app  (~580 MB, bundles everything)
```

Drag that `Jarvis.app` into `/Applications`.

Handy commands: `npm run serve` (server only, http://localhost:3000), `scripts/jarvis stop|status`,
`scripts/enable-autostart.sh` (opt-in: relaunch on login).

> **Privacy — keep it on your Mac.** Jarvis reads local files and runs entirely on your machine, so
> nobody else can see it. Do **not** host it on shared or company infrastructure: anything running
> on a machine someone else administers is visible to them. Local = yours alone.

## Connecting data sources

Everything below is read **server-side only** and lives in `.env.local` (gitignored — secrets never
leave your machine). See [`.env.local.example`](.env.local.example) for the exact variables.

| Panel | What to add | Where to get it |
| --- | --- | --- |
| **Official Claude %** | `CLAUDE_CODE_OAUTH_TOKEN` | A Claude OAuth token (`sk-ant-oat01-…`). On macOS you can instead set `CLAUDE_OAUTH_FROM_KEYCHAIN=1` to read it from the Claude Code keychain item at runtime. Tokens expire, so this is optional polish on top of the always-accurate local window. |
| **Meetings** | `CALENDAR_ICS_URLS` | Google Calendar → Settings → your calendar → **Secret address in iCal format**. Comma-separate multiple calendars. Works with Outlook/Apple published URLs too. Recurring events are expanded correctly. |
| **Email** | `GMAIL_IMAP_USER` + `GMAIL_IMAP_APP_PASSWORD` | A Google **App Password** (Account → Security → App passwords; needs 2-Step Verification). Non-Gmail: `IMAP_HOST` / `IMAP_PORT` / `IMAP_USER` / `IMAP_PASSWORD`. |

Until a panel is configured it shows an honest "Not connected" state with the exact variable to set.

## Keep working past your limit (cloud overflow)

When your subscription 5-hour window is spent, keep going by running Claude Code against a cloud
backend (Microsoft **Foundry / Azure**, or Bedrock / Vertex). That usage bills to the cloud account,
**not** your subscription window.

```bash
cp .env.cloud.example .env.cloud     # fill in your Foundry resource + key
npm run cloud                        # launches Claude Code on the Azure backend
```

`.env.cloud` holds the exact variables Claude Code reads for Foundry (`CLAUDE_CODE_USE_FOUNDRY=1`,
`ANTHROPIC_FOUNDRY_RESOURCE`, `ANTHROPIC_FOUNDRY_API_KEY`, or Azure AD `AZURE_*` auth).

### Tracking it — anonymously

The **Cloud Usage** panel shows how much you've used on the cloud backend as **aggregate volume
only** — messages and tokens, never project names or content. Cloud usage is kept **out** of your
subscription 5-hour window so the limit stays accurate.

- Tag your cloud projects in `.env.local`: `JARVIS_CLOUD_PROJECTS=proj-a,proj-b` (matched against
  the working-directory name). Bedrock's `anthropic.*` model IDs are detected automatically.
- **What "anonymous" means here:** it's display privacy on *your* dashboard. It does **not** hide
  anything from the cloud provider's own billing/logs — your Azure admin still sees usage on Azure's
  side. Jarvis never touches that.

## Architecture

```
app/
  page.tsx                 # dashboard grid (session hero on top)
  internships/page.tsx     # full internship tracker page
  api/
    usage-limit/route.ts   # exact 5h/weekly % (desktop usage cache; OAuth fallback)
    claude-usage/route.ts  # token totals from local logs (feeds the session hero)
    internships/route.ts   # merged job feed + status; score / tailor / pdf subroutes
    tasks/route.ts         # file-backed task CRUD
    meetings/route.ts      # iCal calendars
    email/route.ts         # IMAP inbox
lib/
  planUsage.ts             # exact 5h/weekly % from the Claude desktop usage cache
  claudeUsage.ts           # log parser, 5h-window reconstruction
  officialUsage.ts         # OAuth usage endpoint reader (server-side token)
  internships.ts           # merge scraper + live feeds, big-tech + undergrad filters
  internshipFetcher.ts     # free HTTP tracker fetch (no tokens) → data/detected.json
  localTools.ts            # tectonic LaTeX → PDF compile (tailored résumé preview)
  meetingsSource.ts · emailSource.ts · tasksStore.ts · usePoll.ts · format.ts
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
