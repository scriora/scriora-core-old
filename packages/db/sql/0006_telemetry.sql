create table analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  social_account_id uuid not null references social_accounts (id) on delete cascade,
  external_post_id text not null,
  snapshot_type text not null check (snapshot_type in ('MANUAL', 'SCHEDULED')),
  poll_slot text not null,
  data_capability text not null check (data_capability in (
    'PERMISSION_LIMITED',
    'OBSERVED',
    'UNSUPPORTED',
    'NOT_AVAILABLE'
  )),
  source_product text not null,
  granted_scopes text[] not null,
  raw_payload jsonb not null,
  recorded_at timestamptz not null default now(),
  constraint analytics_snapshots_post_slot unique (
    workspace_id,
    external_post_id,
    poll_slot
  )
);

create index analytics_snapshots_workspace_id_idx
  on analytics_snapshots (workspace_id);
create index analytics_snapshots_account_idx
  on analytics_snapshots (social_account_id);

create table analytics_metrics (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references analytics_snapshots (id) on delete cascade,
  workspace_id uuid not null references workspaces (id) on delete cascade,
  metric text not null check (
    metric in ('impressions', 'reactions', 'comments', 'bookmarks')
  ),
  value numeric,
  status text not null check (status in (
    'OBSERVED',
    'ZERO',
    'UNSUPPORTED',
    'PERMISSION_DENIED',
    'NOT_AVAILABLE'
  )),
  recorded_at timestamptz not null default now(),
  constraint analytics_metrics_snapshot_metric unique (snapshot_id, metric),
  constraint analytics_metrics_value_status check (
    (
      status = 'ZERO'
      and value = 0
    )
    or (
      status = 'OBSERVED'
      and value is not null
      and value <> 0
    )
    or (
      status in ('UNSUPPORTED', 'PERMISSION_DENIED', 'NOT_AVAILABLE')
      and value is null
    )
  )
);

create index analytics_metrics_snapshot_id_idx on analytics_metrics (snapshot_id);
create index analytics_metrics_workspace_id_idx on analytics_metrics (workspace_id);

create trigger analytics_snapshots_enforce_scope
  before insert or update on analytics_snapshots
  for each row execute function enforce_workspace_scope();

create trigger analytics_metrics_enforce_scope
  before insert or update on analytics_metrics
  for each row execute function enforce_workspace_scope();

alter table analytics_snapshots enable row level security;
alter table analytics_snapshots force row level security;
alter table analytics_metrics enable row level security;
alter table analytics_metrics force row level security;

create policy analytics_snapshots_isolation on analytics_snapshots
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

create policy analytics_metrics_isolation on analytics_metrics
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

grant select, insert, update, delete on table
  analytics_snapshots,
  analytics_metrics
to scriora_app;
