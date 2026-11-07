import { requireViewer } from "@/lib/auth";
import { createTodo, listTodos } from "@/lib/todos";
import type { CycleType } from "@/lib/types";

export async function GET(request: Request) {
  const identity = await requireViewer(request);
  if (identity instanceof Response) return identity;

  const todos = await listTodos(identity.sub);
  return Response.json(
    { todos },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const identity = await requireViewer(request);
  if (identity instanceof Response) return identity;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "无效 JSON" }, { status: 400 });
  }

  try {
    const todo = await createTodo(identity.sub, {
      title: String(body.title ?? ""),
      notes: body.notes != null ? String(body.notes) : "",
      cycle_type: (body.cycle_type as CycleType) || "once",
      cycle_config:
        body.cycle_config && typeof body.cycle_config === "object"
          ? (body.cycle_config as object)
          : {},
      due_at:
        typeof body.due_at === "string" || body.due_at === null
          ? (body.due_at as string | null)
          : null,
      next_at:
        typeof body.next_at === "string" || body.next_at === null
          ? (body.next_at as string | null)
          : null,
    });
    return Response.json(
      { todo },
      { status: 201, headers: { "cache-control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "创建失败" },
      { status: 400 },
    );
  }
}
