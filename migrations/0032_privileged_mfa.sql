-- Candidate only; outside authorized Production 0020-0031 scope.
alter table sessions add column if not exists mfa_verified_at timestamptz;
create table if not exists mfa_credentials (
  user_id uuid primary key references users(id) on delete cascade,
  encrypted_secret text not null,
  enrollment_expires_at timestamptz not null,
  confirmed_at timestamptz,
  last_epoch bigint,
  recovery_hashes jsonb not null default '[]'::jsonb,
  check (jsonb_typeof(recovery_hashes) = 'array')
);
alter table mfa_credentials enable row level security;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then revoke all on mfa_credentials from anon; end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on mfa_credentials from authenticated; end if;
end $$;
revoke all on mfa_credentials from public;
create table if not exists mfa_enrollment_authorizations (
  user_id uuid primary key references users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  issued_by uuid references users(id) on delete set null
);
alter table mfa_enrollment_authorizations enable row level security;
revoke all on mfa_enrollment_authorizations from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then revoke all on mfa_enrollment_authorizations from anon; end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on mfa_enrollment_authorizations from authenticated; end if;
end $$;
