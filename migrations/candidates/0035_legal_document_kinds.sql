-- Local RC qualification only, excluded from automatic migration discovery.
-- This never publishes a document or invents approval.
alter table legal_versions drop constraint legal_versions_kind_check;
alter table legal_versions add constraint legal_versions_kind_check check
  (kind in ('terms','privacy','legal_notice','cookies','commercial','staff_confidentiality','traveller_submission_declaration'));

-- Authenticated evidence only. Public partnership requests retain their existing
-- immutable version receipts and atomic registration audits, before any account exists.
create table legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check(document_type in ('terms_b2b','privacy_b2b','commercial_b2b','staff_confidentiality','traveller_submission_declaration')),
  legal_version_id uuid not null references legal_versions(id),
  version integer not null check(version>0),
  content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
  locale text not null check(locale in ('en','fr','ar')),
  user_id uuid not null references users(id),
  agency_id uuid references agencies(id),
  accepted_at timestamptz not null,
  method text not null,
  unique(user_id,legal_version_id,document_type),
  check(method=case document_type when 'privacy_b2b' then 'ACKNOWLEDGEMENT'
    when 'traveller_submission_declaration' then 'SUBMISSION_DECLARATION' else 'EXPLICIT_CHECKBOX' end)
);
create function reject_legal_acceptance_mutation() returns trigger language plpgsql as $$
begin raise exception 'Legal acceptance evidence is immutable'; end;
$$;
create trigger legal_acceptances_immutable before update or delete on legal_acceptances
  for each row execute function reject_legal_acceptance_mutation();
alter table legal_acceptances enable row level security;
revoke all on table legal_acceptances from public;
do $$ declare app_schema text:=current_schema(); role_name text; begin
  execute format('alter function %I.reject_legal_acceptance_mutation() set search_path to pg_catalog, %I',app_schema,app_schema);
  execute format('revoke all on function %I.reject_legal_acceptance_mutation() from public',app_schema);
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on table %I.legal_acceptances from %I',app_schema,role_name);
      execute format('revoke all on function %I.reject_legal_acceptance_mutation() from %I',app_schema,role_name);
    end if;
  end loop;
end $$;
