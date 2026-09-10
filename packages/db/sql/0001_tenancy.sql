-- Identity and workspace isolation. Application queries run as scriora_app,
-- which is subject to forced RLS. Superuser/migrator is for DDL only.
-- Do not grant tenant tables to anon or authenticated.

create extension if not exists pgcrypto;

create type workspace_purpose as enum ('PERSONAL', 'WORK', 'CLIENT', 'AGENT');
create type operating_mode as enum ('CLASSIC', 'AGENT', 'MISSION');
create type workspace_role as enum ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  avatar_url text,
  auth_provider text not null default 'local',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_key unique (email)
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  purpose workspace_purpose not null,
  default_operating_mode operating_mode not null default 'CLASSIC',
  owner_user_id uuid references users (id) on delete restrict,
  country text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint workspaces_slug_key unique (slug),
  constraint workspaces_name_len check (char_length(name) between 2 and 100)
);

create index workspaces_purpose_idx on workspaces (purpose);
create index workspaces_owner_user_id_idx on workspaces (owner_user_id);

create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid not null references users (id) on delete restrict,
  workspace_role workspace_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_members_workspace_user_key unique (workspace_id, user_id)
);

create index workspace_members_workspace_id_idx on workspace_members (workspace_id);
create index workspace_members_user_id_idx on workspace_members (user_id);

create or replace function current_workspace_id()
returns uuid
language sql
stable
parallel safe
set search_path = pg_catalog
as $$
  select nullif(current_setting('app.current_workspace_id', true), '')::uuid
$$;

create or replace function enforce_workspace_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_table_name = 'workspaces' then
    if new.id is distinct from current_workspace_id() then
      raise exception 'workspace scope mismatch';
    end if;
  elsif new.workspace_id is distinct from current_workspace_id() then
    raise exception 'workspace scope mismatch';
  end if;
  return new;
end;
$$;

create trigger workspaces_enforce_scope
  before insert or update on workspaces
  for each row execute function enforce_workspace_scope();

create trigger workspace_members_enforce_scope
  before insert or update on workspace_members
  for each row execute function enforce_workspace_scope();

alter table users enable row level security;
alter table users force row level security;
alter table workspaces enable row level security;
alter table workspaces force row level security;
alter table workspace_members enable row level security;
alter table workspace_members force row level security;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'scriora_app') then
    create role scriora_app nologin;
  end if;
end
$$;

create policy users_app_access on users
  for all
  to scriora_app
  using (true)
  with check (true);

create policy workspaces_isolation on workspaces
  for all
  to scriora_app
  using (id = (select current_workspace_id()))
  with check (id = (select current_workspace_id()));

create policy workspace_members_isolation on workspace_members
  for all
  to scriora_app
  using (workspace_id = (select current_workspace_id()))
  with check (workspace_id = (select current_workspace_id()));

grant usage on schema public to scriora_app;
grant usage on type workspace_purpose, operating_mode, workspace_role to scriora_app;
grant select, insert, update, delete on table users, workspaces, workspace_members to scriora_app;
