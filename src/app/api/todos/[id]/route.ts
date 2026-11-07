import { requireViewer } from "@/lib/auth";
import { deleteTodo, updateTodo } from "@/lib/todos";
import type { CycleType, TodoStatus } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const identity = await requireViewer(request);
  if (identity instanceof Response) return identity;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "无效 JSON" }, { status: 400 });
  }

  try {
    const todo = await updateTodo(identity.sub, id, {
      title: body.title != null ? String(body.title) : undefined,
      notes: body.notes != null ? String(body.notes) : undefined,
      cycle_type: body.cycle_type
        ? (body.cycle_type as CycleType)
        : undefined,
      cycle_config:
        body.cycle_config && typeof body.cycle_config === "object"
          ? (body.cycle_config as object)
          : undefined,
      due_at:
        body.due_at === null || typeof body.due_at === "string"
          ? (body.due_at as string | null)
          : undefined,
      next_at:
        body.next_at === null || typeof body.next_at === "string"
          ? (body.next_at as string | null)
          : undefined,
      status: body.status ? (body.status as TodoStatus) : undefined,
    });
    if (!todo) {
      return Response.json({ error: "未找到" }, { status: 404 });
    }
    return Response.json(
      { todo },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "更新失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const identity = await requireViewer(request);
  if (identity instanceof Response) return identity;
  const { id } = await ctx.params;
  const ok = await deleteTodo(identity.sub, id);
  if (!ok) return Response.json({ error: "未找到" }, { status: 404 });
  return new Response(null, { status: 204 });
}
