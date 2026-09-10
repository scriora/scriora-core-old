create table oauth_pending_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  platform text not null check (platform = 'linkedin'),
  state_hash text not null,
  redirect_uri text not null,
  key_version integer not null check (key_version >= 1),
  iv bytea not null,
  tag bytea not null,
  ciphertext bytea not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint oauth_pending_states_hash_key unique (state_hash),
  constraint oauth_pending_states_iv_len check (octet_length(iv) = 12),
  constraint oauth_pending_states_tag_len check (octet_length(tag) = 16)
);

create index oauth_pending_states_workspace_id_idx on oauth_pending_states (workspace_id);

create table social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  platform text not null check (platform = 'linkedin'),
  external_account_id text not null,
  display_name text not null,
  granted_scopes text[] not null,
  token_expires_at timestamptz,
  refresh_mode text not null check (refresh_mode in ('refresh', 'reauthorize')),
  cap_oauth boolean not null,
  cap_publish boolean not null,
  cap_comments boolean not null,
  cap_analytics boolean not null,
  cap_inbox boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_accounts_platform_external_key unique (platform, external_account_id)
);

create index social_accounts_workspace_id_idx on social_accounts (workspace_id);
create index social_accounts_workspace_platform_idx on social_accounts (workspace_id, platform);

create trigger oauth_pending_states_enforce_scope
  before insert or update on oauth_pending_states
  for each row execute function enforce_workspace_scope();

create trigger social_accounts_enforce_scope
  before insert or update on social_accounts
  for each row execute function enforce_workspace_scope();

alter table oauth_pending_states enable row level security;
alter table oauth_pending_states force row level security;
alter table social_accounts enable row level security;
alter table social_accounts force row level security;

create policy oauth_pending_states_isolation on oauth_pending_states
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

create policy social_accounts_isolation on social_accounts
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

grant select, insert, update, delete on table
  oauth_pending_states,
  social_accounts
to scriora_app;
