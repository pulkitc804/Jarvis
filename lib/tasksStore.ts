import fs from "node:fs";
import path from "node:path";

export type Task = {
  id: string;
  title: string;
  done: boolean;
  priority: "low" | "med" | "high";
  createdAt: number;
  completedAt: number | null;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "tasks.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "[]", "utf8");
}

export function readTasks(): Task[] {
  ensure();
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeTasks(tasks: Task[]) {
  ensure();
  fs.writeFileSync(FILE, JSON.stringify(tasks, null, 2), "utf8");
}

function id(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function addTask(title: string, priority: Task["priority"] = "med"): Task {
  const tasks = readTasks();
  const task: Task = {
    id: id(),
    title: title.trim().slice(0, 280),
    done: false,
    priority,
    createdAt: Date.now(),
    completedAt: null,
  };
  tasks.unshift(task);
  writeTasks(tasks);
  return task;
}

export function updateTask(
  taskId: string,
  patch: Partial<Pick<Task, "title" | "done" | "priority">>,
): Task | null {
  const tasks = readTasks();
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return null;
  if (patch.title !== undefined) t.title = patch.title.trim().slice(0, 280);
  if (patch.priority !== undefined) t.priority = patch.priority;
  if (patch.done !== undefined) {
    t.done = patch.done;
    t.completedAt = patch.done ? Date.now() : null;
  }
  writeTasks(tasks);
  return t;
}

export function deleteTask(taskId: string): boolean {
  const tasks = readTasks();
  const next = tasks.filter((x) => x.id !== taskId);
  if (next.length === tasks.length) return false;
  writeTasks(next);
  return true;
}
