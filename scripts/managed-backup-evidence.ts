/** Read-only provider observation. Never initiates a backup/restore or claims RESTORE_PASS. */
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {privateArtifactPath} from "./lib/dr-private-path";
import type {ManagedBackupEvidence} from "./lib/release-recovery-policy";
import {Pool,type PoolClient} from "pg";
import {guardedProductionPoolConfig} from "./prod-release";
import {safeErrorCode} from "../src/lib/safe-error";
import {readExternalObjectInventory,objectSetDigest} from './lib/external-storage-recovery';
const project="xgetzgixalrsmuvfthpf",requestPath=`/v1/projects/${project}/database/backups`;
let operationStage="CONFIGURATION";
/** Reuses the existing portal writer-reference inventory, without reading any object bytes. */
export async function readManagedStorageInventory(client:PoolClient,schema="visa_os",providerSchema="storage"){
 if(!/^[a-z_]+$/.test(schema)||!/^[a-z_]+$/.test(providerSchema))throw new Error("Invalid inventory schema.");
 if((await client.query("show transaction_read_only")).rows[0].transaction_read_only!=="on")throw new Error("Explicit read-only transaction is required for inventory.");
 const columns=(await client.query("select c.table_name,c.column_name from information_schema.columns c where c.table_schema=$1 and c.column_name ~ '(storage_key|logo_key|file_key)$'",[schema])).rows;
 const known=new Set(["documents.storage_key","agency_registration_documents.storage_key","wallet_topup_requests.proof_storage_key","agencies.logo_key","legacy_reconciliation_issues.storage_key"]);
 const base=(table:string)=>table.replace(/^_restore_(?:[0-9]{12}|[a-f0-9]{16})_/,"");
 const uncovered=columns.map(r=>`${r.table_name}.${r.column_name}`).filter(c=>{const [table,column]=c.split('.');return !known.has(`${base(table!)}.${column}`);});
 if(uncovered.length)throw Object.assign(new Error("Uncovered application storage writer reference; no empty inventory may be claimed."),{code:"STORAGE_REFERENCE_COLUMN_UNCOVERED",columns:uncovered.filter(c=>/^[a-z0-9_]+\.[a-z0-9_]+$/.test(c)).slice(0,20)});
 const queries=columns.map(r=>`select "${r.column_name}" as key from "${schema}"."${r.table_name}" where "${r.column_name}" is not null and length("${r.column_name}")>0`);
 const settingsColumns=(await client.query("select table_name,column_name,data_type from information_schema.columns where table_schema=$1",[schema])).rows.filter(r=>base(String(r.table_name))==='site_settings');
 const settingsTables=[...new Set(settingsColumns.map(r=>String(r.table_name)))];
 for(const table of settingsTables){
  const cols=settingsColumns.filter(r=>r.table_name===table);
  if(!cols.some(r=>r.column_name==='key'&&['text','character varying'].includes(r.data_type))||!cols.some(r=>r.column_name==='value'&&r.data_type==='jsonb'))throw new Error('Known live/archive settings schema is not covered.');
  queries.push(`select value#>>'{}' as key from "${schema}"."${table}" where key in ('brand.logoKey','brand.logo_key') and jsonb_typeof(value)='string' and length(value#>>'{}')>0`);
 }
 const refs=queries.length?queries.join(" union all "):"select null::text as key where false";
 const blobTables=(await client.query("select table_name from information_schema.columns where table_schema=$1 and column_name in ('key','data') group by table_name having count(*)=2 order by table_name",[schema])).rows.map(r=>String(r.table_name)).filter(t=>base(t)==='document_blobs');
 if(!blobTables.includes('document_blobs'))throw new Error("Database-backed object store must exist.");
 const blobQueries=blobTables.map(t=>`select key,encode(pg_catalog.sha256(data),'hex') sha from "${schema}"."${t}"`).join(' union all ');
 const result=(await client.query(`with refs as (${refs}), blobs as(${blobQueries}), objects as(select bucket_id,name from "${providerSchema}".objects) select (select count(*)::int from refs where not exists(select 1 from blobs where blobs.key=refs.key)) external_references,(select count(*)::int from objects) external_objects,(select count(*)::int from(select key from blobs group by key having count(distinct sha)>1) ambiguous) ambiguous_keys,encode(pg_catalog.sha256(convert_to(concat_ws('|',(select coalesce(string_agg(key||':'||sha,'|' order by key,sha),'') from blobs),(select coalesce(string_agg(encode(pg_catalog.sha256(convert_to(key,'UTF8')),'hex'),'|' order by key),'') from refs),(select coalesce(string_agg(encode(pg_catalog.sha256(convert_to(bucket_id||':'||name,'UTF8')),'hex'),'|' order by bucket_id,name),'') from objects)),'UTF8')),'hex') inventory_sha256`)).rows[0];
 const covered=result.external_references===0&&result.external_objects===0&&result.ambiguous_keys===0;
 const objects=result.external_objects?await readExternalObjectInventory(client,providerSchema):[];
 if(objects.length!==result.external_objects)throw Error('EXACT_OBJECT_SET_COUNT_MISMATCH');
 const objectSetSha256=objects.length?objectSetDigest(objects):undefined;
 const inventorySha256=objectSetSha256?createHash('sha256').update(result.inventory_sha256+'|'+objectSetSha256).digest('hex'):result.inventory_sha256;
 return {kind:"ESSAFARIA_PRODUCTION_STORAGE_INVENTORY",status:result.ambiguous_keys?'BLOCKED_DB_BLOB_GENERATION_AMBIGUITY':covered?"VERIFIED_READ_ONLY":"BLOCKED_EXTERNAL_STORAGE_COVERAGE",projectRef:project,database:"postgres",schema,tlsVerified:false,transactionReadOnly:true,coveredReferenceColumns:columns.length,coveredBlobTables:blobTables.length,externalStorage:{kind:covered?"NO_EXTERNAL_OBJECTS_VERIFIED":"EXTERNAL_OBJECT_RECOVERY_REQUIRED",checkedAt:new Date().toISOString(),inventorySha256,objectCount:result.external_objects,referenceCount:result.external_references,...(objectSetSha256?{objectSetSha256,declaredBytes:objects.reduce((s,o)=>s+o.declaredBytes,0)}:{})}};
}
export function physicalBackupObservation(value:unknown,observedAt:string){
 const response=value as {backups?:Array<{id:number;is_physical_backup:boolean;status:string;inserted_at:string}>};
 const now=Date.parse(observedAt);
 if(!Number.isFinite(now)||!Array.isArray(response?.backups))throw new Error("Authoritative backup list is unavailable.");
 const backups=response.backups.filter(b=>Number.isSafeInteger(b.id)&&b.id>=0&&b.is_physical_backup===true&&b.status==="COMPLETED"&&Number.isFinite(Date.parse(b.inserted_at))&&Date.parse(b.inserted_at)<=now).sort((a,b)=>Date.parse(b.inserted_at)-Date.parse(a.inserted_at));
 if(!backups.length)throw new Error("No referenced successful physical backup is demonstrated by the provider response.");
 const b=backups[0]!;
 return {id:b.id,is_physical_backup:true as const,status:"COMPLETED" as const,inserted_at:b.inserted_at};
}
async function main(){
 if(process.argv.includes("--inventory-only")){
  const output=privateArtifactPath(process.env.MANAGED_BACKUP_OUTPUT??"","Read-only Storage inventory output",{requireAbsolute:true});
  const pool=new Pool({...guardedProductionPoolConfig(),max:1});let client:PoolClient|undefined;
  try{operationStage="SOURCE_TLS_CONNECT";client=await pool.connect();if(!(client as unknown as {connection:{stream:{authorized:boolean}}}).connection.stream.authorized)throw new Error("Verified TLS required.");operationStage="SOURCE_READ_ONLY_IDENTITY";await client.query("begin isolation level repeatable read read only");const who=(await client.query("select current_database() db,to_regnamespace('visa_os') is not null present")).rows[0];if(who.db!=="postgres"||!who.present)throw new Error("Exact Production database/schema required.");operationStage="SOURCE_STORAGE_INVENTORY";const inventory=await readManagedStorageInventory(client);inventory.tlsVerified=true;await client.query("rollback");operationStage="PRIVATE_AGGREGATE_EVIDENCE";writeFileSync(output,JSON.stringify(inventory,null,2)+"\n",{flag:"wx",mode:0o600});console.log(inventory.status);if(inventory.status!=="VERIFIED_READ_ONLY")process.exitCode=1;}finally{if(client){await client.query('rollback').catch(()=>{});client.release();}await pool.end();}
  return;
 }
 const token=process.env.SUPABASE_MANAGEMENT_READ_TOKEN;
 if(!token?.trim())throw new Error("Private Supabase Management API token with backups_read permission is required.");
 const output=privateArtifactPath(process.env.MANAGED_BACKUP_OUTPUT??"","Managed backup evidence output",{requireAbsolute:true});
 const inventory=JSON.parse(readFileSync(privateArtifactPath(process.env.MANAGED_STORAGE_INVENTORY_FILE??"","Read-only Storage inventory",{requireAbsolute:true}),"utf8"));
 const sourceValid=inventory.status==='VERIFIED_READ_ONLY'||(inventory.status==='BLOCKED_EXTERNAL_STORAGE_COVERAGE'&&inventory.externalStorage?.kind==='EXTERNAL_OBJECT_RECOVERY_REQUIRED'&&inventory.externalStorage.referenceCount===0&&inventory.externalStorage.objectCount>0&&/^[a-f0-9]{64}$/.test(inventory.externalStorage.objectSetSha256??''));
 if(inventory.kind!=="ESSAFARIA_PRODUCTION_STORAGE_INVENTORY"||!sourceValid||inventory.projectRef!==project||inventory.database!=="postgres"||inventory.schema!=="visa_os"||inventory.tlsVerified!==true||inventory.transactionReadOnly!==true)throw new Error("A separately verified exact Production read-only Storage/reference inventory is required.");
 const observedAt=new Date().toISOString();
 const response=await fetch("https://api.supabase.com"+requestPath,{method:"GET",headers:{Authorization:`Bearer ${token}`},redirect:"error",signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Backup observation refused (HTTP ${response.status}); no retry or mutation attempted.`);
 const text=await response.text();if(Buffer.byteLength(text)>2*1024*1024)throw new Error("Backup observation exceeds bounded response size.");
 const evidence:ManagedBackupEvidence={version:1,kind:"SUPABASE_MANAGED_PHYSICAL_BACKUP_EVIDENCE",projectRef:project,database:"postgres",observedAt,retentionDays:7,independentRestoreStatus:"NOT_PERFORMED",source:{kind:"SUPABASE_MANAGEMENT_API",requestPath,responseSha256:createHash("sha256").update(text).digest("hex")},backup:physicalBackupObservation(JSON.parse(text),observedAt),externalStorage:inventory.externalStorage};
 writeFileSync(output,JSON.stringify(evidence,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log("READ_ONLY_BACKUP_OBSERVATION_RECORDED; exact owner policy selection and gate validation still required; independent restore NOT_PERFORMED.");
}
if(/managed-backup-evidence\.(ts|js)$/.test(process.argv[1]??""))main().catch(error=>{const code=safeErrorCode(error);console.error(JSON.stringify({status:"BLOCKED_MANAGED_BACKUP_OBSERVATION",stage:operationStage,code:code&&/^[A-Z0-9_]+$/.test(code)?code:"REQUIRED_GUARANTEE_NOT_DEMONSTRATED",...(code==="STORAGE_REFERENCE_COLUMN_UNCOVERED"?{columns:error.columns}:{}),productionWrites:0}));process.exitCode=1;});
