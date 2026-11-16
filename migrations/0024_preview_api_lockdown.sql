alter table notifications add column if not exists topup_request_id uuid references wallet_topup_requests(id);
create index if not exists notifications_topup_idx on notifications(topup_request_id);
-- Migration 0013 looked for a constraint name across the whole database.
-- Repair only this schema when another schema caused that check to be skipped.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='visa_types'::regclass
    and conname='visa_types_embassy_applicability_check') then
    alter table visa_types add constraint visa_types_embassy_applicability_check
      check (embassy_applicability in ('NOT_APPLICABLE','OPTIONAL','APPLICABLE'));
  end if;
end $$;
-- Only the currently selected application schema is affected. Hosted build
-- migrations are disabled for the hardening branch. No global/public revocation.
do $$
declare selected_schema text := current_schema(); table_name text; role_name text;
begin
  if selected_schema is null then raise exception 'Select an application schema'; end if;
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on schema %I from %I',selected_schema,role_name);
      execute format('revoke all on all tables in schema %I from %I',selected_schema,role_name);
      execute format('revoke all on all sequences in schema %I from %I',selected_schema,role_name);
      execute format('revoke all on all functions in schema %I from %I',selected_schema,role_name);
      execute format('alter default privileges in schema %I revoke all on tables from %I',selected_schema,role_name);
      execute format('alter default privileges in schema %I revoke all on sequences from %I',selected_schema,role_name);
      execute format('alter default privileges in schema %I revoke all on functions from %I',selected_schema,role_name);
    end if;
  end loop;
  for table_name in select tablename from pg_tables where schemaname=selected_schema loop
    execute format('alter table %I.%I enable row level security',selected_schema,table_name);
  end loop;
end $$;
