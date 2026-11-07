import { requireViewer } from "@/lib/auth";
import { briefWithDeepSeek } from "@/lib/deepseek";
import { listTodos } from "@/lib/todos";

export async function POST(request: Request) {
  const identity = await requireViewer(request);
  if (identity instanceof Response) return identity;

  const todos = await listTodos(identity.sub);
  const open = todos.filter((t) => t.status === "open");
  const text = open
    .map(
      (t) =>
        `- [${t.cycle_type}] ${t.title}${t.next_at ? ` @ ${t.next_at}` : ""}${t.notes ? ` (${t.notes})` : ""}`,
    )
    .join("\n");

  try {
    const result = await briefWithDeepSeek(text);
    return Response.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "摘要失败" },
      { status: 502 },
    );
  }
}
