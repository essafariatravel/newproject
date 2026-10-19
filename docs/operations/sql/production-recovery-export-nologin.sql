-- CONDITIONAL OPERATOR PROPOSAL, NOT A MIGRATION OR AUTOMATIC RELEASE STEP.
-- Run only after verified project/TLS, private custody and effective-privilege
-- qualification. One atomic statement; the caller may BEGIN / inspect / ROLLBACK.
-- Does not enable LOGIN, set passwords, revoke PUBLIC, or change existing roles.
DO $recovery$
DECLARE
  target_role constant text := 'essafaria_recovery_export';
  target_schema constant text := 'visa_os';
  item record;
BEGIN
  PERFORM pg_catalog.set_config('search_path','pg_catalog',true);
  PERFORM pg_catalog.set_config('lock_timeout','2s',true);
  PERFORM pg_catalog.set_config('statement_timeout','15s',true);
  IF current_user <> session_user OR NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreaterole)
  ) THEN RAISE EXCEPTION 'RECOVERY_OPERATOR_IDENTITY'; END IF;
  IF NOT (current_database()='postgres' OR (
    current_database()='dr_source' AND inet_server_port()=55462
    AND host(inet_server_addr()) IN ('127.0.0.1','::1')
    AND host(inet_client_addr()) IN ('127.0.0.1','::1')
  )) OR to_regnamespace(target_schema) IS NULL
  THEN RAISE EXCEPTION 'RECOVERY_DATABASE_IDENTITY'; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=target_role)
  THEN RAISE EXCEPTION 'RECOVERY_ROLE_COLLISION'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_database d,
      LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
    WHERE d.datname=current_database() AND a.grantee=0 AND a.privilege_type IN ('CREATE','TEMPORARY')
  ) THEN RAISE EXCEPTION 'RECOVERY_PUBLIC_DATABASE_WRITE'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_namespace n,
      LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND a.grantee=0 AND a.privilege_type='CREATE'
  ) THEN RAISE EXCEPTION 'RECOVERY_PUBLIC_SCHEMA_WRITE'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
      LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE n.nspname='pg_catalog' AND p.proname IN ('lo_create','lo_creat','lo_from_bytea','lo_import')
      AND a.grantee=0 AND a.privilege_type='EXECUTE'
  ) THEN RAISE EXCEPTION 'RECOVERY_PUBLIC_LARGE_OBJECT_WRITE'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
      LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prosecdef
      AND a.grantee=0 AND a.privilege_type='EXECUTE'
      AND EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) u
        WHERE u.grantee=0 AND u.privilege_type='USAGE')
  ) THEN RAISE EXCEPTION 'RECOVERY_PUBLIC_CALLABLE_DEFINER'; END IF;
  IF EXISTS(SELECT 1 FROM pg_largeobject_metadata) OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=target_schema AND (c.relkind='f' OR (
      c.relrowsecurity AND EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND NOT p.polpermissive)
    ))
  ) THEN RAISE EXCEPTION 'RECOVERY_EXTERNAL_OR_RESTRICTIVE_RLS'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_depend d
    CROSS JOIN LATERAL pg_identify_object(d.classid,d.objid,d.objsubid) owned
    CROSS JOIN LATERAL pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) referenced
    WHERE owned.schema=target_schema AND referenced.schema IS NOT NULL
      AND referenced.schema NOT IN (target_schema,'pg_catalog','information_schema')
      AND NOT EXISTS(SELECT 1 FROM pg_depend e WHERE e.classid=d.refclassid AND e.objid=d.refobjid AND e.deptype='e')
  ) THEN RAISE EXCEPTION 'RECOVERY_EXTERNAL_DEPENDENCY'; END IF;

  EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',target_role);
  EXECUTE format('ALTER ROLE %I SET default_transaction_read_only=on',target_role);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),target_role);
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I',target_schema,target_role);
  FOR item IN SELECT c.relname,c.relkind,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=target_schema AND c.relkind IN ('r','p','v','m','S') ORDER BY c.relname
  LOOP
    IF item.relkind='S' THEN
      EXECUTE format('GRANT SELECT ON SEQUENCE %I.%I TO %I',target_schema,item.relname,target_role);
    ELSE
      EXECUTE format('GRANT SELECT ON TABLE %I.%I TO %I',target_schema,item.relname,target_role);
      IF item.relrowsecurity THEN
        EXECUTE format('CREATE POLICY essafaria_recovery_export_read ON %I.%I FOR SELECT TO %I USING (true)',target_schema,item.relname,target_role);
      END IF;
    END IF;
  END LOOP;
  -- These checks run before the atomic statement can commit. New-role effective
  -- privileges include PUBLIC, without changing or granting any application role.
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND CASE WHEN c.relkind IN ('r','p','v','m','f') THEN
      (has_table_privilege(target_role,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(target_role,c.oid,'INSERT,UPDATE,REFERENCES')
        OR (n.nspname<>target_schema AND has_schema_privilege(target_role,n.oid,'USAGE') AND has_table_privilege(target_role,c.oid,'SELECT'))) ELSE false END
  ) OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND CASE WHEN c.relkind='S' THEN has_sequence_privilege(target_role,c.oid,'USAGE,UPDATE') ELSE false END
  ) THEN RAISE EXCEPTION 'RECOVERY_EFFECTIVE_PRIVILEGES_UNSAFE'; END IF;
END
$recovery$;
