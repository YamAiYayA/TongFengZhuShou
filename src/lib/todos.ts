import { randomUUID } from "node:crypto";
import { sql } from "./db";
import { enrichTodoInput } from "./schedule";
import type { CycleConfig, CycleType, Todo, TodoInput, TodoStatus } from "./types";

type TodoRow = {
  id: string;
  owner_sub: string;
  title: string;
  notes: string;
  cycle_type: CycleType;
  cycle_config: CycleConfig | string;
  due_at: string | null;
  next_at: string | null;
  status: TodoStatus;
  created_at: string;
  updated_at: string;
};

function mapRow(row: TodoRow): Todo {
  const config =
    typeof row.cycle_config === "string"
      ? (JSON.parse(row.cycle_config) as CycleConfig)
      : row.cycle_config ?? {};
  const cycle_type =
    (row.cycle_type as string) === "custom" ? "interval" : row.cycle_type;
  return { ...row, cycle_type, cycle_config: config };
}

export async function listTodos(ownerSub: string): Promise<Todo[]> {
  const rows = await sql<TodoRow>(
    `select * from todos
     where owner_sub = $1 and status <> 'archived'
     order by
       case when status = 'open' then 0 else 1 end,
       coalesce(next_at, due_at, created_at) asc`,
    [ownerSub],
  );
  return rows.map(mapRow);
}

export async function createTodo(
  ownerSub: string,
  input: TodoInput,
): Promise<Todo> {
  const id = randomUUID();
  const enriched = enrichTodoInput(input);
  const title = enriched.title.trim();
  if (!title) throw new Error("标题不能为空");
  const cycleType: CycleType = enriched.cycle_type ?? "once";
  const cycleConfig = enriched.cycle_config ?? {};
  const dueAt = enriched.due_at ?? null;
  const nextAt = enriched.next_at ?? dueAt;
  const status: TodoStatus = enriched.status ?? "open";

  await sql(
    `insert into todos (
      id, owner_sub, title, notes, cycle_type, cycle_config, due_at, next_at, status
    ) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
    [
      id,
      ownerSub,
      title,
      (enriched.notes ?? "").trim(),
      cycleType,
      JSON.stringify(cycleConfig),
      dueAt,
      nextAt,
      status,
    ],
  );

  const rows = await sql<TodoRow>(`select * from todos where id = $1`, [id]);
  return mapRow(rows[0]);
}

export async function updateTodo(
  ownerSub: string,
  id: string,
  patch: Partial<TodoInput>,
): Promise<Todo | null> {
  const existing = await sql<TodoRow>(
    `select * from todos where id = $1 and owner_sub = $2`,
    [id, ownerSub],
  );
  if (!existing[0]) return null;
  const cur = mapRow(existing[0]);

  const title = patch.title !== undefined ? patch.title.trim() : cur.title;
  if (!title) throw new Error("标题不能为空");
  const notes = patch.notes !== undefined ? patch.notes.trim() : cur.notes;
  const cycleType = patch.cycle_type ?? cur.cycle_type;
  const cycleConfig = patch.cycle_config ?? cur.cycle_config;
  const dueAt = patch.due_at !== undefined ? patch.due_at : cur.due_at;
  const nextAt = patch.next_at !== undefined ? patch.next_at : cur.next_at;
  const status = patch.status ?? cur.status;

  await sql(
    `update todos set
      title = $1,
      notes = $2,
      cycle_type = $3,
      cycle_config = $4::jsonb,
      due_at = $5,
      next_at = $6,
      status = $7,
      updated_at = now()
     where id = $8 and owner_sub = $9`,
    [
      title,
      notes,
      cycleType,
      JSON.stringify(cycleConfig),
      dueAt,
      nextAt,
      status,
      id,
      ownerSub,
    ],
  );

  const rows = await sql<TodoRow>(
    `select * from todos where id = $1 and owner_sub = $2`,
    [id, ownerSub],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteTodo(
  ownerSub: string,
  id: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }>(
    `delete from todos where id = $1 and owner_sub = $2 returning id`,
    [id, ownerSub],
  );
  return rows.length > 0;
}
