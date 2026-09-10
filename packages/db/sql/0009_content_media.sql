create table content_media (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  content_id uuid not null references contents (id) on delete cascade,
  media_asset_id uuid not null references media_assets (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint content_media_pkey primary key (content_id, media_asset_id)
);

create index content_media_workspace_id_idx on content_media (workspace_id);

create trigger content_media_enforce_scope
  before insert or update on content_media
  for each row execute function enforce_workspace_scope();

alter table content_media enable row level security;
alter table content_media force row level security;

create policy content_media_isolation on content_media
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

grant select, insert, update, delete on table content_media to scriora_app;
