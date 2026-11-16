-- Candidate only, excluded from automatic migration discovery.
-- No scheduler, approved policy, hosted execution or legal approval is created.
-- The application supports qualified disposable loopback execution only.
create table document_retention_policy (
  singleton boolean primary key default true check(singleton),
  policy_version text not null default 'visa-documents-120-v1' check(policy_version='visa-documents-120-v1'),
  retention_days integer not null default 120 check(retention_days=120),
  execution_enabled boolean not null default false,
  approved_at timestamptz,
  legal_review_reference uuid,
  coverage_approved_at timestamptz,
  coverage_fingerprint text check(coverage_fingerprint is null or coverage_fingerprint ~ '^[a-f0-9]{64}$'),
  all_live_copies_covered boolean not null default false,
  restore_reconciliation_approved boolean not null default false,
  target_database text,
  target_schema text,
  storage_provider text
);
insert into document_retention_policy(singleton) values(true);

-- Append-only owner/legal dispositions. Holds never expire by passage of time.
-- No row means protected. A new decision invalidates an earlier exception review.
create table document_retention_case_events (
  event_sequence bigserial primary key,
  id uuid not null unique default gen_random_uuid(),
  application_id uuid not null references applications(id),
  reviewed_decision_at timestamptz,
  exceptions_reviewed boolean not null default false,
  legal_hold boolean not null default true,
  evidence_reference uuid not null,
  actor_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  check(not exceptions_reviewed or reviewed_decision_at is not null)
);
create index document_retention_case_latest_idx on document_retention_case_events(application_id,event_sequence desc);

-- Opaque identifiers and counts only: never filenames, passport numbers, notes or file bytes.
-- No FK to documents: the originals are deliberately removed in the same transaction.
create table document_retention_receipts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id),
  decision_at timestamptz not null,
  outcome text not null check(outcome in ('APPROVED','REJECTED')),
  decision_audit_id uuid not null references audit_logs(id),
  decision_document_id uuid not null,
  document_ids uuid[] not null,
  document_count integer not null check(document_count>0),
  blob_count integer not null check(blob_count>0),
  byte_count bigint not null check(byte_count>0),
  policy_version text not null check(policy_version='visa-documents-120-v1'),
  legal_review_reference uuid not null,
  case_event_id uuid not null references document_retention_case_events(id),
  manifest_sha256 text not null check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
  coverage_fingerprint text not null check(coverage_fingerprint ~ '^[a-f0-9]{64}$'),
  due_at timestamptz not null,
  purged_at timestamptz not null default clock_timestamp(),
  actor_id uuid not null references users(id),
  unique(application_id,decision_at),
  check(cardinality(document_ids)=document_count and decision_document_id=any(document_ids)),
  check(due_at=((decision_at at time zone 'UTC'+interval '120 days') at time zone 'UTC') and purged_at>=due_at)
);

create function reject_document_retention_evidence_mutation() returns trigger language plpgsql as $$
begin raise exception 'Document retention evidence is immutable'; end;
$$;
create trigger document_retention_case_events_immutable before update or delete on document_retention_case_events
  for each row execute function reject_document_retention_evidence_mutation();
create trigger document_retention_receipts_immutable before update or delete on document_retention_receipts
  for each row execute function reject_document_retention_evidence_mutation();

do $$ declare app_schema text:=current_schema(); role_name text; relation_name text; begin
  execute format('alter function %I.reject_document_retention_evidence_mutation() set search_path to pg_catalog, %I',app_schema,app_schema);
  execute format('revoke all on function %I.reject_document_retention_evidence_mutation() from public',app_schema);
  foreach relation_name in array array['document_retention_policy','document_retention_case_events','document_retention_receipts'] loop
    execute format('alter table %I.%I enable row level security',app_schema,relation_name);
    execute format('revoke all on table %I.%I from public',app_schema,relation_name);
    foreach role_name in array array['anon','authenticated'] loop
      if exists(select 1 from pg_roles where rolname=role_name) then
        execute format('revoke all on table %I.%I from %I',app_schema,relation_name,role_name);
      end if;
    end loop;
  end loop;
  execute format('revoke all on sequence %I.document_retention_case_events_event_sequence_seq from public',app_schema);
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on function %I.reject_document_retention_evidence_mutation() from %I',app_schema,role_name);
      execute format('revoke all on sequence %I.document_retention_case_events_event_sequence_seq from %I',app_schema,role_name);
    end if;
  end loop;
end $$;
