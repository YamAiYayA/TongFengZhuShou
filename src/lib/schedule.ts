import type { CycleConfig, CycleType, Todo, TodoInput } from "./types";

function parseHm(hm: string): { h: number; m: number } | null {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

function atHm(day: Date, hm: string): Date | null {
  const p = parseHm(hm);
  if (!p) return null;
  const d = new Date(day);
  d.setHours(p.h, p.m, 0, 0);
  return d;
}

function formatHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Next fire for interval-in-window schedules. */
export function nextIntervalAt(
  config: CycleConfig,
  from: Date = new Date(),
): Date | null {
  const minutes = Number(config.intervalMinutes);
  if (!Number.isFinite(minutes) || minutes < 1) return null;
  const start = config.windowStart ?? "00:00";
  const end = config.windowEnd ?? "23:59";
  const startAt = atHm(from, start);
  const endAt = atHm(from, end);
  if (!startAt || !endAt || endAt <= startAt) return null;

  if (from < startAt) return startAt;
  if (from > endAt) {
    const tomorrow = new Date(from);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return atHm(tomorrow, start);
  }

  const elapsed = from.getTime() - startAt.getTime();
  const step = minutes * 60_000;
  const steps = Math.floor(elapsed / step) + 1;
  const candidate = new Date(startAt.getTime() + steps * step);
  if (candidate <= endAt) return candidate;

  const tomorrow = new Date(from);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return atHm(tomorrow, start);
}

export function computeNextAt(
  cycleType: CycleType,
  config: CycleConfig,
  dueAt?: string | null,
  from: Date = new Date(),
): string | null {
  if (cycleType === "interval") {
    const n = nextIntervalAt(config, from);
    return n ? n.toISOString() : null;
  }
  if (dueAt) return dueAt;
  if (config.time) {
    const today = atHm(from, config.time);
    if (!today) return null;
    if (today > from) return today.toISOString();
    const tomorrow = new Date(from);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const n = atHm(tomorrow, config.time);
    return n ? n.toISOString() : null;
  }
  return null;
}

export function enrichTodoInput(input: TodoInput): TodoInput {
  const cycle_type = input.cycle_type ?? "once";
  const cycle_config = normalizeCycleConfig(cycle_type, input.cycle_config ?? {});
  const next_at =
    input.next_at ??
    computeNextAt(cycle_type, cycle_config, input.due_at ?? null);
  return {
    ...input,
    cycle_type,
    cycle_config,
    next_at,
  };
}

export function normalizeCycleConfig(
  cycleType: CycleType,
  raw: CycleConfig,
): CycleConfig {
  const cfg: CycleConfig = {};
  if (typeof raw.time === "string" && parseHm(raw.time)) cfg.time = raw.time;
  if (typeof raw.weekday === "number" && raw.weekday >= 0 && raw.weekday <= 6) {
    cfg.weekday = raw.weekday;
  }
  if (
    typeof raw.intervalMinutes === "number" &&
    Number.isFinite(raw.intervalMinutes) &&
    raw.intervalMinutes >= 1
  ) {
    cfg.intervalMinutes = Math.round(raw.intervalMinutes);
  }
  if (typeof raw.windowStart === "string" && parseHm(raw.windowStart)) {
    cfg.windowStart = raw.windowStart;
  }
  if (typeof raw.windowEnd === "string" && parseHm(raw.windowEnd)) {
    cfg.windowEnd = raw.windowEnd;
  }
  if (
    typeof raw.goalAmount === "number" &&
    Number.isFinite(raw.goalAmount) &&
    raw.goalAmount > 0
  ) {
    cfg.goalAmount = raw.goalAmount;
  }
  if (typeof raw.goalUnit === "string" && raw.goalUnit.trim()) {
    cfg.goalUnit = raw.goalUnit.trim();
  }

  if (cycleType === "interval") {
    if (!cfg.intervalMinutes) cfg.intervalMinutes = 30;
    if (!cfg.windowStart) cfg.windowStart = "09:00";
    if (!cfg.windowEnd) cfg.windowEnd = "21:00";
  }
  return cfg;
}

export function cycleTypeLabel(type: CycleType): string {
  switch (type) {
    case "once":
      return "单次";
    case "daily":
      return "每天";
    case "weekly":
      return "每周";
    case "interval":
      return "间隔";
    default:
      return type;
  }
}

export function formatCycleDetail(todo: Pick<Todo, "cycle_type" | "cycle_config">): string {
  const c = todo.cycle_config ?? {};
  if (todo.cycle_type === "interval") {
    const parts = [
      c.intervalMinutes ? `每 ${c.intervalMinutes} 分钟` : null,
      c.windowStart && c.windowEnd
        ? `${c.windowStart}–${c.windowEnd}`
        : null,
      c.goalAmount
        ? `目标 ${c.goalAmount}${c.goalUnit ?? ""}`
        : null,
    ].filter(Boolean);
    return parts.join(" · ");
  }
  if (todo.cycle_type === "daily") {
    return c.time ? `每天 ${c.time}` : "每天";
  }
  if (todo.cycle_type === "weekly") {
    const days = ["日", "一", "二", "三", "四", "五", "六"];
    const day =
      typeof c.weekday === "number" ? `周${days[c.weekday] ?? "?"}` : "每周";
    return c.time ? `${day} ${c.time}` : day;
  }
  if (c.time) return `单次 ${c.time}`;
  return "单次";
}

export function formatNextAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString("zh-CN")} ${formatHm(d)}`;
}
