import { ClockHeader } from "@/components/ClockHeader";
import { SessionLimitWidget } from "@/components/widgets/SessionLimitWidget";
import { TasksWidget } from "@/components/widgets/TasksWidget";
import { MeetingsWidget } from "@/components/widgets/MeetingsWidget";
import { EmailWidget } from "@/components/widgets/EmailWidget";
import { InternshipsWidget } from "@/components/widgets/InternshipsWidget";

export default function Home() {
  return (
    <main className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 sm:py-9">
      <ClockHeader name="Pulkit" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 auto-rows-min">
        <SessionLimitWidget />
        <TasksWidget />
        <InternshipsWidget />
        <MeetingsWidget />
        <EmailWidget />
      </div>
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--faint)]">
        <span>Jarvis · local-first personal command center</span>
        <span>Session limit is live from Claude&apos;s usage data · email / meetings go live once connected</span>
      </footer>
    </main>
  );
}
