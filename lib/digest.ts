import { listInternships, upcomingDeadlines } from "./internships";
import { readTasks } from "./tasksStore";
import { readPlanUsage } from "./planUsage";

/**
 * A rollup of "what happened this week" across the panels Jarvis tracks —
 * no external service, just re-reading the same local data other panels use.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type Digest = {
  windowDays: 7;
  newRoles: number;
  bigTechNewRoles: number;
  applications: { total: number; thisWeek: number };
  stageMoves: { oa: number; interview: number; offer: number; rejected: number };
  upcomingDeadlines: ReturnType<typeof upcomingDeadlines>;
  tasks: { completedThisWeek: number; openTotal: number };
  session: { fiveHourPct: number | null; weeklyPct: number | null };
  generatedAt: number;
};

export function buildDigest(): Digest {
  const now = Date.now();
  const since = now - WEEK_MS;
  const { internships } = listInternships();

  const newRoles = internships.filter((j) => j.firstSeen >= since);
  const applications = internships.filter((j) => j.applied);
  const appsThisWeek = applications.filter((j) => (j.appliedAt ?? 0) >= since);

  const stageMoves = { oa: 0, interview: 0, offer: 0, rejected: 0 };
  for (const j of internships) {
    const moved = (j as { stageUpdatedAt?: number | null }).stageUpdatedAt;
    if (!moved || moved < since) continue;
    if (j.stage in stageMoves) stageMoves[j.stage as keyof typeof stageMoves]++;
  }

  const tasks = readTasks();
  const completedThisWeek = tasks.filter((t) => t.done && (t.completedAt ?? 0) >= since).length;
  const openTotal = tasks.filter((t) => !t.done).length;

  const plan = readPlanUsage();

  return {
    windowDays: 7,
    newRoles: newRoles.length,
    bigTechNewRoles: newRoles.filter((j) => j.bigTech).length,
    applications: { total: applications.length, thisWeek: appsThisWeek.length },
    stageMoves,
    upcomingDeadlines: upcomingDeadlines(),
    tasks: { completedThisWeek, openTotal },
    session: {
      fiveHourPct: plan.available ? Math.round(plan.fiveHourPct) : null,
      weeklyPct: plan.available ? Math.round(plan.weeklyPct) : null,
    },
    generatedAt: now,
  };
}

/** A short plain-text summary — the same shape a Slack/email digest would send. */
export function digestText(d: Digest): string {
  const lines = [
    `This week: ${d.newRoles} new roles (${d.bigTechNewRoles} big tech), ${d.applications.thisWeek} applied.`,
    d.stageMoves.oa || d.stageMoves.interview || d.stageMoves.offer
      ? `Moved forward: ${d.stageMoves.oa} to OA, ${d.stageMoves.interview} to interview, ${d.stageMoves.offer} to offer.`
      : null,
    d.upcomingDeadlines.length ? `${d.upcomingDeadlines.length} upcoming deadline(s) in the next 2 weeks.` : null,
    `Tasks: ${d.tasks.completedThisWeek} completed this week, ${d.tasks.openTotal} still open.`,
  ].filter(Boolean);
  return lines.join(" ");
}
