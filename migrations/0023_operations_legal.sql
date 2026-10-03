-- This migration is applied to disposable/local schemas first. Hosted build
-- execution on the hardening branch is forbidden by build-policy.ts.
alter table notifications add column if not exists document_request_id uuid references document_requests(id);
create index if not exists notifications_request_idx on notifications(document_request_id);

create table legal_versions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('terms','privacy')),
  locale text not null check (locale in ('en','fr','ar')),
  version integer not null check (version > 0),
  body text not null check (length(trim(body)) > 0),
  published_at timestamptz not null,
  author_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique(kind,locale,version)
);

create or replace function reject_immutable_record_mutation() returns trigger
language plpgsql as $$ begin raise exception 'Immutable history cannot be changed'; end $$;
create trigger audit_history_immutable before update or delete on audit_logs
for each row execute function reject_immutable_record_mutation();
create trigger legal_history_immutable before update or delete on legal_versions
for each row execute function reject_immutable_record_mutation();

-- Existing consent retains the policy versions available when it was given.
alter table agency_registrations add column if not exists legal_consent_versions jsonb;

alter table countries add column if not exists name_fr text;
alter table countries add column if not exists name_ar text;
