create type outbox_state as enum (
  'PENDING',
  'PROCESSING',
  'PUBLISHED',
  'FAILED'
);

create table outbox_commands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  idempotency_key text not null,
  command text not null,
  payload jsonb not null,
  state outbox_state not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lock_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outbox_commands_workspace_key unique (workspace_id, idempotency_key)
);

create index outbox_commands_due_idx
  on outbox_commands (next_attempt_at)
  where state in ('PENDING', 'PROCESSING');

alter table outbox_commands enable row level security;
alter table outbox_commands force row level security;

create policy outbox_commands_isolation on outbox_commands
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

create or replace function claim_outbox_commands(batch_size integer)
returns setof outbox_commands
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  update outbox_commands as o
  set
    state = 'PROCESSING',
    attempt_count = o.attempt_count + 1,
    lock_expires_at = now() + interval '30 seconds',
    updated_at = now()
  where o.id in (
    select c.id
    from outbox_commands c
    where c.state in ('PENDING', 'PROCESSING')
      and c.next_attempt_at <= now()
      and (c.lock_expires_at is null or c.lock_expires_at <= now())
    order by c.next_attempt_at
    limit batch_size
    for update skip locked
  )
  returning o.*;
end;
$$;

revoke all on function claim_outbox_commands(integer) from public;
grant execute on function claim_outbox_commands(integer) to scriora_app;

grant usage on type outbox_state to scriora_app;
grant select, insert, update, delete on table outbox_commands to scriora_app;
