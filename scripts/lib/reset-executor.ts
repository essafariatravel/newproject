import { createDecipheriv, createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import { databaseSchema, qualifiedTable } from "../../src/lib/database-schema";
import { isStaffRole } from "../../src/lib/types";
import { dependencyDeleteOrder } from "./reset-plan";
import type { PreviewResetIdentity, VerifiedPreviewResetIdentity } from "./reset-plan";

type Rows = Record<string, Record<string, unknown>[]>;
interface SequenceSnapshot {
  name: string; dataType: string; startValue: string; minValue: string; maxValue: string;
  incrementBy: string; cycle: boolean; cacheSize: string; ownerTable: string | null;
  ownerColumn: string | null; lastValue: string; isCalled: boolean;
}
export interface ResetManifest {
  previewIdentity?: PreviewResetIdentity;
  version: number; target: { database: string; schema: string; host: string; port: number }; archiveSchema: string;
  authorizedBy: string; preservedUserIds: string[]; inventorySha256: string; definitionSha256: string;
  backup: { path: string; sha256: string; algorithm: string; createdAt: string; verifiedRestoreAt: string; restoreSchema: string };
  tableClassifications: Record<string, "PRESERVE_ALL" | "PRESERVE_IDS" | "REMOVE_OPERATIONAL">;
  preservedConfigurationIds?: Record<string, string[]>;
  storage: { provider: string; removeKeys: string[]; preserveKeys: string[] };
  authorization: { purpose: string; archiveImmutableHistory: boolean; recreateOperationalSchema: boolean; configurationReviewed: boolean; exclusiveMaintenance: boolean };
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const operational = new Set(["agencies","users","sessions","session_presence","account_access_tokens","account_activation_tokens","account_recovery_requests","auth_rate_limits","applications","applicants","checklist_items","documents","document_requests","document_blobs","application_status_history","communications","notifications","wallet_transactions","wallet_topup_requests","application_price_adjustments","agency_registrations","agency_registration_documents","agency_registration_history","agency_registration_requests","agency_registration_followup_tokens","audit_logs","legacy_reconciliation_issues","legacy_reconciliation_events"]);
const configuration = new Set(["schema_migrations","site_settings","legal_versions","statuses","status_transitions","document_types","priorities","currencies","countries","visa_categories","visa_types","visa_requirements"]);
const selectableCatalogue = new Set(["countries", "visa_categories", "visa_types", "visa_requirements"]);
const normalize = (text: string, schema: string) => text.replaceAll('"'+schema+'".','').replaceAll(schema+'.','').replaceAll('"'+schema+'"','APP_SCHEMA');

/** Role names and effective ACL entries are portable across isolated restores;
 * PostgreSQL object OIDs and namespace names are deliberately not fingerprints. */
// aclitem's text representation contains role names, granted privileges,
// grant-option markers and grantor names. Unlike aclexplode, unnest also handles
// an explicitly empty ACL (zero-dimensional PostgreSQL array).
const aclDefinition = (expression: string) => `coalesce((select jsonb_agg(entry::text order by entry::text)
  from unnest(${expression}) entry),'[]'::jsonb)::text`;

async function securityInventory(client: PoolClient, schema: string) {
  const rls = (await client.query<{ name: string; enabled: boolean; forced: boolean }>(`
    select c.relname as name,c.relrowsecurity as enabled,c.relforcerowsecurity as forced
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=$1 and c.relkind in ('r','p') order by c.relname`, [schema])).rows;
  const policies = (await client.query<{ kind: string; name: string; definition: string }>(`
    select 'policy' as kind,c.relname||'.'||p.polname as name,jsonb_build_object(
      'command',p.polcmd,'permissive',p.polpermissive,
      'roles',(select jsonb_agg(case when role_id=0 then 'PUBLIC' else pg_get_userbyid(role_id) end
        order by case when role_id=0 then 'PUBLIC' else pg_get_userbyid(role_id) end) from unnest(p.polroles) role_id),
      'using',pg_get_expr(p.polqual,p.polrelid),'withCheck',pg_get_expr(p.polwithcheck,p.polrelid))::text as definition
    from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=$1 order by c.relname,p.polname`, [schema])).rows;
  const access = (await client.query<{ kind: string; name: string; definition: string }>(`
    select 'schema-access' as kind,'APP_SCHEMA' as name,
      pg_get_userbyid(n.nspowner)||':'||${aclDefinition("coalesce(n.nspacl,acldefault('n',n.nspowner))")} as definition
      from pg_namespace n where n.nspname=$1
    union all select 'relation-access',c.relname,
      pg_get_userbyid(c.relowner)||':'||c.relkind::text||':'||${aclDefinition("coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::\"char\" else 'r'::\"char\" end,c.relowner))")}
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relkind in ('r','p','S','v','m')
    union all select 'column-access',c.relname||'.'||a.attname,
      ${aclDefinition("coalesce(a.attacl,'{}'::aclitem[])")}
      from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname=$1 and c.relkind in ('r','p','v','m') and a.attnum>0 and not a.attisdropped
    union all select 'function-access',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
      pg_get_userbyid(p.proowner)||':'||${aclDefinition("coalesce(p.proacl,acldefault('f',p.proowner))")}
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1
    union all select 'default-access',pg_get_userbyid(d.defaclrole)||':'||d.defaclobjtype::text,
      ${aclDefinition("d.defaclacl")}
      from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname=$1
    order by kind,name,definition`, [schema])).rows;
  return { rls, policies, definitions: [...rls.map(row => ({ kind: "row-security", name: row.name,
    definition: JSON.stringify({ enabled: row.enabled, forced: row.forced }) })), ...policies, ...access]
    .map(row => ({ ...row, definition: normalize(row.definition, schema) })) };
}

function corePrimitivesPresent(rows: Rows): boolean {
  const requiredStatuses = ["DRAFT", "SUBMITTED", "DOCUMENTS_CHECKING", "DOCUMENTS_REQUESTED", "IN_PROCESS", "EMBASSY_SENT", "APPROVED", "REJECTED", "CANCELLED"];
  const statuses = new Map((rows.statuses ?? []).filter(row => row.active === true).map(row => [String(row.code), row]));
  if (requiredStatuses.some(code => !statuses.has(code))) return false;
  if (statuses.get("DRAFT")?.is_draft !== true || statuses.get("DRAFT")?.is_terminal !== false ||
    ["APPROVED", "REJECTED", "CANCELLED"].some(code => statuses.get(code)?.is_terminal !== true)) return false;
  const requiredTransitions: Array<[string, string, string]> = [
    ["DRAFT", "SUBMITTED", "AGENCY"], ["SUBMITTED", "DOCUMENTS_CHECKING", "STAFF"],
    ["DOCUMENTS_CHECKING", "DOCUMENTS_REQUESTED", "STAFF"], ["DOCUMENTS_REQUESTED", "DOCUMENTS_CHECKING", "STAFF"],
    ["DOCUMENTS_CHECKING", "IN_PROCESS", "STAFF"], ["IN_PROCESS", "EMBASSY_SENT", "STAFF"],
    ["EMBASSY_SENT", "APPROVED", "STAFF"], ["EMBASSY_SENT", "REJECTED", "STAFF"],
    ["IN_PROCESS", "APPROVED", "STAFF"], ["IN_PROCESS", "REJECTED", "STAFF"],
  ];
  if (requiredTransitions.some(([from, to, scope]) => !(rows.status_transitions ?? []).some(row =>
    row.from_status_id === statuses.get(from)?.id && row.to_status_id === statuses.get(to)?.id && [scope, "BOTH"].includes(String(row.scope))))) return false;
  if (["DECISION_VISA_APPROVAL", "DECISION_REFUSAL_LETTER"].some(code => !(rows.document_types ?? []).some(row =>
    row.code === code && row.active === true && row.agency_uploadable === false))) return false;
  return (rows.priorities ?? []).some(row => row.code === "STANDARD" && row.active === true) &&
    (rows.currencies ?? []).some(row => row.code === "DZD" && row.active === true);
}

function selectedRows(manifest: ResetManifest, original: Rows): Rows {
  const selected: Rows = {};
  for (const [name, rows] of Object.entries(original)) {
    if (name === "users") selected[name] = rows.filter(row => manifest.preservedUserIds.includes(String(row.id)));
    else if (name === "document_blobs") selected[name] = rows.filter(row => manifest.storage.preserveKeys.includes(String(row.key)));
    else if (manifest.tableClassifications[name] === "PRESERVE_ALL") selected[name] = rows;
    else if (manifest.tableClassifications[name] === "PRESERVE_IDS") selected[name] = rows.filter(row => manifest.preservedConfigurationIds?.[name]?.includes(String(row.id)));
    else selected[name] = [];
  }
  return selected;
}

/** Definitions and counters are part of an authenticated, restorable archive. */
async function sequenceInventory(client: PoolClient, schema: string): Promise<SequenceSnapshot[]> {
  const definitions = (await client.query<Omit<SequenceSnapshot, "lastValue" | "isCalled">>(`
    select s.sequencename as name,s.data_type::text as "dataType",s.start_value::text as "startValue",
      s.min_value::text as "minValue",s.max_value::text as "maxValue",s.increment_by::text as "incrementBy",
      s.cycle,s.cache_size::text as "cacheSize",parent.relname as "ownerTable",a.attname as "ownerColumn"
    from pg_sequences s join pg_namespace n on n.nspname=s.schemaname
      join pg_class seq on seq.relnamespace=n.oid and seq.relname=s.sequencename
      left join pg_depend dep on dep.objid=seq.oid and dep.classid='pg_class'::regclass and dep.deptype in ('a','i')
      left join pg_class parent on parent.oid=dep.refobjid and dep.refclassid='pg_class'::regclass
      left join pg_attribute a on a.attrelid=parent.oid and a.attnum=dep.refobjsubid
    where s.schemaname=$1 order by s.sequencename`, [schema])).rows;
  const result: SequenceSnapshot[] = [];
  for (const sequence of definitions) {
    const state = (await client.query<{ lastValue: string; isCalled: boolean }>(
      `select last_value::text as "lastValue",is_called as "isCalled" from ${qualifiedTable(sequence.name, schema)}`)).rows[0]!;
    result.push({ ...sequence, ...state });
  }
  return result;
}

export async function resetInventory(client: PoolClient, schema: string) {
  const tables = (await client.query<{ name: string }>("select table_name as name from information_schema.tables where table_schema=$1 and table_type='BASE TABLE' order by table_name",[schema])).rows.map(row=>row.name);
  if (!tables.includes("schema_migrations")||!tables.includes("users")||!tables.includes("audit_logs")) throw new Error("Unidentified application database.");
  const tableRows: Rows={}, counts: Record<string,number>={};
  for(const name of tables){tableRows[name]=(await client.query<{row:Record<string,unknown>}>(`select to_jsonb(t) row from ${qualifiedTable(name,schema)} t order by to_jsonb(t)::text`)).rows.map(row=>row.row);counts[name]=tableRows[name].length;}
  const edges=(await client.query<{child:string;childSchema:string;parent:string;parentSchema:string;childColumns:string[];parentColumns:string[]}>(`
    select child.relname child,cn.nspname as "childSchema",parent.relname parent,pn.nspname as "parentSchema",
      array(select a.attname::text from unnest(c.conkey) with ordinality k(num,position) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.position) as "childColumns",
      array(select a.attname::text from unnest(c.confkey) with ordinality k(num,position) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.position) as "parentColumns"
    from pg_constraint c join pg_class child on child.oid=c.conrelid join pg_namespace cn on cn.oid=child.relnamespace
      join pg_class parent on parent.oid=c.confrelid join pg_namespace pn on pn.oid=parent.relnamespace
    where c.contype='f' and (cn.nspname=$1 or pn.nspname=$1)
    order by cn.nspname,child.relname,pn.nspname,parent.relname`,[schema])).rows;
  const definitions=(await client.query<{kind:string;name:string;definition:string}>(`
    select 'column' kind,table_name||'.'||column_name name,concat_ws(':',data_type,udt_name,is_nullable,column_default,character_maximum_length::text) definition from information_schema.columns where table_schema=$1
    union all select 'constraint',c.conname,pg_get_constraintdef(c.oid) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname=$1
    union all select 'index',indexname,indexdef from pg_indexes where schemaname=$1
    union all select 'trigger',t.tgname,pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and not t.tgisinternal
    union all select 'function',p.proname,pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1
    order by kind,name,definition`,[schema])).rows.map(row=>({...row,definition:normalize(row.definition,schema)}));
  const sequences = await sequenceInventory(client, schema);
  const security = await securityInventory(client, schema);
  definitions.push(...security.definitions);
  for (const sequence of sequences) {
    definitions.push({ kind: "sequence", name: sequence.name, definition: JSON.stringify({ name: sequence.name, dataType: sequence.dataType,
      startValue: sequence.startValue, minValue: sequence.minValue, maxValue: sequence.maxValue, incrementBy: sequence.incrementBy,
      cycle: sequence.cycle, cacheSize: sequence.cacheSize, ownerTable: sequence.ownerTable, ownerColumn: sequence.ownerColumn }) });
  }
  definitions.sort((a, b) => `${a.kind}:${a.name}:${a.definition}`.localeCompare(`${b.kind}:${b.name}:${b.definition}`));
  return {tables,tableRows,counts,edges,sequences,security,sequenceSha256:digest(sequences),inventorySha256:digest(tableRows),definitionSha256:digest(definitions)};
}

export async function verifiedResetPlan(client:PoolClient,schema:string,manifestPath?:string,preview?:VerifiedPreviewResetIdentity){
  if(schema === "visa_os") throw new Error("Production reset planning is forbidden. Use a disposable local snapshot.");
  const inventory=await resetInventory(client,schema);
  const connection=(await client.query<{database:string;host:string;port:number}>("select current_database() database,host(inet_server_addr()) host,inet_server_port() port")).rows[0]!;
  const target={database:connection.database,schema,host:connection.host,port:connection.port};
  if(preview ? preview.environment!=="preview" || preview.schema!==schema || preview.projectRef!=="xgetzgixalrsmuvfthpf" || schema!=="visa_os_preview"
    : !["127.0.0.1","::1"].includes(connection.host)) throw new Error("Unidentified reset target. No reset committed.");
  if(!manifestPath)return {inventory,target,manifest:null,effects:null,backupStatus:"MISSING",migrations:null,preview};
  const manifest=JSON.parse(await readFile(manifestPath,"utf8")) as ResetManifest;
  let stage="target";
  const fail=(): never=>{throw new Error(`Reset evidence failed verification: ${stage}. No data was changed.`);};
  if(manifest.version!==1||JSON.stringify(manifest.target)!==JSON.stringify(target)||!manifest.archiveSchema||!manifest.backup?.restoreSchema||!uuid.test(manifest.authorizedBy)||!Array.isArray(manifest.preservedUserIds)||!manifest.preservedUserIds.length||!manifest.preservedUserIds.every(id=>uuid.test(id)))fail();
  for(const candidate of [manifest.archiveSchema,manifest.backup.restoreSchema]){databaseSchema({DATABASE_SCHEMA:candidate});if(["public","visa_os",schema].includes(candidate))fail();}
  if(manifest.archiveSchema===manifest.backup.restoreSchema||(await client.query("select to_regnamespace($1) present",[manifest.archiveSchema])).rows[0].present)fail();
  stage="inventory";
  if(manifest.inventorySha256!==inventory.inventorySha256||manifest.definitionSha256!==inventory.definitionSha256||inventory.edges.some(edge=>edge.childSchema!==schema||edge.parentSchema!==schema))fail();
  stage="security-contract";
  // Matching insecure copies are not approval to weaken the server-owned API
  // contract. Every canonical table has RLS and no browser/direct-role policies.
  if (inventory.security.rls.length !== inventory.tables.length || inventory.security.rls.some(row => !row.enabled || row.forced) || inventory.security.policies.length) fail();
  const originalUsers = inventory.tableRows.users;
  if (!originalUsers) throw new Error("Reset evidence failed verification: preservation. No data was changed.");
  const author=originalUsers.find(row=>row.id===manifest.authorizedBy),preserved=originalUsers.filter(row=>manifest.preservedUserIds.includes(String(row.id)));
  stage="preservation";
  if(!author||!manifest.preservedUserIds.includes(manifest.authorizedBy)||author.role!=="SUPER_ADMIN"||author.status!=="ACTIVE"||author.agency_id||author.activation_pending||author.must_change_password||preserved.length!==manifest.preservedUserIds.length||new Set(manifest.preservedUserIds).size!==manifest.preservedUserIds.length||preserved.some(row=>!isStaffRole(String(row.role))||row.agency_id||row.status!=="ACTIVE"||row.activation_pending||row.must_change_password||!/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/i.test(String(row.password_hash)))||!preserved.some(row=>row.role==="SUPER_ADMIN"))fail();
  stage="core-primitives";
  if (!corePrimitivesPresent(inventory.tableRows)) fail();
  const approval=manifest.authorization;
  if(!approval||approval.purpose!==(preview ? "ISOLATED_PREVIEW_GO_LIVE_CLEANUP" : "DISPOSABLE_SYNTHETIC_LOCAL_RESET")||!approval.archiveImmutableHistory||!approval.recreateOperationalSchema||!approval.configurationReviewed||!approval.exclusiveMaintenance)fail();
  if(preview && (!manifest.previewIdentity || (Object.keys(manifest.previewIdentity) as Array<keyof PreviewResetIdentity>).length!==7 ||
    (Object.keys(manifest.previewIdentity) as Array<keyof PreviewResetIdentity>).some(key=>manifest.previewIdentity![key]!==preview[key])))fail();
  stage="classification";
  if(!manifest.tableClassifications||inventory.tables.some(name=>!["PRESERVE_ALL","PRESERVE_IDS","REMOVE_OPERATIONAL"].includes(manifest.tableClassifications[name] ?? ""))||Object.keys(manifest.tableClassifications).some(name=>!inventory.tables.includes(name))||inventory.tables.some(name=>!configuration.has(name)&&!operational.has(name)))fail();
  if(inventory.tables.some(name=>configuration.has(name)&&!selectableCatalogue.has(name)&&manifest.tableClassifications[name]!=="PRESERVE_ALL")||inventory.tables.some(name=>operational.has(name)&&manifest.tableClassifications[name]!=="REMOVE_OPERATIONAL"))fail();
  const selections = manifest.preservedConfigurationIds ?? {};
  if (!selections || typeof selections !== "object" || Array.isArray(selections) || Object.keys(selections).some(name => !selectableCatalogue.has(name) || manifest.tableClassifications[name] !== "PRESERVE_IDS")) fail();
  for (const name of selectableCatalogue) {
    const classification = manifest.tableClassifications[name];
    if (classification !== "PRESERVE_ALL" && classification !== "PRESERVE_IDS") fail();
    if (classification === "PRESERVE_IDS") {
      const ids = selections[name];
      if (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !uuid.test(id)) || new Set(ids).size !== ids.length ||
        ids.some(id => !inventory.tableRows[name]?.some(row => row.id === id))) fail();
    }
  }
  stage="storage";
  const storage=manifest.storage,blobKeys=(inventory.tableRows.document_blobs??[]).map(row=>String(row.key)).sort();
  if(!storage||storage.provider!=="db"||!Array.isArray(storage.removeKeys)||!Array.isArray(storage.preserveKeys)||new Set([...storage.removeKeys,...storage.preserveKeys]).size!==blobKeys.length||digest([...storage.removeKeys,...storage.preserveKeys].sort())!==digest(blobKeys))fail();
  const neededKeys=(inventory.tableRows.site_settings??[]).filter(row=>/logo|asset|image/i.test(String(row.key))).map(row=>String(row.value));
  if(neededKeys.some(key=>blobKeys.includes(key)&&!storage.preserveKeys.includes(key)))fail();
  stage="protected-dependencies";
  const protectedRows = selectedRows(manifest, inventory.tableRows);
  for (const edge of inventory.edges) {
    for (const child of protectedRows[edge.child] ?? []) {
      const keys = edge.childColumns.map(column => child[column]);
      if (keys.some(value => value === null || value === undefined)) continue;
      if (!(protectedRows[edge.parent] ?? []).some(parent => edge.parentColumns.every((column, i) => parent[column] === keys[i]))) fail();
    }
  }
  stage="encrypted-backup";
  if(manifest.backup.algorithm!=="AES-256-GCM"||!process.env.RESET_BACKUP_KEY||!/^[0-9a-f]{64}$/.test(manifest.backup.sha256))fail();
  const created=Date.parse(manifest.backup.createdAt),restored=Date.parse(manifest.backup.verifiedRestoreAt);
  if(!Number.isFinite(created)||!Number.isFinite(restored)||created>restored||restored>Date.now()+60_000||Date.now()-created>86400_000)fail();
  const encrypted=await readFile(manifest.backup.path);
  if(createHash("sha256").update(encrypted).digest("hex")!==manifest.backup.sha256)fail();
  const envelope=JSON.parse(encrypted.toString("utf8"));if(envelope.version!==1||envelope.algorithm!=="AES-256-GCM")fail();
  const key=Buffer.from(process.env.RESET_BACKUP_KEY!,"base64"),iv=Buffer.from(envelope.iv,"base64"),tag=Buffer.from(envelope.tag,"base64");
  if(key.length!==32||iv.length!==12||tag.length!==16)fail();
  const decipher=createDecipheriv("aes-256-gcm",key,iv);decipher.setAuthTag(tag);
  const payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,"base64")),decipher.final()]).toString("utf8"));
  if(payload.version!==1||JSON.stringify(payload.target)!==JSON.stringify(target)||digest(payload.tableRows)!==inventory.inventorySha256||payload.inventorySha256!==inventory.inventorySha256||payload.definitionSha256!==inventory.definitionSha256||!Array.isArray(payload.sequences)||digest(payload.sequences)!==inventory.sequenceSha256)fail();
  stage="isolated-restore";
  const restore=await resetInventory(client,manifest.backup.restoreSchema);if(restore.inventorySha256!==inventory.inventorySha256||restore.definitionSha256!==inventory.definitionSha256||restore.sequenceSha256!==inventory.sequenceSha256)fail();
  const names=(await readdir(path.join(process.cwd(),"migrations"))).filter(name=>name.endsWith(".sql")).sort();
  const migrations=await Promise.all(names.map(async name=>({name,sql:await readFile(path.join(process.cwd(),"migrations",name),"utf8")})));
  stage="migration-contract";
  if(digest(payload.migrations)!==digest(migrations)||digest((inventory.tableRows.schema_migrations??[]).map(row=>row.name).sort())!==digest(names))fail();
  return {inventory,target,manifest,migrations,preview,effects:{archiveImmutableHistory:true,recreateOperationalSchema:true,removeDatabaseBlobs:storage.removeKeys.length,preserveDatabaseBlobs:storage.preserveKeys.length},backupStatus:"BYTES_AUTHENTICATED_RESTORE_VERIFIED"};
}

/** Execution requires a verified local snapshot or the dedicated isolated Preview contract. */
export async function executeVerifiedLocalReset(client:PoolClient,plan:Awaited<ReturnType<typeof verifiedResetPlan>>){
  const {manifest,inventory,target}=plan;if(!manifest||!plan.migrations)throw new Error("A verified backup and approval manifest are required.");
  const schema=target.schema,table=(name:string)=>qualifiedTable(name,schema);
  await client.query("select pg_advisory_xact_lock(hashtext($1))",[schema+":go-live-reset"]);
  for(const name of inventory.tables)await client.query(`lock table ${table(name)} in access exclusive mode`);
  const locked = await resetInventory(client, schema);
  if(locked.inventorySha256!==inventory.inventorySha256||locked.definitionSha256!==inventory.definitionSha256||locked.sequenceSha256!==inventory.sequenceSha256||locked.edges.some(edge=>edge.childSchema!==schema||edge.parentSchema!==schema))throw new Error("Stale inventory; no reset executed.");
  await client.query(`alter schema "${schema}" rename to "${manifest.archiveSchema}"`);await client.query(`create schema "${schema}"`);await client.query(`set local search_path to "${schema}"`);
  await client.query("create table schema_migrations(name text primary key,applied_at timestamptz not null default now())");
  for(const migration of plan.migrations){await client.query(migration.sql);await client.query("insert into schema_migrations(name) values($1)",[migration.name]);}
  const insert=async(name:string,rows:Record<string,unknown>[])=>{if(rows.length)await client.query(`insert into ${table(name)} select * from jsonb_populate_recordset(null::${table(name)},$1::jsonb)`,[JSON.stringify(rows)]);};
  for(const name of configuration)if(inventory.tables.includes(name))await client.query(`truncate ${table(name)} cascade`);
  const originalUsers = inventory.tableRows.users;
  if (!originalUsers) throw new Error("Unknown preserved identity inventory; rollback required.");
  const preservedUsers: Record<string, unknown>[]=originalUsers.filter(row=>manifest.preservedUserIds.includes(String(row.id))).map(row=>({...row,credential_version:Number(row.credential_version??0)+1}));
  await insert("users",preservedUsers);
  const protectedRows = selectedRows(manifest, inventory.tableRows);
  for(const name of dependencyDeleteOrder(inventory.tables,inventory.edges).reverse())if(configuration.has(name)){
    const rows = protectedRows[name];
    if (!rows) throw new Error("Unknown protected configuration inventory; rollback required.");
    await insert(name,rows);
  }
  await insert("document_blobs",(inventory.tableRows.document_blobs??[]).filter(row=>manifest.storage.preserveKeys.includes(String(row.key))));
  for(const state of inventory.sequences)await client.query("select setval($1::regclass,$2::bigint,$3)",[`${schema}.${state.name}`,state.lastValue,state.isCalled]);
  const after=await resetInventory(client,schema),zero=[...operational].filter(name=>!["users","document_blobs","audit_logs"].includes(name)&&after.tables.includes(name));
  if(zero.some(name=>after.counts[name]!==0)||after.counts.users!==preservedUsers.length||after.counts.document_blobs!==manifest.storage.preserveKeys.length||after.definitionSha256!==inventory.definitionSha256||after.sequenceSha256!==inventory.sequenceSha256)throw new Error("Post-reset verification failed; rollback required.");
  for(const name of configuration)if(after.tables.includes(name)&&digest(after.tableRows[name])!==digest(protectedRows[name]))throw new Error("Protected configuration changed; rollback required.");
  const archive = await resetInventory(client, manifest.archiveSchema);
  if(archive.inventorySha256!==inventory.inventorySha256||archive.sequenceSha256!==inventory.sequenceSha256)throw new Error("Immutable archive changed; rollback required.");
  const action=plan.preview?"ISOLATED_PREVIEW_RESET_EXECUTED":"LOCAL_SYNTHETIC_RESET_EXECUTED";
  await client.query(`insert into ${table("audit_logs")}(actor_id,actor_email,actor_role,action,entity,entity_id,metadata) values($1,$2,'SUPER_ADMIN',$5,'system',$3,$4::jsonb)`,[manifest.authorizedBy,preservedUsers.find(row=>row.id===manifest.authorizedBy)?.email,schema,JSON.stringify({archiveSchema:manifest.archiveSchema,inventorySha256:inventory.inventorySha256,preservedUserIds:manifest.preservedUserIds,previewIdentity:plan.preview}),action]);
  return {mode:plan.preview?"EXECUTED_ISOLATED_PREVIEW":"EXECUTED_LOCAL_SYNTHETIC",verified:true,afterCounts:{...after.counts,audit_logs:1},preservedActiveSuperAdmins:preservedUsers.filter(row=>row.role==="SUPER_ADMIN"&&row.status==="ACTIVE").length,preservedStaffIds:manifest.preservedUserIds,archiveSchema:manifest.archiveSchema,sequenceState:"PRESERVED_TO_AVOID_REFERENCE_REUSE",storageVerified:true};
}
