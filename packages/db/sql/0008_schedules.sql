create table content_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  content_id uuid not null references contents (id) on delete cascade,
  scheduled_at timestamptz not null,
  timezone text not null default 'UTC',
  idempotency_key text not null,
  status text not null check (status in ('PENDING', 'CANCELLED')),
  created_at timestamptz not null default now(),
  constraint content_schedules_workspace_key unique (workspace_id, idempotency_key)
);

create index content_schedules_workspace_time_idx
  on content_schedules (workspace_id, scheduled_at);

alter table content_versions
  add column if not exists source text not null default 'human';

create trigger content_schedules_enforce_scope
  before insert or update on content_schedules
  for each row execute function enforce_workspace_scope();

alter table content_schedules enable row level security;
alter table content_schedules force row level security;

create policy content_schedules_isolation on content_schedules
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

grant select, insert, update, delete on table content_schedules to scriora_app;
