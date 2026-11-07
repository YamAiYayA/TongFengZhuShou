export type CycleType = "once" | "daily" | "weekly" | "interval";

export type TodoStatus = "open" | "done" | "archived";

export type CycleConfig = {
  /** weekly: 0=Sun .. 6=Sat */
  weekday?: number;
  /** preferred clock time HH:mm (daily/weekly/once) */
  time?: string;
  /** interval: every N minutes inside a daily window */
  intervalMinutes?: number;
  /** window start HH:mm */
  windowStart?: string;
  /** window end HH:mm */
  windowEnd?: string;
  /** optional quantitative goal, e.g. 3000 */
  goalAmount?: number;
  /** goal unit, e.g. ml / L / 次 */
  goalUnit?: string;
};

export type Todo = {
  id: string;
  owner_sub: string;
  title: string;
  notes: string;
  cycle_type: CycleType;
  cycle_config: CycleConfig;
  due_at: string | null;
  next_at: string | null;
  status: TodoStatus;
  created_at: string;
  updated_at: string;
};

export type TodoInput = {
  title: string;
  notes?: string;
  cycle_type?: CycleType;
  cycle_config?: CycleConfig;
  due_at?: string | null;
  next_at?: string | null;
  status?: TodoStatus;
};
