-- Only retire the operation-attributed dedicated export role after closing its
-- owned connections. No role drop, PUBLIC revoke or session termination.
DO $recovery$
DECLARE
  target_role constant text := 'essafaria_recovery_export';
  target_schema constant text := 'visa_os';
  target_oid oid;
  item record;
BEGIN
  PERFORM pg_catalog.set_config('search_path','pg_catalog',true);
  PERFORM pg_catalog.set_config('lock_timeout','2s',true);
  IF current_user<>session_user OR NOT (current_database()='postgres' OR (
    current_database()='dr_source' AND inet_server_port()=55462
    AND host(inet_server_addr()) IN ('127.0.0.1','::1') AND host(inet_client_addr()) IN ('127.0.0.1','::1')
  )) OR to_regnamespace(target_schema) IS NULL THEN RAISE EXCEPTION 'RECOVERY_RETIRE_IDENTITY'; END IF;
  SELECT oid INTO target_oid FROM pg_roles WHERE rolname=target_role
    AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
    AND 'default_transaction_read_only=on'=ANY(rolconfig);
  IF target_oid IS NULL OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=target_oid OR roleid=target_oid)
    OR EXISTS(SELECT 1 FROM pg_class WHERE relowner=target_oid)
    OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=target_oid)
  THEN RAISE EXCEPTION 'RECOVERY_RETIRE_ROLE_SCOPE_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=target_role)
  THEN RAISE EXCEPTION 'RECOVERY_RETIRE_CLOSE_OWNED_CLIENTS_FIRST'; END IF;
  FOR item IN SELECT n.nspname,c.relname,p.polcmd,p.polroles,p.polpermissive,pg_get_expr(p.polqual,p.polrelid) expression
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE p.polname='essafaria_recovery_export_read'
  LOOP
    IF item.nspname<>target_schema OR item.polcmd<>'r' OR NOT item.polpermissive
      OR item.polroles<>ARRAY[target_oid] OR item.expression<>'true'
    THEN RAISE EXCEPTION 'RECOVERY_RETIRE_POLICY_SCOPE_CHANGED'; END IF;
    EXECUTE format('DROP POLICY essafaria_recovery_export_read ON %I.%I',target_schema,item.relname);
  END LOOP;
  EXECUTE format('ALTER ROLE %I NOLOGIN PASSWORD NULL',target_role);
  EXECUTE format('REVOKE SELECT ON ALL TABLES IN SCHEMA %I FROM %I',target_schema,target_role);
  EXECUTE format('REVOKE SELECT ON ALL SEQUENCES IN SCHEMA %I FROM %I',target_schema,target_role);
  EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM %I',target_schema,target_role);
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM %I',current_database(),target_role);
END
$recovery$;
