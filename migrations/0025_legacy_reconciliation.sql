-- Additive, immutable findings and dispositions preserve the original dossier.
create table legacy_reconciliation_issues (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  kind text not null check (kind in ('MISSING_OFFICIAL_DECISION','MISSING_STORAGE_OBJECT')),
  application_id uuid not null references applications(id),
  document_id uuid references documents(id),
  storage_key text,
  detected_at timestamptz not null default now()
);
create table legacy_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references legacy_reconciliation_issues(id),
  outcome text not null check(outcome in ('DETECTED','OWNER_DISPOSITION','RESTORED')),
  actor_id uuid not null references users(id),
  note text not null,
  created_at timestamptz not null default now()
);
create index legacy_reconciliation_event_issue_idx on legacy_reconciliation_events(issue_id,created_at);
create function immutable_legacy_reconciliation() returns trigger language plpgsql as $$
begin raise exception 'Immutable reconciliation history cannot be edited or deleted'; end;
$$;
create trigger legacy_reconciliation_issues_immutable before update or delete on legacy_reconciliation_issues
  for each row execute function immutable_legacy_reconciliation();
create trigger legacy_reconciliation_events_immutable before update or delete on legacy_reconciliation_events
  for each row execute function immutable_legacy_reconciliation();
