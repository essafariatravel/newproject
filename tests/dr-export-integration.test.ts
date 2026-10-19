import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { applyMigrations } from "../scripts/lib/migrations";
import { pgEnvironmentFromUrl } from "../scripts/lib/dr-backup";
import { captureRecoverySnapshot, compareRecoverySnapshots, qualifyRecoveryExportSession, exportEncryptedSnapshot, readEncryptedArchive } from "../scripts/lib/dr-export";

// This explicit opt-in uses local server/client tools only. It is independent
// of the normal test cluster and must never inherit application/cloud URLs.
const bin = process.env.DR_LOCAL_PG_BIN;
it.skipIf(!bin)("restores a restricted encrypted real 0019 archive and detects row/ACL/sequence loss beyond critical tables", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-export-real-")), port = 55462;
  const data = path.join(root, "pgdata"), targetData=path.join(root,'target-pgdata'), baseline = path.join(root, "baseline"), encrypted = path.join(root, "archive.enc");
  const env = pgEnvironmentFromUrl(`postgresql://postgres@127.0.0.1:${port}/postgres`);
  const command = (name: string, args: string[]) => {
    const result = spawnSync(path.join(bin!, name + (process.platform === "win32" ? ".exe" : "")), args, { env, shell: false, windowsHide: true, stdio: name === "pg_ctl" ? "ignore" : "pipe" });
    if (result.status !== 0) throw new Error(`LOCAL_${name}_FAILED`);
  };
  const url = (db: string, user = "postgres") => `postgresql://${user}@127.0.0.1:${port}/${db}`;
  const admin = new Pool({ connectionString: url("postgres"), max: 1 });
  const source = new Pool({ connectionString: url("dr_source"), max: 1 });
  const targetUrl=(db:string,user='postgres')=>`postgresql://${user}@127.0.0.1:55463/${db}`;
  const targetAdmin=new Pool({connectionString:targetUrl('postgres'),max:1});
  const target = new Pool({ connectionString: targetUrl("dr_target"), max: 1 });
  const targetReader=new Pool({connectionString:targetUrl('dr_target','recovery_export_fixture'),max:1});
  const restricted = new Pool({ connectionString: url("dr_source", "recovery_export_fixture"), max: 1 });
  let started = false,targetStarted=false;
  try {
    await mkdir(baseline);
    for (const name of (await readdir("migrations")).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort().slice(0, 19)) await copyFile(path.join("migrations", name), path.join(baseline, name));
    command("initdb", ["--pgdata", data, "--username=postgres", "--auth=trust", "--encoding=UTF8", "--no-locale"]);
    // Distribution builds may default Unix sockets to a postgres-owned directory.
    // These disposable fixtures use only loopback TCP on their dedicated ports.
    command("pg_ctl", ["--pgdata", data, "--log", path.join(root, "postgres.log"), "--options", `-p ${port} -h 127.0.0.1 -c unix_socket_directories=`, "--wait", "start"]); started = true;
    command('initdb',['--pgdata',targetData,'--username=postgres','--auth=trust','--encoding=UTF8','--no-locale']);
    command('pg_ctl',['--pgdata',targetData,'--log',path.join(root,'target-postgres.log'),'--options','-p 55463 -h 127.0.0.1 -c unix_socket_directories=','--wait','start']);targetStarted=true;
    await admin.query("create role anon nologin; create role authenticated nologin; grant anon to authenticated");
    await admin.query("create database dr_source");
    await targetAdmin.query("create role anon nologin; create role authenticated nologin; grant anon to authenticated; create role recovery_export_fixture login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;alter role recovery_export_fixture set default_transaction_read_only=on");
    await targetAdmin.query("create database dr_target");
    await applyMigrations(source, baseline, "visa_os");
    await source.query(`
      create table visa_os.recovery_auxiliary(id integer primary key, payload bytea not null);
      insert into visa_os.recovery_auxiliary values(1,decode('000102ff','hex'));
      create sequence visa_os.recovery_auxiliary_seq start 7;
      select nextval('visa_os.recovery_auxiliary_seq');
      create function visa_os.recovery_auxiliary_identity(integer) returns integer language sql immutable as 'select $1';
      create function visa_os.recovery_history_guard() returns trigger language plpgsql as 'begin raise exception ''fixture history is immutable''; end';
      create trigger recovery_history_immutable before update or delete on visa_os.audit_logs for each row execute function visa_os.recovery_history_guard();
      alter table visa_os.recovery_auxiliary enable row level security;
      create role recovery_export_fixture login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
      alter role recovery_export_fixture set default_transaction_read_only=on;
      revoke temporary on database dr_source from public;
      grant connect on database dr_source to recovery_export_fixture;
      grant usage on schema visa_os to recovery_export_fixture;
      grant select on all tables in schema visa_os to recovery_export_fixture;
      grant select on all sequences in schema visa_os to recovery_export_fixture;
    `);
    const protectedTables = (await source.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='visa_os' and c.relkind='r' and c.relrowsecurity")).rows;
    for (const row of protectedTables) await source.query(`create policy recovery_export_read on visa_os."${row.relname}" for select to recovery_export_fixture using(true)`);
    const controller = await restricted.connect();
    let original;
    const key = randomBytes(32);
    try {
      await expect(qualifyRecoveryExportSession(controller, { database: "wrong", role: "recovery_export_fixture", schema: "visa_os", requireTls: false })).rejects.toThrow("IDENTITY");
      await source.query('grant update(payload) on visa_os.recovery_auxiliary to public');
      expect((await controller.query("select has_table_privilege('visa_os.recovery_auxiliary','UPDATE') table_write,has_column_privilege('visa_os.recovery_auxiliary','payload','UPDATE') column_write")).rows[0]).toEqual({table_write:false,column_write:true});
      await expect(qualifyRecoveryExportSession(controller, { database: "dr_source", role: "recovery_export_fixture", schema: "visa_os", requireTls: false })).rejects.toThrow('relation_write');
      await source.query('revoke update(payload) on visa_os.recovery_auxiliary from public');
      // Table grants alone do not rule out persistent writes through core LO APIs.
      await controller.query('set default_transaction_read_only=off');
      const object=(await controller.query("select pg_catalog.lo_from_bytea(0,decode('001122','hex')) oid")).rows[0].oid;
      expect((await controller.query('select octet_length(pg_catalog.lo_get($1)) bytes',[object])).rows[0].bytes).toBe(3);
      await controller.query('select pg_catalog.lo_unlink($1)',[object]);
      await controller.query('set default_transaction_read_only=on');
      await expect(qualifyRecoveryExportSession(controller, { database: "dr_source", role: "recovery_export_fixture", schema: "visa_os", requireTls: false })).rejects.toThrow('large_object_create');
      await source.query('revoke execute on function pg_catalog.lo_create(oid),pg_catalog.lo_creat(integer),pg_catalog.lo_from_bytea(oid,bytea) from public');
      // Do not invoke server-file APIs: the EXECUTE capability alone must block.
      await source.query('grant execute on function pg_catalog.lo_import(text),pg_catalog.lo_import(text,oid) to recovery_export_fixture');
      await expect(qualifyRecoveryExportSession(controller, { database: "dr_source", role: "recovery_export_fixture", schema: "visa_os", requireTls: false })).rejects.toThrow('large_object_create');
      await source.query('revoke execute on function pg_catalog.lo_import(text),pg_catalog.lo_import(text,oid) from recovery_export_fixture');
      await qualifyRecoveryExportSession(controller, { database: "dr_source", role: "recovery_export_fixture", schema: "visa_os", requireTls: false });
      await expect(qualifyRecoveryExportSession(controller,{database:'dr_source',role:'recovery_export_fixture',schema:'visa_os',requireTls:true})).rejects.toThrow('TLS');
      await expect(controller.query("delete from visa_os.recovery_auxiliary")).rejects.toMatchObject({ code: "25006" });
      await controller.query("set default_transaction_read_only=off");
      await expect(controller.query("delete from visa_os.recovery_auxiliary")).rejects.toMatchObject({ code: "42501" });
      await expect(qualifyRecoveryExportSession(controller, { database: "dr_source", role: "recovery_export_fixture", schema: "visa_os", requireTls: false })).rejects.toThrow("READ_ONLY");
      await controller.query("set default_transaction_read_only=on");
      await controller.query("begin isolation level repeatable read read only");
      original = await captureRecoverySnapshot(controller, "visa_os");
      expect(original.tables.recovery_auxiliary).toMatchObject({ rows: 1 });
      expect(Object.keys(original.tables).length).toBeGreaterThan(30);
      const snapshot = (await controller.query("select pg_export_snapshot() snapshot")).rows[0].snapshot;
      await exportEncryptedSnapshot({ binary: path.join(bin!, "pg_dump" + (process.platform === "win32" ? ".exe" : "")), schema: "visa_os", snapshot, extensions:original.extensions.map(e=>e.name), env: pgEnvironmentFromUrl(url("dr_source", "recovery_export_fixture")), output: encrypted, key });
      expect(compareRecoverySnapshots(original, await captureRecoverySnapshot(controller, "visa_os"))).toEqual([]);
      await controller.query("rollback");
    } finally { await controller.query("rollback"); controller.release(); }
    const restoreBin = path.join(bin!, "pg_restore" + (process.platform === "win32" ? ".exe" : ""));
    expect(await readEncryptedArchive({ binary: restoreBin, args: ["--list"], env, artifact: encrypted, key })).toContain("recovery_auxiliary");
    await readEncryptedArchive({ binary: restoreBin, args: ["--exit-on-error", "--single-transaction", "--no-password", "--dbname=dr_target"], env: pgEnvironmentFromUrl(targetUrl("dr_target")), artifact: encrypted, key });
    expect((await targetReader.query('select count(*)::int n from visa_os.recovery_auxiliary')).rows[0].n).toBe(1);
    await expect(targetReader.query('delete from visa_os.recovery_auxiliary')).rejects.toMatchObject({code:'25006'});
    await targetReader.query('set default_transaction_read_only=off');
    await expect(targetReader.query('delete from visa_os.recovery_auxiliary')).rejects.toMatchObject({code:'42501'});
    await targetReader.query('set default_transaction_read_only=on');
    expect((await target.query("select has_table_privilege('anon','visa_os.recovery_auxiliary','SELECT') allowed")).rows[0].allowed).toBe(false);
    const restored = await target.connect();
    try {
      await restored.query("begin isolation level repeatable read read only");
      const defaultTarget=compareRecoverySnapshots(original!,await captureRecoverySnapshot(restored,'visa_os'));
      expect(defaultTarget.some(finding=>finding.includes('source_database_acl'))).toBe(true);
      expect(defaultTarget.some(finding=>finding.includes('core_function_acl'))).toBe(true);
      await restored.query('rollback');
      // Bootstrap only this disposable target; never mutate shared PUBLIC grants.
      await restored.query('revoke temporary on database dr_target from public;grant connect on database dr_target to recovery_export_fixture');
      await restored.query('revoke execute on function pg_catalog.lo_create(oid),pg_catalog.lo_creat(integer),pg_catalog.lo_from_bytea(oid,bytea) from public');
      await restored.query("begin isolation level repeatable read read only");
      expect(compareRecoverySnapshots(original!, await captureRecoverySnapshot(restored, "visa_os"))).toEqual([]);
      await restored.query('rollback');
      await restored.query('grant execute on function pg_catalog.lo_import(text),pg_catalog.lo_import(text,oid) to recovery_export_fixture');
      expect(compareRecoverySnapshots(original!,await captureRecoverySnapshot(restored,'visa_os')).join(' ')).toContain('core_function_acl');
      await restored.query('revoke execute on function pg_catalog.lo_import(text),pg_catalog.lo_import(text,oid) from recovery_export_fixture');
      await targetAdmin.query('revoke anon from authenticated');
      expect(compareRecoverySnapshots(original!,await captureRecoverySnapshot(restored,'visa_os')).join(' ')).toContain('ROLE_MEMBERSHIP');
      await targetAdmin.query('grant anon to authenticated');
      await restored.query("rollback");
      for (const mode of ['disable', 'enable replica', 'enable always']) {
        await restored.query(`alter table visa_os.audit_logs ${mode} trigger recovery_history_immutable`);
        expect(compareRecoverySnapshots(original!, await captureRecoverySnapshot(restored, "visa_os")).join(" ")).toContain("trigger");
      }
      await restored.query('alter table visa_os.audit_logs enable trigger recovery_history_immutable');
      const internal = (await restored.query("select tgname from pg_trigger where tgrelid='visa_os.wallet_transactions'::regclass and tgisinternal order by tgname limit 1")).rows[0];
      expect(internal).toBeDefined();
      const internalName = '"' + String(internal.tgname).replaceAll('"', '""') + '"';
      await restored.query('alter table visa_os.wallet_transactions disable trigger ' + internalName);
      expect(compareRecoverySnapshots(original!, await captureRecoverySnapshot(restored, "visa_os")).join(" ")).toContain("trigger");
      await restored.query('alter table visa_os.wallet_transactions enable trigger ' + internalName);
      expect(compareRecoverySnapshots(original!, await captureRecoverySnapshot(restored, "visa_os"))).toEqual([]);
      await restored.query("update visa_os.recovery_auxiliary set payload=decode('09090909','hex')");
      expect(compareRecoverySnapshots(original!, await captureRecoverySnapshot(restored, "visa_os")).join(" ")).toContain("TABLE_CONTENT");
      await restored.query("update visa_os.recovery_auxiliary set payload=decode('000102ff','hex'); revoke select on visa_os.recovery_auxiliary from recovery_export_fixture");
      expect(compareRecoverySnapshots(original!, await captureRecoverySnapshot(restored, "visa_os")).join(" ")).toContain("CATALOG");
      await restored.query("grant select on visa_os.recovery_auxiliary to recovery_export_fixture; select nextval('visa_os.recovery_auxiliary_seq')");
      expect(compareRecoverySnapshots(original!, await captureRecoverySnapshot(restored, "visa_os")).join(" ")).toContain("SEQUENCE");
      await restored.query('alter role recovery_export_fixture bypassrls');
      expect(compareRecoverySnapshots(original!,await captureRecoverySnapshot(restored,'visa_os')).join(' ')).toContain('ROLE_ATTRIBUTES');
      await restored.query('alter role recovery_export_fixture nobypassrls');
    } finally { await restored.query("rollback"); restored.release(); }
    // Rehearse the exact NOLOGIN proposal on the disposable source, rolling back
    // every role/grant/policy change. It must not repair inherited PUBLIC grants.
    const proposal=await readFile('docs/operations/sql/production-recovery-export-nologin.sql','utf8').catch(()=> 'select 1');
    const operator=await source.connect();
    try {
      await operator.query('begin');
      await operator.query('grant temporary on database dr_source to public');
      await expect(operator.query(proposal)).rejects.toThrow('RECOVERY_PUBLIC_DATABASE_WRITE');
      await operator.query('rollback');
      expect((await operator.query("select count(*)::int n from pg_roles where rolname='essafaria_recovery_export'")).rows[0].n).toBe(0);
      await operator.query('begin');
      await operator.query("create function visa_os.recovery_definer_probe() returns integer language sql security definer as 'select 1'");
      // PUBLIC cannot currently use this schema; the proposed USAGE grant must
      // not turn its PUBLIC EXECUTE into a new callable definer capability.
      await expect(operator.query(proposal)).rejects.toThrow('RECOVERY_EFFECTIVE_CALLABLE_DEFINER');
      await operator.query('rollback');
      await operator.query('begin');
      await operator.query(proposal);
      const role=(await operator.query("select rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolinherit,rolconfig from pg_roles where rolname='essafaria_recovery_export'")).rows[0];
      expect(role).toMatchObject({rolcanlogin:false,rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolbypassrls:false,rolinherit:false,rolconfig:['default_transaction_read_only=on']});
      expect((await operator.query("select has_table_privilege('essafaria_recovery_export','visa_os.recovery_auxiliary','SELECT') readable,has_table_privilege('essafaria_recovery_export','visa_os.recovery_auxiliary','UPDATE') writable")).rows[0]).toEqual({readable:true,writable:false});
      const retire=await readFile('docs/operations/sql/production-recovery-export-retire.sql','utf8').catch(()=> 'select 1');
      await operator.query('alter role essafaria_recovery_export login');
      await operator.query(retire);
      expect((await operator.query("select rolcanlogin from pg_roles where rolname='essafaria_recovery_export'")).rows[0].rolcanlogin).toBe(false);
      expect((await operator.query("select has_table_privilege('essafaria_recovery_export','visa_os.recovery_auxiliary','SELECT') readable")).rows[0].readable).toBe(false);
      expect((await operator.query("select count(*)::int n from pg_policy where polname='essafaria_recovery_export_read'")).rows[0].n).toBe(0);
      await expect(operator.query(proposal)).rejects.toThrow('RECOVERY_ROLE_COLLISION');
      await operator.query('rollback');
      expect((await operator.query("select count(*)::int n from pg_roles where rolname='essafaria_recovery_export'")).rows[0].n).toBe(0);
    } finally { await operator.query('rollback');operator.release(); }
    // Unknown external dependencies must block a schema-only backup.
    await source.query("create schema external_fixture; create table external_fixture.parent(id int primary key); create table visa_os.external_child(id int references external_fixture.parent)");
    const external = await source.connect();
    try { await expect(captureRecoverySnapshot(external, "visa_os")).rejects.toThrow("EXTERNAL_DEPENDENCY"); }
    finally { external.release(); }
    key.fill(0);
  } finally {
    await Promise.all([admin.end(),targetAdmin.end(), source.end(), target.end(),targetReader.end(), restricted.end()]);
    if(targetStarted)command('pg_ctl',['--pgdata',targetData,'--wait','stop','--mode=fast']);
    if (started) command("pg_ctl", ["--pgdata", data, "--wait", "stop", "--mode=fast"]);
    if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('dr-export-real-'))throw new Error('LOCAL_RETIREMENT_PATH_UNSAFE');
    // Windows may briefly retain filesystem handles after pg_ctl --wait.
    // Match the existing local drill's bounded retries; persistent failure still fails.
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}, 120_000);
