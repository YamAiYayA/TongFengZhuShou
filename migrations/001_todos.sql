create table if not exists todos (
  id text primary key,
  owner_sub text not null,
  title text not null,
  notes text not null default '',
  cycle_type text not null default 'once',
  cycle_config jsonb not null default '{}'::jsonb,
  due_at timestamptz,
  next_at timestamptz,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists todos_owner_status_idx on todos (owner_sub, status, next_at);
