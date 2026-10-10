-- New server-owned reconciliation history must retain the API lockdown of 0024.
-- No browser/direct API role receives a policy: access uses authenticated server workflows.
-- A database sequence orders immutable events even when transactions began in the opposite order.
alter table legacy_reconciliation_events add column event_sequence bigserial not null;
create unique index legacy_reconciliation_event_sequence_idx on legacy_reconciliation_events(event_sequence);
alter table legacy_reconciliation_issues enable row level security;
alter table legacy_reconciliation_events enable row level security;
revoke all on legacy_reconciliation_issues, legacy_reconciliation_events from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on legacy_reconciliation_issues, legacy_reconciliation_events from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on legacy_reconciliation_issues, legacy_reconciliation_events from authenticated';
  end if;
end $$;
