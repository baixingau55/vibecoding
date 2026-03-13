drop table if exists message_media cascade;
drop table if exists messages cascade;
drop table if exists scheduler_scans cascade;
drop table if exists inspection_failures cascade;
drop table if exists inspection_results cascade;
drop table if exists inspection_runs cascade;
drop table if exists inspection_task_regions cascade;
drop table if exists inspection_task_schedules cascade;
drop table if exists inspection_task_devices cascade;
drop table if exists inspection_tasks cascade;
drop table if exists algorithm_versions cascade;
drop table if exists algorithms cascade;
drop table if exists balance_ledger cascade;
drop table if exists purchase_records cascade;
drop table if exists service_balance cascade;
drop table if exists subscription_config cascade;

create table if not exists service_balance (
  id text primary key,
  total integer not null,
  remaining integer not null,
  used integer not null,
  purchased integer not null,
  last_updated_at timestamptz not null default now()
);

create table if not exists purchase_records (
  id text primary key,
  created_at timestamptz not null default now(),
  account_name text not null,
  amount integer not null,
  source text not null,
  note text not null
);

create table if not exists balance_ledger (
  id text primary key,
  created_at timestamptz not null default now(),
  delta integer not null,
  reason text not null,
  related_id text,
  note text
);

create table if not exists algorithms (
  id text primary key,
  name text not null,
  introduction text not null,
  latest_version text not null,
  categories jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  source text not null
);

create table if not exists algorithm_versions (
  id text primary key,
  algorithm_id text not null references algorithms(id) on delete cascade,
  version text not null
);

create table if not exists inspection_tasks (
  id text primary key,
  name text not null,
  status text not null,
  algorithm_ids jsonb not null default '[]'::jsonb,
  algorithm_versions jsonb not null default '{}'::jsonb,
  inspection_rule jsonb,
  message_rule jsonb not null default '{}'::jsonb,
  config_error_reason text,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists inspection_task_devices (
  id text primary key,
  task_id text not null references inspection_tasks(id) on delete cascade,
  qr_code text not null,
  mac text,
  channel_id integer not null,
  name text not null,
  status text not null,
  group_name text not null,
  preview_image text not null,
  profile_id text,
  profile_name text
);

create table if not exists inspection_task_schedules (
  id text primary key,
  task_id text not null references inspection_tasks(id) on delete cascade,
  schedule_type text not null,
  start_time text not null,
  end_time text,
  repeat_days jsonb not null default '[]'::jsonb,
  interval_minutes integer
);

create table if not exists inspection_task_regions (
  id text primary key,
  task_id text not null references inspection_tasks(id) on delete cascade,
  qr_code text not null,
  regions jsonb not null default '[]'::jsonb
);

create table if not exists inspection_runs (
  id text primary key,
  task_id text not null references inspection_tasks(id) on delete cascade,
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null,
  total_checks integer not null,
  successful_checks integer not null,
  failed_checks integer not null,
  charged_units integer not null,
  refunded_units integer not null,
  tplink_task_id text,
  profile_id text
);

create table if not exists inspection_results (
  id text primary key,
  run_id text not null references inspection_runs(id) on delete cascade,
  task_id text not null references inspection_tasks(id) on delete cascade,
  qr_code text not null,
  channel_id integer not null,
  algorithm_id text not null,
  algorithm_version text not null,
  image_url text not null,
  image_time timestamptz not null,
  result text not null,
  profile_id text
);

create table if not exists inspection_failures (
  id text primary key,
  run_id text not null references inspection_runs(id) on delete cascade,
  task_id text not null references inspection_tasks(id) on delete cascade,
  qr_code text not null,
  channel_id integer not null,
  algorithm_id text,
  error_code integer not null,
  message text not null
);

create table if not exists messages (
  id text primary key,
  task_id text not null references inspection_tasks(id) on delete cascade,
  run_id text references inspection_runs(id) on delete set null,
  result_id text references inspection_results(id) on delete set null,
  type text not null,
  read boolean not null default false,
  title text not null,
  description text not null,
  result text not null,
  qr_code text not null,
  channel_id integer not null,
  algorithm_id text not null,
  image_url text,
  image_id text,
  video_task_id text,
  profile_id text,
  created_at timestamptz not null default now()
);

create table if not exists message_media (
  id text primary key,
  message_id text references messages(id) on delete cascade,
  task_id text references inspection_tasks(id) on delete cascade,
  kind text not null,
  url text not null,
  expires_at timestamptz not null
);

create table if not exists subscription_config (
  id text primary key,
  callback_url text not null,
  sign_secret text not null,
  initialized_at timestamptz not null default now()
);

create table if not exists scheduler_scans (
  id text primary key,
  scanned_at timestamptz not null default now(),
  due_count integer not null,
  completed_count integer not null,
  failed_count integer not null,
  error_summary text
);
