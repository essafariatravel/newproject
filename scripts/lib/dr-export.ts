import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import {Readable} from 'node:stream';
import {assertLocalHttpOrigin} from '../../perf/local-safety.js';
import type {StorageProvider} from '../../src/lib/storage';
import type { PoolClient } from "pg";
import { authenticatedArchiveStream, encryptStreamAes256Gcm, verifyEncryptedFileAes256Gcm } from "./dr-backup";

export interface RecoverySnapshot {
  version: 1;
  schema: string;
  tables: Record<string, { rows: number; bytes: number; sha256: string }>;
  sequences: Record<string, { lastValue: string; isCalled: boolean }>;
  catalogSha256: string;
  catalogObjects: Record<string, string>;
  extensions: Array<{ name: string; schema: string; version: string }>;
  roles: Array<{ name: string; superuser: boolean; createRole: boolean; createDatabase: boolean; replication: boolean; bypassRls: boolean;inherit:boolean;canLogin:boolean;configuration:string[]|null }>;
  memberships:Array<{role:string;member:string;admin:boolean;inherit:boolean;setRole:boolean}>;
}

function identifier(value: string): string {
  if (!value || value.includes("\0")) throw new Error("Invalid recovery identifier.");
  return '"' + value.replaceAll('"', '""') + '"';
}

/** Read-only qualification; never fixes a source setting or privilege. */
export async function qualifyRecoveryExportSession(client: PoolClient, expected: {
  database: string; role: string; schema: string; requireTls: boolean;
}): Promise<{ database: string; role: string; schema: string; readOnly: true; tlsVerified: boolean }> {
  const row = (await client.query(`select current_database() as database,current_user as role,session_user as session_role,
    current_setting('default_transaction_read_only') as default_read_only,current_setting('transaction_read_only') as read_only,
    to_regnamespace($1) is not null as schema_present,(select ssl from pg_stat_ssl where pid=pg_backend_pid()) as tls,
    r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,r.rolinherit,r.rolconfig
    from pg_roles r where rolname=current_user`, [expected.schema])).rows[0];
  if (!row || row.database !== expected.database || row.role !== expected.role || row.session_role !== expected.role || !row.schema_present) throw new Error("EXPORT_IDENTITY_MISMATCH");
  if (row.default_read_only !== "on" || row.read_only !== "on" || !row.rolconfig?.includes("default_transaction_read_only=on")) throw new Error("EXPORT_READ_ONLY_NOT_EFFECTIVE");
  if ([row.rolsuper,row.rolcreaterole,row.rolcreatedb,row.rolreplication,row.rolbypassrls,row.rolinherit].some(Boolean)) throw new Error("EXPORT_ROLE_NOT_RESTRICTED");
  const stream = (client as unknown as { connection?: { stream?: { authorized?: boolean } } }).connection?.stream;
  if (expected.requireTls && (row.tls !== true || stream?.authorized !== true)) throw new Error("EXPORT_TLS_NOT_VERIFIED");
  const hazards = (await client.query(`select
    exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname=current_user) as membership,
    has_database_privilege(current_database(),'CREATE') or has_database_privilege(current_database(),'TEMP') as database_write,
    has_function_privilege('pg_catalog.lo_create(oid)','EXECUTE') or has_function_privilege('pg_catalog.lo_creat(integer)','EXECUTE')
      or has_function_privilege('pg_catalog.lo_from_bytea(oid,bytea)','EXECUTE') as large_object_create,
    exists(select 1 from pg_namespace n where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and has_schema_privilege(n.oid,'CREATE')) as schema_write,
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_' and n.nspname<>'information_schema'
      and c.relkind in ('r','p','v','m','f') and (pg_get_userbyid(c.relowner)=current_user or has_table_privilege(c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) as relation_write,
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_' and case when c.relkind='S' then has_sequence_privilege(c.oid,'USAGE,UPDATE') else false end) as sequence_write,
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname !~ '^pg_' and n.nspname<>'information_schema'
      and p.prosecdef and has_schema_privilege(n.oid,'USAGE') and has_function_privilege(p.oid,'EXECUTE')) as callable_definer,
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_' and n.nspname not in ('information_schema',$1)
      and c.relkind in ('r','p','v','m','f') and has_schema_privilege(n.oid,'USAGE') and has_table_privilege(c.oid,'SELECT')) as external_read,
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relkind in ('r','p') and
      (not has_table_privilege(c.oid,'SELECT') or (c.relrowsecurity and (
        exists(select 1 from pg_policy p where p.polrelid=c.oid and not p.polpermissive)
        or not exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polpermissive and p.polcmd in ('r','*')
          and (select oid from pg_roles where rolname=current_user)=any(p.polroles) and pg_get_expr(p.polqual,p.polrelid)='true'))))) as incomplete_table_visibility`, [expected.schema])).rows[0];
  if (Object.values(hazards).some(value => value !== false)) throw new Error("EXPORT_EFFECTIVE_PRIVILEGES_OR_RLS_UNSAFE: " + Object.entries(hazards).filter(([, value]) => value !== false).map(([name]) => name).join(","));
  return { database: expected.database, role: expected.role, schema: expected.schema, readOnly: true, tlsVerified: expected.requireTls };
}

/** Catalog and row digests come from the caller's stable read-only snapshot.
 * Only aggregate counts/bytes/hashes leave PostgreSQL, never individual rows.
 * Sequences are non-MVCC: compare again after dumping and reject any movement.
 */
export async function captureRecoverySnapshot(client: PoolClient, schema: string): Promise<RecoverySnapshot> {
  await client.query("set search_path=pg_catalog; set timezone='UTC'; set datestyle='ISO, YMD'; set extra_float_digits=3; set bytea_output='hex'");
  const unsupported = (await client.query(`select exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relkind='f') as foreign_tables,
    exists(select 1 from pg_largeobject_metadata) as large_objects`, [schema])).rows[0];
  if (unsupported.foreign_tables || unsupported.large_objects) throw new Error("EXPORT_EXTERNAL_OBJECT_COVERAGE_REQUIRED");
  const dependencies = (await client.query(`select distinct referenced.schema as schema,referenced.type as type
    from pg_depend d
    cross join lateral pg_identify_object(d.classid,d.objid,d.objsubid) owned
    cross join lateral pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) referenced
    where owned.schema=$1 and referenced.schema is not null and referenced.schema not in ($1,'pg_catalog','information_schema')
    and not exists(select 1 from pg_depend e where e.classid=d.refclassid and e.objid=d.refobjid and e.deptype='e')`, [schema])).rows;
  if (dependencies.length) throw new Error("EXPORT_EXTERNAL_DEPENDENCY_UNCOVERED");
  const tableNames = (await client.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=$1 and c.relkind in ('r','p','m') order by c.relname collate "C"`, [schema])).rows;
  const tables: RecoverySnapshot["tables"] = {};
  for (const { relname } of tableNames) {
    const result = (await client.query(`select count(*)::text as rows,coalesce(sum(bytes),0)::text as bytes,
      encode(sha256(convert_to(coalesce(string_agg(hash,E'\\n' order by hash collate "C"),''),'UTF8')),'hex') as sha256
      from (select encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex') as hash,octet_length(row_to_json(t)::text) as bytes
        from ${identifier(schema)}.${identifier(relname)} t) hashed`)).rows[0];
    const rows = Number(result.rows), bytes = Number(result.bytes);
    if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(bytes)) throw new Error("EXPORT_VOLUME_EXCEEDS_SAFE_INTEGER");
    tables[relname] = { rows, bytes, sha256: result.sha256 };
  }
  const sequences: RecoverySnapshot["sequences"] = {};
  const names = (await client.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relkind='S' order by c.relname collate \"C\"", [schema])).rows;
  for (const { relname } of names) {
    const value = (await client.query(`select last_value::text as value,is_called from ${identifier(schema)}.${identifier(relname)}`)).rows[0];
    sequences[relname] = { lastValue: value.value, isCalled: value.is_called };
  }
  const catalog = (await client.query(`
    select kind,identity,definition from (
      select 'schema' kind,n.nspname identity,jsonb_build_array(pg_get_userbyid(n.nspowner),(select jsonb_agg(x::text order by x::text) from unnest(n.nspacl) x)) definition from pg_namespace n where n.nspname=$1
      union all select 'relation',c.relname,jsonb_build_array(c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relreplident,c.reloptions,pg_get_expr(c.relpartbound,c.oid),case when c.relkind='p' then pg_get_partkeydef(c.oid) else null end,pg_get_userbyid(c.relowner),
        (select jsonb_agg(a::text order by a::text) from unnest(c.relacl) a),case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,false) else null end)
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1
      union all select 'column',c.relname||'.'||a.attname,jsonb_build_array(a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid),
        (select jsonb_agg(x::text order by x::text) from unnest(a.attacl) x)) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
        left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname=$1 and a.attnum>0 and not a.attisdropped
      union all select 'constraint',c.relname||'.'||k.conname,to_jsonb(pg_get_constraintdef(k.oid,false)) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1
      union all select 'index',c.relname,to_jsonb(pg_get_indexdef(c.oid)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relkind in ('i','I')
      union all select 'function',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_array(pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),
        (select jsonb_agg(a::text order by a::text) from unnest(p.proacl) a)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.prokind in ('f','p')
      union all select 'triggers',entry.relname,jsonb_agg(entry.definition order by entry.definition::text collate "C") from (
        select c.relname,jsonb_build_array(
          case when not t.tgisinternal then pg_get_triggerdef(t.oid,false) else null end,
          t.tgenabled,t.tgisinternal,t.tgtype,t.tgattr::text,t.tgnargs,encode(t.tgargs,'hex'),
          t.tgdeferrable,t.tginitdeferred,pg_get_expr(t.tgqual,t.tgrelid),t.tgoldtable,t.tgnewtable,
          pn.nspname,p.proname,pg_get_function_identity_arguments(p.oid),k.conname,rn.nspname,r.relname) definition
        from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
        join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
        left join pg_constraint k on k.oid=t.tgconstraint
        left join pg_class r on r.oid=t.tgconstrrelid left join pg_namespace rn on rn.oid=r.relnamespace
        where n.nspname=$1
      ) entry group by entry.relname
      union all select 'policy',c.relname||'.'||p.polname,jsonb_build_array(p.polcmd,p.polpermissive,
        (select jsonb_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end order by case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end) from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))
        from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1
      union all select 'sequence',c.relname,jsonb_build_array(format_type(s.seqtypid,null),s.seqstart::text,s.seqincrement::text,s.seqmax::text,s.seqmin::text,s.seqcache::text,s.seqcycle)
        from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1
      union all select 'type',t.typname,jsonb_build_array(t.typtype,t.typcategory,pg_get_userbyid(t.typowner),t.typnotnull,format_type(t.typbasetype,t.typtypmod),t.typdefault,
        (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid)) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname=$1
      union all select 'default_acl',pg_get_userbyid(a.defaclrole)||':'||a.defaclobjtype::text,
        (select jsonb_agg(x::text order by x::text) from unnest(a.defaclacl) x) from pg_default_acl a join pg_namespace n on n.oid=a.defaclnamespace where n.nspname=$1
      union all select 'source_database_acl','CURRENT_DATABASE',jsonb_build_array(pg_get_userbyid(d.datdba),
        (select jsonb_agg(a::text order by a::text) from unnest(coalesce(d.datacl,acldefault('d',d.datdba))) a)) from pg_database d where d.datname=current_database()
      union all select 'core_function_acl',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_array(pg_get_userbyid(p.proowner),
        (select jsonb_agg(a::text order by a::text) from unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a))
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='pg_catalog' and p.proname in ('lo_create','lo_creat','lo_from_bytea')
    ) definitions order by kind collate "C",identity collate "C"`, [schema])).rows;
  const extensions = (await client.query("select e.extname as name,n.nspname as schema,e.extversion as version from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by e.extname collate \"C\"")).rows;
  const roles = (await client.query(`select rolname as name,rolsuper as superuser,rolcreaterole as "createRole",rolcreatedb as "createDatabase",rolreplication as replication,rolbypassrls as "bypassRls",rolinherit as inherit,rolcanlogin as "canLogin",rolconfig as configuration
    from pg_roles where rolname !~ '^pg_' order by rolname collate "C"`)).rows;
  const memberships=(await client.query(`select pg_get_userbyid(m.roleid) as role,pg_get_userbyid(m.member) as member,m.admin_option as admin,
    coalesce((to_jsonb(m)->>'inherit_option')::boolean,true) as inherit,coalesce((to_jsonb(m)->>'set_option')::boolean,true) as "setRole"
    from pg_auth_members m order by pg_get_userbyid(m.roleid) collate "C",pg_get_userbyid(m.member) collate "C"`)).rows;
  const catalogObjects = Object.fromEntries(catalog.map(row => [row.kind + ":" + row.identity, createHash("sha256").update(JSON.stringify(row.definition)).digest("hex")]));
  return { version: 1, schema, tables, sequences, catalogObjects, catalogSha256: createHash("sha256").update(JSON.stringify(catalogObjects)).digest("hex"), extensions, roles,memberships };
}

export function compareRecoverySnapshots(expected: RecoverySnapshot, observed: RecoverySnapshot): string[] {
  const findings: string[] = [];
  if (expected.version !== 1 || observed.version !== 1 || expected.schema !== observed.schema) findings.push("SNAPSHOT_IDENTITY_MISMATCH");
  if (JSON.stringify(expected.tables) !== JSON.stringify(observed.tables)) findings.push("SNAPSHOT_TABLE_CONTENT_MISMATCH");
  if (JSON.stringify(expected.sequences) !== JSON.stringify(observed.sequences)) findings.push("SNAPSHOT_SEQUENCE_STATE_MISMATCH");
  if (expected.catalogSha256 !== observed.catalogSha256) findings.push("SNAPSHOT_CATALOG_DEFINITION_ACL_RLS_MISMATCH: " + [...new Set([...Object.keys(expected.catalogObjects), ...Object.keys(observed.catalogObjects)])].filter(name => expected.catalogObjects[name] !== observed.catalogObjects[name]).join(","));
  if (JSON.stringify(expected.extensions) !== JSON.stringify(observed.extensions)) findings.push("SNAPSHOT_EXTENSION_MISMATCH");
  if(expected.roles.some(role=>JSON.stringify(role)!==JSON.stringify(observed.roles.find(other=>other.name===role.name))))findings.push('SNAPSHOT_ROLE_ATTRIBUTES_MISMATCH');
  if(JSON.stringify(expected.memberships)!==JSON.stringify(observed.memberships))findings.push('SNAPSHOT_ROLE_MEMBERSHIP_MISMATCH');
  return findings;
}

/** Same exported snapshot and immutable startup settings for the real pg_dump. */
export async function exportEncryptedSnapshot(options: {
  binary: string; prefixArgs?: string[]; schema: string; snapshot: string;
  env: NodeJS.ProcessEnv; output: string; key: Buffer; extensions?:string[];
}): Promise<void> {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(options.schema) || !/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(options.snapshot)) {
    throw new Error("Invalid schema or exported snapshot identity.");
  }
  if(options.extensions?.some(name=>!/^[_a-z][_a-z0-9-]*$/.test(name)))throw new Error("Invalid required extension identity.");
  const child = spawn(options.binary, [
    ...(options.prefixArgs ?? []), "--format=custom", "--enable-row-security", "--strict-names", "--no-password",
    ...(options.extensions??[]).filter(name=>name!=='plpgsql').map(name=>`--extension=${name}`),
    `--schema=${options.schema}`, `--snapshot=${options.snapshot}`,
  ], { shell: false, windowsHide: true, env: { ...options.env, PGOPTIONS: "-c default_transaction_read_only=on -c search_path=pg_catalog" }, stdio: ["ignore", "pipe", "pipe"] });
  child.stderr.resume();
  const completion = new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new Error("pg_dump could not be started.")));
    child.once("close", code => code === 0 ? resolve() : reject(new Error("pg_dump failed; encrypted export was rejected.")));
  });
  // Attach handlers immediately: a fast failed child must not reject unobserved
  // while its stdout stream is still being drained and encrypted.
  const result = await Promise.allSettled([encryptStreamAes256Gcm(child.stdout, options.output, options.key).catch(error => { child.kill(); throw error; }), completion]);
  const failure = result.find(item => item.status === "rejected");
  if (failure?.status === "rejected") {
    child.kill();
    // Only delete a generation created by this invocation. An EEXIST refusal
    // from the encryption stream must preserve the pre-existing evidence.
    if (result[0]?.status === "fulfilled") await rm(options.output, { force: true });
    throw failure.reason;
  }
  await verifyEncryptedFileAes256Gcm(options.output, options.key);
}

/** Parse or restore a verified archive via stdin; no plaintext dump is written. */
export async function readEncryptedArchive(options: {
  binary: string; args: string[]; env: NodeJS.ProcessEnv; artifact: string; key: Buffer;
}): Promise<string> {
  const plaintext = await authenticatedArchiveStream(options.artifact, options.key);
  const child = spawn(options.binary, options.args, { shell: false, windowsHide: true, env: options.env, stdio: ["pipe", "pipe", "pipe"] });
  child.stderr.resume();
  let stdout = "";
  child.stdout.on("data", data => { if (stdout.length < 16 * 1024 * 1024) stdout += String(data); });
  const completion = new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new Error("pg_restore could not be started.")));
    child.once("close", code => code === 0 ? resolve() : reject(new Error("pg_restore failed; discard the isolated restore target.")));
  });
  const result = await Promise.allSettled([pipeline(plaintext, child.stdin), completion]);
  const failure = result.find(item => item.status === "rejected");
  if (failure?.status === "rejected") { child.kill(); throw failure.reason; }
  return stdout;
}

export interface RecoveryObject {key:string;mimeType:string;sizeBytes:number;sha256:string}
function objectInventory(inventory:RecoveryObject[]){
 if(!Array.isArray(inventory)||inventory.length>10000)throw Error('OBJECT_INVENTORY_INVALID');
 const sorted=[...inventory].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
 if(new Set(sorted.map(object=>object.key)).size!==sorted.length||sorted.some(object=>!object.key||object.key.length>1024||!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(object.key)||object.key.split('/').some(part=>part==='.'||part==='..')||!Number.isSafeInteger(object.sizeBytes)||object.sizeBytes<1||object.sizeBytes>2097152||!/^[a-f0-9]{64}$/.test(object.sha256)||!/^[-a-z0-9.+]+\/[-a-z0-9.+]+$/.test(object.mimeType)))throw Error('OBJECT_INVENTORY_INVALID');
 return sorted;
}
function objectMatches(object:RecoveryObject,stored:{data:Buffer;mimeType:string}){
 return stored.data.length===object.sizeBytes&&stored.mimeType===object.mimeType&&createHash('sha256').update(stored.data).digest('hex')===object.sha256;
}
/** Local qualification only. Hosted export still requires separately approved
 * source attribution, custody and a verified private provider binding. */
export async function exportEncryptedObjects(options:{sourceOrigin:string;source:Pick<StorageProvider,'get'>;inventory:RecoveryObject[];output:string;key:Buffer}){
 const origin=assertLocalHttpOrigin(options.sourceOrigin),inventory=objectInventory(options.inventory);
 const inventorySha256=createHash('sha256').update(JSON.stringify(inventory)).digest('hex');
 async function* records(){
  yield Buffer.from(JSON.stringify({kind:'ESSAFARIA_OBJECT_RECOVERY',version:1,origin,inventorySha256})+'\n');
  for(const object of inventory){const stored=await options.source.get(object.key);if(!objectMatches(object,stored))throw Error('SOURCE_OBJECT_CHANGED_OR_MISSING');yield Buffer.from(JSON.stringify({...object,data:stored.data.toString('base64')})+'\n');}
  yield Buffer.from(JSON.stringify({complete:true,count:inventory.length,inventorySha256})+'\n');
 }
 await encryptStreamAes256Gcm(Readable.from(records()),options.output,options.key);
 await verifyEncryptedFileAes256Gcm(options.output,options.key);
 return{objectCount:inventory.length,totalBytes:inventory.reduce((sum,object)=>sum+object.sizeBytes,0),inventorySha256};
}
async function* objectLines(artifact:string,key:Buffer){
 const stream=await authenticatedArchiveStream(artifact,key);let pending='';
 try{
  for await(const chunk of stream){pending+=Buffer.from(chunk).toString('utf8');let newline:number;
   while((newline=pending.indexOf('\n'))>=0){if(newline>3*1024*1024)throw Error('OBJECT_RECORD_TOO_LARGE');yield JSON.parse(pending.slice(0,newline));pending=pending.slice(newline+1);}
   if(pending.length>3*1024*1024)throw Error('OBJECT_RECORD_TOO_LARGE');
  }
  if(pending)throw Error('OBJECT_ARCHIVE_INCOMPLETE');
 }finally{stream.destroy();}
}
/** Authenticate and validate the entire bounded inventory before any target
 * write. Partial restores are resumable; no existing/source object is deleted. */
export async function restoreEncryptedObjects(options:{targetOrigin:string;target:Pick<StorageProvider,'get'|'put'>;inventory:RecoveryObject[];artifact:string;key:Buffer}){
 const targetOrigin=assertLocalHttpOrigin(options.targetOrigin),inventory=objectInventory(options.inventory),inventorySha256=createHash('sha256').update(JSON.stringify(inventory)).digest('hex');
 let index=-1,complete=false;
 for await(const record of objectLines(options.artifact,options.key)){
  if(index===-1){if(record.kind!=='ESSAFARIA_OBJECT_RECOVERY'||record.version!==1||record.inventorySha256!==inventorySha256||(new URL(assertLocalHttpOrigin(record.origin)).port||'80')===(new URL(targetOrigin).port||'80'))throw Error('OBJECT_RECOVERY_TARGET_OR_INVENTORY_MISMATCH');index=0;continue;}
  if(complete)throw Error('OBJECT_ARCHIVE_TRAILING_RECORD');
  if(record.complete===true){if(record.count!==inventory.length||index!==inventory.length||record.inventorySha256!==inventorySha256)throw Error('OBJECT_ARCHIVE_INCOMPLETE');complete=true;continue;}
  const expected=inventory[index];if(!expected||record.key!==expected.key||record.mimeType!==expected.mimeType||record.sizeBytes!==expected.sizeBytes||record.sha256!==expected.sha256||typeof record.data!=='string'||!objectMatches(expected,{data:Buffer.from(record.data,'base64'),mimeType:record.mimeType}))throw Error('OBJECT_RECORD_INTEGRITY_MISMATCH');index++;
 }
 if(!complete)throw Error('OBJECT_ARCHIVE_INCOMPLETE');
 let restored=0,reused=0;
 for await(const record of objectLines(options.artifact,options.key)){
  if(!record.key)continue;
  const expected=inventory.find(object=>object.key===record.key)!;
  let present=false;
  try{const stored=await options.target.get(record.key);if(!objectMatches(expected,stored))throw Error('PREEXISTING_TARGET_OBJECT_CONFLICT');present=true;}
  catch(error){if((error as {code?:string})?.code!=='NOT_FOUND')throw error;}
  if(present){reused++;continue;}
  await options.target.put(record.key,Buffer.from(record.data,'base64'),record.mimeType);
  if(!objectMatches(expected,await options.target.get(record.key)))throw Error('RESTORED_OBJECT_INTEGRITY_MISMATCH');restored++;
 }
 return{verified:inventory.length,restored,reused,inventorySha256};
}
