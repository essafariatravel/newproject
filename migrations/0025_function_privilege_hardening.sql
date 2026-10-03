-- 0025 — function privilege/search_path hardening
--
-- Supabase/PostgreSQL grants EXECUTE on newly created functions to PUBLIC by
-- default. Migration 0024 removed schema/table/sequence/function grants from
-- anon/authenticated and enabled RLS, but PUBLIC function EXECUTE can still
-- remain visible in catalog privilege checks. The application never needs
-- direct PostgREST/RPC access to its database functions: all access is through
-- the server-side PostgreSQL role.
--
-- This migration therefore:
--   1) pins every application-schema function search_path to pg_catalog + the
--      selected application schema, preventing ambient search_path influence;
--   2) revokes function EXECUTE from PUBLIC, anon and authenticated;
--   3) changes default privileges so future functions do not re-open RPC access.
--
-- It is schema-local and forward-only. No Production/global/public-schema
-- objects are modified.
--
-- The same migration also indexes the age column used by the bounded
-- authentication-rate-limit cleanup. This does not alter any identity data.

create index if not exists auth_rate_limits_window_start_idx
  on auth_rate_limits(window_start);

do $
declare
  selected_schema text := current_schema();
  fn record;
  role_name text;
begin
  if selected_schema is null then
    raise exception 'Select an application schema before applying function hardening';
  end if;

  for fn in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = selected_schema
  loop
    execute format(
      'alter function %I.%I(%s) set search_path to pg_catalog, %I',
      selected_schema,
      fn.proname,
      fn.args,
      selected_schema
    );
  end loop;

  execute format('revoke all on all functions in schema %I from public', selected_schema);
  execute format('alter default privileges in schema %I revoke execute on functions from public', selected_schema);

  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on all functions in schema %I from %I', selected_schema, role_name);
      execute format(
        'alter default privileges in schema %I revoke execute on functions from %I',
        selected_schema,
        role_name
      );
    end if;
  end loop;
end $$;
