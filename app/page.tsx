import { ClockHeader } from "@/components/ClockHeader";
import { ClaudeUsageWidget } from "@/components/widgets/ClaudeUsageWidget";
import { TasksWidget } from "@/components/widgets/TasksWidget";
import { MeetingsWidget } from "@/components/widgets/MeetingsWidget";
import { EmailWidget } from "@/components/widgets/EmailWidget";

export default function Home() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 sm:py-9">
      <ClockHeader name="Pulkit" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 auto-rows-min">
        <ClaudeUsageWidget />
        <TasksWidget />
        <MeetingsWidget />
        <EmailWidget />
      </div>
      <footer className="mt-8 flex items-center justify-between text-[11px] text-[var(--faint)]">
        <span>Jarvis · local-first personal command center</span>
        <span>Claude usage is live · other panels are ready to connect</span>
      </footer>
    </main>
  );
}
