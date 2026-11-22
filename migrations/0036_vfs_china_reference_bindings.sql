-- VFS China manual reference binding: private, Staff-owned, no automation enabled.
-- Schema qualification is provided by migration runner search_path for the target schema.
-- Never expose this reference table via anon/authenticated Data API roles.
create table if not exists vfs_china_bindings (
  application_id uuid primary key references applications(id) on delete restrict,
  vfs_reference text not null unique,
  saved_by uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vfs_china_reference_format check (vfs_reference ~ '^ALG[A-Z0-9]{10,26}$')
);
create index if not exists vfs_china_bindings_saved_by_idx on vfs_china_bindings(saved_by);
alter table vfs_china_bindings enable row level security;
revoke all privileges on table vfs_china_bindings from public, anon, authenticated;
comment on table vfs_china_bindings is
  'Staff-only VFS China reference bound to an existing VISA OS application; never create applications for unmatched Gmail certificates.';

