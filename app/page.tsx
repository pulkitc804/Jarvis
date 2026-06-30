import { ClockHeader } from "@/components/ClockHeader";
import { SessionLimitWidget } from "@/components/widgets/SessionLimitWidget";
import { ClaudeUsageWidget } from "@/components/widgets/ClaudeUsageWidget";
import { TasksWidget } from "@/components/widgets/TasksWidget";
import { MeetingsWidget } from "@/components/widgets/MeetingsWidget";
import { EmailWidget } from "@/components/widgets/EmailWidget";
import { TelegramWidget } from "@/components/widgets/TelegramWidget";

export default function Home() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 sm:py-9">
      <ClockHeader name="Pulkit" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 auto-rows-min">
        <SessionLimitWidget />
        <TasksWidget />
        <ClaudeUsageWidget />
        <EmailWidget />
        <MeetingsWidget />
        <TelegramWidget />
      </div>
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--faint)]">
        <span>Jarvis · local-first personal command center</span>
        <span>Session &amp; usage are live from local logs · email / meetings / telegram go live once connected</span>
      </footer>
    </main>
  );
}
