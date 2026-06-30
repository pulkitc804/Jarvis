# Jarvis — personal command center

A live, always-open dashboard for your Mac that pulls **everything you track into one place**:
Claude usage, tasks, meetings, and email. Local-first, fast to iterate on, and built to keep
open all day.

![status: Claude usage is live](https://img.shields.io/badge/Claude_usage-live-3ce0ff)
![local-first](https://img.shields.io/badge/local--first-yes-46e08a)

## What's in it

| Panel | Status | Source |
| --- | --- | --- |
| **Claude usage** | ✅ Live | Reads your local `~/.claude/projects/**/*.jsonl` logs — real tokens & cost, no API key |
| **Tasks** | ✅ Live | Local file-backed store (`data/tasks.json`), full add / complete / delete |
| **Meetings** | 🔌 Ready to connect | Google Calendar + Granola (see below) |
| **Email** | 🔌 Ready to connect | Gmail (see below) |

The Claude-usage numbers are **verifiable**: the panel footer shows exactly how many local log
files and records were parsed, and cost is computed from published per-token rates with the real
cache-tier multipliers (read 0.1×, 5-minute write 1.25×, 1-hour write 2×). Cross-check any number
against the raw files in `~/.claude/projects` or a tool like [`ccusage`](https://github.com/ryoppippi/ccusage).

## Run it

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

### Keep it always open on your Mac

Two easy options:

1. **Pin as a Mac app (PWA):** open the page in Chrome → ⋮ → *Cast, save & share* → *Install page as app*. It gets its own Dock icon and window.
2. **Run for real in the background:**
   ```bash
   npm run build && npm run start   # production server on :3000
   ```
   Pair with a launchd plist or `pm2 start "npm run start"` so it survives reboots.

## Connecting data sources

Each not-yet-live panel reads a single API route that currently returns `{ connected: false }`.
Wire up the real source by returning data in the documented shape — the UI already renders it.

- **Claude usage** — no setup; it reads `~/.claude/projects`. If you also have a Claude **API**
  org key, the Admin usage API can be added later for first-party API spend.
- **Tasks** — already live and local. Swap `lib/tasksStore.ts` for a Linear/Todoist client to sync.
- **Meetings** — edit [`app/api/meetings/route.ts`](app/api/meetings/route.ts): return `meetings[]`
  from the Google Calendar API (OAuth) and/or the Granola MCP.
- **Email** — edit [`app/api/email/route.ts`](app/api/email/route.ts): return `messages[]` and
  `unread` from the Gmail API (OAuth).

## Architecture

```
app/
  page.tsx                 # dashboard composition (grid of panels)
  layout.tsx               # fonts + metadata
  globals.css              # Jarvis HUD theme (dark, cyan accent)
  api/
    claude-usage/route.ts  # parses local Claude logs        (live)
    tasks/route.ts         # file-backed task CRUD            (live)
    meetings/route.ts      # stub with documented shape       (connect)
    email/route.ts         # stub with documented shape       (connect)
lib/
  pricing.ts               # per-model rates + cache multipliers
  claudeUsage.ts           # log parser + aggregation (mtime-cached)
  tasksStore.ts            # JSON-file task store
  usePoll.ts               # polling hook (pauses when tab hidden)
  format.ts                # number / currency / relative-time helpers
components/
  ClockHeader.tsx          # live clock + greeting
  Panel.tsx                # reusable card shell
  widgets/                 # one component per panel
```

Built with **Next.js 16** (App Router) + **Tailwind CSS v4**. Everything refreshes on a poll, so
the dashboard stays live while it's open. Iterate freely.

## Adding a new panel

1. Create `app/api/<thing>/route.ts` returning your data.
2. Create `components/widgets/<Thing>Widget.tsx` (copy an existing one; use the `usePoll` hook).
3. Add `<ThingWidget />` to the grid in `app/page.tsx` with a `lg:col-span-*` class.

---

Made to be tinkered with. 🛠️
