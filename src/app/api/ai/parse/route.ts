import { requireViewer } from "@/lib/auth";
import { parseTodosWithDeepSeek } from "@/lib/deepseek";
import { createTodo } from "@/lib/todos";

export async function POST(request: Request) {
  const identity = await requireViewer(request);
  if (identity instanceof Response) return identity;

  let body: { prompt?: string; save?: boolean };
  try {
    body = (await request.json()) as { prompt?: string; save?: boolean };
  } catch {
    return Response.json({ error: "无效 JSON" }, { status: 400 });
  }

  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return Response.json({ error: "请输入内容" }, { status: 400 });
  }
  if (prompt.length > 2000) {
    return Response.json({ error: "内容过长（最多 2000 字）" }, { status: 400 });
  }

  try {
    const parsed = await parseTodosWithDeepSeek(prompt);
    let saved = parsed.todos;
    if (body.save !== false) {
      saved = [];
      for (const item of parsed.todos) {
        saved.push(await createTodo(identity.sub, item));
      }
    }
    return Response.json(
      {
        mode: parsed.mode,
        summary: parsed.summary,
        todos: saved,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "AI 解析失败" },
      { status: 502 },
    );
  }
}
