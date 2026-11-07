import type { CycleType, TodoInput } from "./types";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export type AiParseResult = {
  mode: "live" | "sample";
  summary: string;
  todos: TodoInput[];
};

type DeepSeekMessage = { role: "system" | "user" | "assistant"; content: string };

function sampleParse(prompt: string): AiParseResult {
  const title = prompt.trim().slice(0, 40) || "示例待办";
  return {
    mode: "sample",
    summary:
      "当前未配置 DEEPSEEK_API_KEY，返回示例结果。请在 Cursor Secrets 中绑定密钥后重新发布。",
    todos: [
      {
        title: title.startsWith("示例") ? "整理本周工作清单" : title,
        notes: "由示例模式生成，接入 DeepSeek 后会变成真实解析结果。",
        cycle_type: "weekly",
        cycle_config: { weekday: 1, time: "09:00" },
        due_at: null,
        next_at: null,
      },
      {
        title: "每晚复盘 10 分钟",
        notes: "示例周期待办",
        cycle_type: "daily",
        cycle_config: { time: "21:00" },
        due_at: null,
        next_at: null,
      },
    ],
  };
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 未返回 JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

function normalizeTodos(value: unknown): TodoInput[] {
  if (!value || typeof value !== "object") return [];
  const todos = (value as { todos?: unknown }).todos;
  if (!Array.isArray(todos)) return [];
  const allowed: CycleType[] = ["once", "daily", "weekly", "custom"];
  const out: TodoInput[] = [];
  for (const item of todos) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = String(row.title ?? "").trim();
    if (!title) continue;
    const cycleRaw = String(row.cycle_type ?? "once");
    const cycle_type = allowed.includes(cycleRaw as CycleType)
      ? (cycleRaw as CycleType)
      : "once";
    const cycle_config =
      row.cycle_config && typeof row.cycle_config === "object"
        ? (row.cycle_config as TodoInput["cycle_config"])
        : {};
    out.push({
      title,
      notes: String(row.notes ?? "").trim(),
      cycle_type,
      cycle_config,
      due_at:
        typeof row.due_at === "string" && row.due_at ? row.due_at : null,
      next_at:
        typeof row.next_at === "string" && row.next_at ? row.next_at : null,
    });
    if (out.length >= 12) break;
  }
  return out;
}

export async function parseTodosWithDeepSeek(
  prompt: string,
): Promise<AiParseResult> {
  const trimmed = prompt.trim().slice(0, 2000);
  if (!trimmed) throw new Error("请输入要解析的内容");

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim() ?? "";
  if (!apiKey) return sampleParse(trimmed);

  const messages: DeepSeekMessage[] = [
    {
      role: "system",
      content: `你是个人助理，把用户的自然语言整理成待办 JSON。
只输出 JSON，不要 markdown 解释。格式：
{
  "summary": "一句话说明你理解了什么",
  "todos": [
    {
      "title": "短标题",
      "notes": "补充说明可空",
      "cycle_type": "once|daily|weekly|custom",
      "cycle_config": { "weekday": 1, "everyDays": 3, "time": "09:00" },
      "due_at": null,
      "next_at": null
    }
  ]
}
规则：
- cycle_type=weekly 时 weekday 用 0=周日…6=周六
- cycle_type=custom 时 everyDays 为正整数
- 时间用 HH:mm；没有明确时间就省略 time
- 不要编造用户没说的敏感事项`,
    },
    { role: "user", content: trimmed },
  ];

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.2,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `DeepSeek 调用失败 (${res.status})${body ? `: ${body.slice(0, 180)}` : ""}`,
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content) as {
    summary?: string;
    todos?: unknown;
  };

  return {
    mode: "live",
    summary: String(parsed.summary ?? "已解析待办").trim(),
    todos: normalizeTodos(parsed),
  };
}

export async function briefWithDeepSeek(
  todosText: string,
): Promise<{ mode: "live" | "sample"; brief: string }> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return {
      mode: "sample",
      brief:
        "【示例摘要】今天先处理高优先级事项，周期待办按设定时间推进。配置 DEEPSEEK_API_KEY 后可生成真实助理摘要。",
    };
  }

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "你是简洁的中文个人助理。根据待办列表写 3-6 行今日工作建议，突出到期/周期项，不要客套。",
        },
        {
          role: "user",
          content: todosText.slice(0, 4000) || "当前没有待办。",
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek 摘要失败 (${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return {
    mode: "live",
    brief: (data.choices?.[0]?.message?.content ?? "暂无建议").trim(),
  };
}
