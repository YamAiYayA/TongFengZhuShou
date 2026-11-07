import { enrichTodoInput } from "./schedule";
import type { CycleConfig, CycleType, TodoInput } from "./types";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export type AiParseResult = {
  mode: "live" | "sample";
  summary: string;
  todos: TodoInput[];
};

type DeepSeekMessage = { role: "system" | "user" | "assistant"; content: string };

function heuristicIntervalParse(prompt: string): TodoInput[] | null {
  const text = prompt.replace(/\s+/g, "");
  const interval =
    text.match(/每\s*(\d+)\s*分钟/) ||
    text.match(/每隔\s*(\d+)\s*分钟/) ||
    text.match(/(\d+)\s*分钟一次/);
  const window =
    text.match(/(\d{1,2})\s*[点:：]\s*(\d{0,2}).{0,6}?到.{0,6}?(\d{1,2})\s*[点:：]\s*(\d{0,2})/) ||
    text.match(/(\d{1,2}):(\d{2}).{0,4}[-–至到].{0,4}(\d{1,2}):(\d{2})/);
  const goalL = text.match(/(\d+(?:\.\d+)?)\s*[lL升]/);
  const goalMl = text.match(/(\d+)\s*ml/i);

  if (!interval) return null;
  const intervalMinutes = Number(interval[1]);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) return null;

  let windowStart = "09:00";
  let windowEnd = "21:00";
  if (window) {
    const h1 = Number(window[1]);
    const m1 = window[2] ? Number(window[2] || 0) : 0;
    const h2 = Number(window[3]);
    const m2 = window[4] ? Number(window[4] || 0) : 0;
    windowStart = `${String(h1).padStart(2, "0")}:${String(m1).padStart(2, "0")}`;
    windowEnd = `${String(h2).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
  }

  let goalAmount: number | undefined;
  let goalUnit: string | undefined;
  if (goalL) {
    goalAmount = Number(goalL[1]);
    goalUnit = "L";
  } else if (goalMl) {
    goalAmount = Number(goalMl[1]);
    goalUnit = "ml";
  }

  const title = /喝\s*水|饮水|补水|喝一次水/.test(prompt)
    ? "喝水"
    : "间隔提醒";

  return [
    enrichTodoInput({
      title,
      notes: "",
      cycle_type: "interval",
      cycle_config: {
        intervalMinutes,
        windowStart,
        windowEnd,
        goalAmount,
        goalUnit,
      },
    }),
  ];
}

function sampleParse(prompt: string): AiParseResult {
  const heuristic = heuristicIntervalParse(prompt);
  if (heuristic) {
    return {
      mode: "sample",
      summary: "已按间隔+时间窗+目标解析（示例模式）。",
      todos: heuristic,
    };
  }
  return {
    mode: "sample",
    summary: "示例模式：未识别为间隔计划，生成普通周期待办。",
    todos: [
      enrichTodoInput({
        title: "整理本周工作清单",
        notes: "",
        cycle_type: "weekly",
        cycle_config: { weekday: 1, time: "09:00" },
      }),
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

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

function normalizeCycleConfig(raw: unknown): CycleConfig {
  if (!raw || typeof raw !== "object") return {};
  const row = raw as Record<string, unknown>;
  const cfg: CycleConfig = {};
  if (typeof row.time === "string") cfg.time = row.time;
  if (typeof row.weekday === "number") cfg.weekday = row.weekday;
  const interval = asNumber(row.intervalMinutes ?? row.interval_minutes);
  if (interval !== undefined) cfg.intervalMinutes = interval;
  if (typeof row.windowStart === "string") cfg.windowStart = row.windowStart;
  if (typeof row.windowEnd === "string") cfg.windowEnd = row.windowEnd;
  if (typeof row.window_start === "string") cfg.windowStart = row.window_start;
  if (typeof row.window_end === "string") cfg.windowEnd = row.window_end;
  const goal = asNumber(row.goalAmount ?? row.goal_amount);
  if (goal !== undefined) cfg.goalAmount = goal;
  if (typeof row.goalUnit === "string") cfg.goalUnit = row.goalUnit;
  if (typeof row.goal_unit === "string") cfg.goalUnit = row.goal_unit;
  return cfg;
}

function normalizeTodos(value: unknown): TodoInput[] {
  if (!value || typeof value !== "object") return [];
  const todos = (value as { todos?: unknown }).todos;
  if (!Array.isArray(todos)) return [];
  const allowed: CycleType[] = ["once", "daily", "weekly", "interval"];
  const out: TodoInput[] = [];
  for (const item of todos) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = String(row.title ?? "").trim();
    if (!title) continue;
    let cycleRaw = String(row.cycle_type ?? "once");
    if (cycleRaw === "custom") cycleRaw = "interval";
    const cycle_type = allowed.includes(cycleRaw as CycleType)
      ? (cycleRaw as CycleType)
      : "once";
    const cycle_config = normalizeCycleConfig(row.cycle_config);
    // Never dump the whole user prompt into notes.
    const notes = String(row.notes ?? "")
      .trim()
      .slice(0, 120);
    out.push(
      enrichTodoInput({
        title: title.slice(0, 40),
        notes,
        cycle_type,
        cycle_config,
        due_at:
          typeof row.due_at === "string" && row.due_at ? row.due_at : null,
        next_at:
          typeof row.next_at === "string" && row.next_at ? row.next_at : null,
      }),
    );
    if (out.length >= 8) break;
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
      content: `你是个人助理，把自然语言变成「结构化周期待办」。只输出 JSON。

核心原则：
1. 把「间隔 + 时间窗 + 目标」收成【一条】待办，不要把用户原话整段塞进 notes。
2. 标题要短（2-8 字），例如「喝水」。
3. 有「每 N 分钟 / 每隔 N 分钟」时，必须用 cycle_type="interval"。
4. notes 只写一句补充，可空；禁止复述完整用户句子。

JSON 格式：
{
  "summary": "一句话确认结构，例如：已设为 09:00–23:00 每20分钟喝水，目标3L",
  "todos": [
    {
      "title": "喝水",
      "notes": "",
      "cycle_type": "interval",
      "cycle_config": {
        "intervalMinutes": 20,
        "windowStart": "09:00",
        "windowEnd": "23:00",
        "goalAmount": 3,
        "goalUnit": "L"
      }
    }
  ]
}

cycle_type 只能是：once | daily | weekly | interval
- interval：必填 intervalMinutes、windowStart、windowEnd；可选 goalAmount/goalUnit
- daily：用 time（HH:mm）
- weekly：用 weekday(0=周日…6=周六) + time
- once：单次，可有 due_at

示例输入：「上午9点到晚上23点之间，每20分钟喝一次水，全天共喝3L水」
→ 只能生成 1 条 interval 待办，标题「喝水」，配置如上。`,
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
      temperature: 0.1,
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

  let todos = normalizeTodos(parsed);
  // Fallback if model still dumps a vague custom blob
  if (
    todos.length === 0 ||
    (todos.length === 1 &&
      todos[0].cycle_type !== "interval" &&
      /每\s*\d+\s*分钟|每隔/.test(trimmed))
  ) {
    const heuristic = heuristicIntervalParse(trimmed);
    if (heuristic) todos = heuristic;
  }

  return {
    mode: "live",
    summary: String(parsed.summary ?? "已解析待办").trim(),
    todos,
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
        "【示例摘要】优先推进带时间窗的间隔待办，再处理每日/每周事项。",
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
            "你是简洁的中文个人助理。根据结构化待办写 3-6 行今日建议，突出间隔提醒与目标进度，不要客套。",
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
