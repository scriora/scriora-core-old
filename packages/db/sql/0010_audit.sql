alter table approvals
  add column if not exists decided_by text,
  add column if not exists decided_at timestamptz;
