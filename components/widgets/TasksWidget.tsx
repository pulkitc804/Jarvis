"use client";

import { Panel } from "@/components/Panel";
import { CheckSquareIcon, PlusIcon, TrashIcon } from "@/components/icons";
import type { Task } from "@/lib/tasksStore";
import { useEffect, useState } from "react";

const PRIORITY_COLOR: Record<Task["priority"], string> = {
  high: "var(--danger)",
  med: "var(--warn)",
  low: "var(--faint)",
};

export function TasksWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("med");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      const json = await res.json();
      setTasks(json.tasks || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTitle("");
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, priority }),
    });
    const json = await res.json();
    if (json.task) setTasks((prev) => [json.task, ...prev]);
  }

  async function toggle(task: Task) {
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, done: !x.done } : x)));
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, done: !task.done }),
    });
  }

  async function remove(task: Task) {
    setTasks((prev) => prev.filter((x) => x.id !== task.id));
    await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, { method: "DELETE" });
  }

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const sorted = [...open, ...done];

  return (
    <Panel
      title="Tasks"
      icon={<CheckSquareIcon size={16} />}
      accent="var(--good)"
      className="lg:col-span-5"
      right={
        <span className="tnum text-[12px] text-[var(--muted)]">
          {open.length} open
        </span>
      }
    >
      <form onSubmit={add} className="mb-3 flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white/[0.02] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--faint)] outline-none focus:border-[var(--border-strong)]"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Task["priority"])}
          className="rounded-lg border border-[var(--border)] bg-white/[0.02] px-2 py-2 text-sm text-[var(--muted)] outline-none focus:border-[var(--border-strong)]"
          aria-label="Priority"
        >
          <option value="high">High</option>
          <option value="med">Med</option>
          <option value="low">Low</option>
        </select>
        <button
          type="submit"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--good)]/15 text-[var(--good)] transition hover:bg-[var(--good)]/25"
          aria-label="Add task"
        >
          <PlusIcon size={16} />
        </button>
      </form>

      <div className="scroll-thin max-h-[260px] space-y-1 overflow-y-auto pr-1">
        {loading && <div className="text-sm text-[var(--muted)]">Loading…</div>}
        {!loading && sorted.length === 0 && (
          <div className="py-6 text-center text-sm text-[var(--muted)]">
            Nothing yet. Add your first task above.
          </div>
        )}
        {sorted.map((t) => (
          <div
            key={t.id}
            className="group flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.025]"
          >
            <button
              onClick={() => toggle(t)}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-md border transition"
              style={{
                borderColor: t.done ? "var(--good)" : "var(--border-strong)",
                background: t.done ? "var(--good)" : "transparent",
              }}
              aria-label={t.done ? "Mark incomplete" : "Mark complete"}
            >
              {t.done && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#05080f" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            <span
              className="h-4 w-1 shrink-0 rounded-full"
              style={{ background: PRIORITY_COLOR[t.priority] }}
              title={`${t.priority} priority`}
            />
            <span className={`flex-1 text-sm ${t.done ? "text-[var(--faint)] line-through" : "text-[var(--text)]"}`}>
              {t.title}
            </span>
            <button
              onClick={() => remove(t)}
              className="shrink-0 text-[var(--faint)] opacity-0 transition hover:text-[var(--danger)] group-hover:opacity-100"
              aria-label="Delete task"
            >
              <TrashIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
