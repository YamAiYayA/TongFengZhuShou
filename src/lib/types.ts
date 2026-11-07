export type CycleType = "once" | "daily" | "weekly" | "custom";

export type TodoStatus = "open" | "done" | "archived";

export type CycleConfig = {
  /** weekly: 0=Sun .. 6=Sat */
  weekday?: number;
  /** custom: every N days */
  everyDays?: number;
  /** preferred time HH:mm */
  time?: string;
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
