import { addTask, deleteTask, readTasks, updateTask, type Task } from "@/lib/tasksStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ tasks: readTasks() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    priority?: Task["priority"];
  };
  if (!body.title || !body.title.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  const task = addTask(body.title, body.priority);
  return Response.json({ task }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    title?: string;
    done?: boolean;
    priority?: Task["priority"];
  };
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });
  const task = updateTask(body.id, {
    title: body.title,
    done: body.done,
    priority: body.priority,
  });
  if (!task) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ task });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const ok = deleteTask(id);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
