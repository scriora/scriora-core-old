create table autonomy_policies (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  mode text not null check (mode in ('CAREFUL', 'BALANCED')),
  dispatch_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  status text not null check (status in (
    'IDEA',
    'DRAFT',
    'IN_REVIEW',
    'APPROVED',
    'REJECTED',
    'SCHEDULED',
    'PUBLISHED',
    'FAILED',
    'ARCHIVED'
  )),
  origin_mode text not null default 'CLASSIC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contents_workspace_status_idx on contents (workspace_id, status);

create table content_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  content_id uuid not null references contents (id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  body text not null,
  created_at timestamptz not null default now(),
  constraint content_versions_content_version_key unique (content_id, version_number)
);

create index content_versions_content_id_idx on content_versions (content_id);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  resource_type text not null check (resource_type = 'CONTENT'),
  resource_id uuid not null,
  status text not null check (status in (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index approvals_workspace_status_idx on approvals (workspace_id, status);
create index approvals_resource_idx on approvals (resource_type, resource_id);

create trigger autonomy_policies_enforce_scope
  before insert or update on autonomy_policies
  for each row execute function enforce_workspace_scope();

create trigger contents_enforce_scope
  before insert or update on contents
  for each row execute function enforce_workspace_scope();

create trigger content_versions_enforce_scope
  before insert or update on content_versions
  for each row execute function enforce_workspace_scope();

create trigger approvals_enforce_scope
  before insert or update on approvals
  for each row execute function enforce_workspace_scope();

alter table autonomy_policies enable row level security;
alter table autonomy_policies force row level security;
alter table contents enable row level security;
alter table contents force row level security;
alter table content_versions enable row level security;
alter table content_versions force row level security;
alter table approvals enable row level security;
alter table approvals force row level security;

create policy autonomy_policies_isolation on autonomy_policies
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

create policy contents_isolation on contents
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

create policy content_versions_isolation on content_versions
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

create policy approvals_isolation on approvals
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

grant select, insert, update, delete on table
  autonomy_policies,
  contents,
  content_versions,
  approvals
to scriora_app;
