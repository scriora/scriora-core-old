create type publish_attempt_status as enum (
  'RESERVED',
  'DISPATCHING',
  'PLATFORM_PENDING',
  'SUCCEEDED',
  'UNKNOWN_EXTERNAL_STATE',
  'FAILED_PERMANENT'
);

create table secret_envelopes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null,
  key_version integer not null check (key_version >= 1),
  iv bytea not null,
  tag bytea not null,
  ciphertext bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secret_envelopes_workspace_name_key unique (workspace_id, name),
  constraint secret_envelopes_iv_len check (octet_length(iv) = 12),
  constraint secret_envelopes_tag_len check (octet_length(tag) = 16)
);

create index secret_envelopes_workspace_id_idx on secret_envelopes (workspace_id);

create table publish_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  idempotency_key text not null,
  request_fingerprint text not null,
  status publish_attempt_status not null,
  attempt_number integer not null check (attempt_number >= 1),
  remote_operation_id text,
  external_post_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint publish_attempts_workspace_idempotency_key unique (workspace_id, idempotency_key)
);

create index publish_attempts_workspace_id_idx on publish_attempts (workspace_id);
create index publish_attempts_status_idx on publish_attempts (workspace_id, status);

create table llm_usage_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  prompt_tokens integer not null check (prompt_tokens >= 0),
  completion_tokens integer not null check (completion_tokens >= 0),
  estimated_cost numeric(14, 4) not null check (estimated_cost >= 0),
  created_at timestamptz not null default now()
);

create index llm_usage_entries_workspace_id_idx on llm_usage_entries (workspace_id);

create table media_usage_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  bytes bigint not null check (bytes >= 0),
  created_at timestamptz not null default now()
);

create index media_usage_entries_workspace_id_idx on media_usage_entries (workspace_id);

create trigger secret_envelopes_enforce_scope
  before insert or update on secret_envelopes
  for each row execute function enforce_workspace_scope();

create trigger publish_attempts_enforce_scope
  before insert or update on publish_attempts
  for each row execute function enforce_workspace_scope();

create trigger llm_usage_entries_enforce_scope
  before insert or update on llm_usage_entries
  for each row execute function enforce_workspace_scope();

create trigger media_usage_entries_enforce_scope
  before insert or update on media_usage_entries
  for each row execute function enforce_workspace_scope();

alter table secret_envelopes enable row level security;
alter table secret_envelopes force row level security;
alter table publish_attempts enable row level security;
alter table publish_attempts force row level security;
alter table llm_usage_entries enable row level security;
alter table llm_usage_entries force row level security;
alter table media_usage_entries enable row level security;
alter table media_usage_entries force row level security;

create policy secret_envelopes_isolation on secret_envelopes
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

create policy publish_attempts_isolation on publish_attempts
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

create policy llm_usage_entries_isolation on llm_usage_entries
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

create policy media_usage_entries_isolation on media_usage_entries
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

grant usage on type publish_attempt_status to scriora_app;
grant select, insert, update, delete on table
  secret_envelopes,
  publish_attempts,
  llm_usage_entries,
  media_usage_entries
to scriora_app;
