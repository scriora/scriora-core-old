create table media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  sha256 text not null,
  mime text not null,
  bytes bigint not null check (bytes >= 0),
  storage_key text not null,
  linkedin_asset_urn text,
  status text not null check (status in ('STORED', 'REJECTED')),
  created_at timestamptz not null default now(),
  constraint media_assets_workspace_hash_key unique (workspace_id, sha256)
);

create index media_assets_workspace_id_idx on media_assets (workspace_id);

create trigger media_assets_enforce_scope
  before insert or update on media_assets
  for each row execute function enforce_workspace_scope();

alter table media_assets enable row level security;
alter table media_assets force row level security;

create policy media_assets_isolation on media_assets
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

grant select, insert, update, delete on table media_assets to scriora_app;
