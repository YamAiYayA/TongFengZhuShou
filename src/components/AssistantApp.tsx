"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CycleType, Todo } from "@/lib/types";

const CYCLE_LABEL: Record<CycleType, string> = {
  once: "单次",
  daily: "每天",
  weekly: "每周",
  custom: "自定义",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function AssistantApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [cycleType, setCycleType] = useState<CycleType>("once");
  const [dueLocal, setDueLocal] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<"live" | "sample" | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    const data = await api<{ todos: Todo[] }>("/api/todos");
    setTodos(data.todos);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const openCount = useMemo(
    () => todos.filter((t) => t.status === "open").length,
    [todos],
  );

  const onCreate = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const dueIso = dueLocal ? new Date(dueLocal).toISOString() : null;
      await api("/api/todos", {
        method: "POST",
        body: JSON.stringify({
          title,
          notes,
          cycle_type: cycleType,
          cycle_config:
            cycleType === "daily"
              ? { time: "09:00" }
              : cycleType === "weekly"
                ? { weekday: 1, time: "09:00" }
                : cycleType === "custom"
                  ? { everyDays: 3, time: "09:00" }
                  : {},
          due_at: dueIso,
          next_at: dueIso,
        }),
      });
      setTitle("");
      setNotes("");
      setDueLocal("");
      setCycleType("once");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  const onToggleDone = async (todo: Todo) => {
    setBusy(true);
    try {
      await api(`/api/todos/${todo.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: todo.status === "done" ? "open" : "done",
        }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/todos/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const onAiParse = async () => {
    if (!aiPrompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api<{
        mode: "live" | "sample";
        summary: string;
        todos: Todo[];
      }>("/api/ai/parse", {
        method: "POST",
        body: JSON.stringify({ prompt: aiPrompt, save: true }),
      });
      setAiMode(data.mode);
      setAiSummary(data.summary);
      setAiPrompt("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 解析失败");
    } finally {
      setBusy(false);
    }
  };

  const onBrief = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ mode: "live" | "sample"; brief: string }>(
        "/api/ai/brief",
        { method: "POST", body: "{}" },
      );
      setAiMode(data.mode);
      setBrief(data.brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : "摘要失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 pb-16 pt-10 sm:px-8">
      <header className="mb-10">
        <p
          className="text-[13px] font-semibold tracking-[0.18em] uppercase"
          style={{ color: "var(--moss)" }}
        >
          YAMA ASSISTANT
        </p>
        <h1
          className="mt-2 text-5xl leading-none sm:text-6xl"
          style={{
            fontFamily: "var(--font-display), Newsreader, serif",
            color: "var(--ink)",
          }}
        >
          助理
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          待办、时间周期，加上 DeepSeek：用自然语言丢进去，自动拆成可循环的事项。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
          <span>{openCount} 项进行中</span>
          {aiMode === "sample" && (
            <span
              className="rounded px-2 py-0.5 text-xs font-medium"
              style={{ background: "#f4e4c8", color: "var(--warn)" }}
            >
              示例 AI（待绑定 DeepSeek Key）
            </span>
          )}
          {aiMode === "live" && (
            <span
              className="rounded px-2 py-0.5 text-xs font-medium"
              style={{ background: "var(--leaf)", color: "var(--moss-deep)" }}
            >
              DeepSeek 已接入
            </span>
          )}
        </div>
      </header>

      {error && (
        <div
          className="mb-5 rounded-xl px-4 py-3 text-sm"
          style={{ background: "#fde8e8", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      <section
        className="mb-6 rounded-2xl p-5 sm:p-6"
        style={{
          background: "var(--panel)",
          boxShadow: "0 18px 50px rgba(21, 32, 24, 0.06)",
          border: "1px solid var(--line)",
        }}
      >
        <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
          DeepSeek 一句话建待办
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          例如：每周一上午整理周报；每天 21 点复盘；周五前提交报销。
        </p>
        <textarea
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          rows={3}
          placeholder="用自然语言描述你的安排…"
          className="mt-4 w-full resize-y rounded-xl border px-3 py-3 outline-none"
          style={{ borderColor: "var(--line)", background: "#fbfcfb" }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !aiPrompt.trim()}
            onClick={() => void onAiParse()}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--moss)" }}
          >
            AI 解析并保存
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onBrief()}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{
              background: "var(--leaf)",
              color: "var(--moss-deep)",
            }}
          >
            生成今日摘要
          </button>
        </div>
        {aiSummary && (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            {aiSummary}
          </p>
        )}
        {brief && (
          <pre
            className="mt-3 whitespace-pre-wrap rounded-xl px-3 py-3 text-sm leading-relaxed"
            style={{ background: "#f4f8f5", color: "var(--ink)" }}
          >
            {brief}
          </pre>
        )}
      </section>

      <section
        className="mb-6 rounded-2xl p-5 sm:p-6"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
        }}
      >
        <h2 className="text-lg font-semibold">手动新增</h2>
        <div className="mt-4 grid gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="待办标题"
            className="w-full rounded-xl border px-3 py-2.5 outline-none"
            style={{ borderColor: "var(--line)" }}
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="备注（可选）"
            rows={2}
            className="w-full rounded-xl border px-3 py-2.5 outline-none"
            style={{ borderColor: "var(--line)" }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm" style={{ color: "var(--muted)" }}>
              周期
              <select
                value={cycleType}
                onChange={(e) => setCycleType(e.target.value as CycleType)}
                className="mt-1 w-full rounded-xl border px-3 py-2.5 outline-none"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              >
                <option value="once">单次</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="custom">自定义（每 3 天）</option>
              </select>
            </label>
            <label className="text-sm" style={{ color: "var(--muted)" }}>
              到期 / 下次
              <input
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2.5 outline-none"
                style={{ borderColor: "var(--line)", color: "var(--ink)" }}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() => void onCreate()}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--ink)" }}
          >
            添加待办
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">清单</h2>
        {loading ? (
          <p style={{ color: "var(--muted)" }}>加载中…</p>
        ) : todos.length === 0 ? (
          <div
            className="rounded-2xl px-5 py-10 text-center"
            style={{ border: "1px dashed var(--line)", color: "var(--muted)" }}
          >
            还没有待办。先用上面的 AI 输入一句话试试。
          </div>
        ) : (
          <ul className="grid gap-3">
            {todos.map((todo) => (
              <li
                key={todo.id}
                className="rounded-2xl px-4 py-4"
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  opacity: todo.status === "done" ? 0.62 : 1,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className="text-base font-semibold"
                        style={{
                          textDecoration:
                            todo.status === "done" ? "line-through" : "none",
                        }}
                      >
                        {todo.title}
                      </h3>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          background: "var(--leaf)",
                          color: "var(--moss-deep)",
                        }}
                      >
                        {CYCLE_LABEL[todo.cycle_type]}
                      </span>
                    </div>
                    {todo.notes ? (
                      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                        {todo.notes}
                      </p>
                    ) : null}
                    {(todo.next_at || todo.due_at) && (
                      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                        下次：
                        {new Date(todo.next_at || todo.due_at || "").toLocaleString(
                          "zh-CN",
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onToggleDone(todo)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                      style={{
                        background:
                          todo.status === "done" ? "#eef2ef" : "var(--moss)",
                        color: todo.status === "done" ? "var(--ink)" : "#fff",
                      }}
                    >
                      {todo.status === "done" ? "恢复" : "完成"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onDelete(todo.id)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                      style={{ background: "#f6eaea", color: "var(--danger)" }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
