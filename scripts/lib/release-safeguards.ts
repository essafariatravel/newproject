import {createHash,randomBytes} from "node:crypto";
import {readFileSync} from "node:fs";
import path from "node:path";
import type {PoolClient} from "pg";
import {execFileSync} from "node:child_process";
import {validateRecoverySelection, type RecoveryPolicy} from "./release-recovery-policy";

/** Qualified locally; authorization is a separate, exact-content owner decision. */
export const QUALIFIED_RELEASE_SCOPE = [
 "0020_identity_security.sql","0021_business_invariants.sql","0022_registration_review.sql",
 "0023_operations_legal.sql","0024_preview_api_lockdown.sql","0025_legal_privacy_readiness.sql",
 "0026_function_privilege_hardening.sql","0027_document_integrity.sql","0028_file_identity_hardening.sql",
 "0029_legacy_reconciliation.sql","0030_reconciliation_api_lockdown.sql","0031_reconciliation_event_sequence_repair.sql",
 "0032_privileged_mfa.sql","0033_rule_provenance_and_bounded_history.sql",
] as const;
export interface ReleaseApproval {
 version:1; status:"APPROVED"; approvedBy:string; reason:string; candidateSha:string; releaseRef:string;
 sourceReleaseSha:string; projectRef:string; schema:string; expiresAt:string; trafficDrained:true; authorizationId:string;
 migrations:Record<string,string>; verifiedManifestSha256:string; evidenceBundleSha256:string; custodyReceiptSha256:string;
 authorizedDataChanges:string[];
}
export const QUALIFIED_BATCH_B_SCOPE=["0034_document_retention.sql","0035_legal_document_kinds.sql"] as const;
export interface Phase2ReleaseApproval extends Omit<ReleaseApproval,"version"|"verifiedManifestSha256"|"evidenceBundleSha256"|"custodyReceiptSha256"> {
 version:2; batch:"A"|"B"; recoveryPolicy:RecoveryPolicy; batchAPostflightSha256?:string; batchACandidateSha?:string;
}
export type ReleaseAuthorization=ReleaseApproval|Phase2ReleaseApproval;
export const EXPECTED_HARDENING_UPDATES=["0020_LEGACY_SESSION_POLICY","0021_OBSOLETE_DOCUMENT_REQUEST_CANCELLATION"];
export function validateIndependentCustodyReceipt(value:unknown):void {
 const r=value as Record<string,unknown>;
 const checked=typeof r?.checkedAt==="string"?Date.parse(r.checkedAt):NaN;
 if(!r||r.version!==1||r.kind!=="ESSAFARIA_INDEPENDENT_CUSTODY_RECEIPT"||r.status!=="VERIFIED"||typeof r.custodian!=="string"||!r.custodian.trim()||!Number.isFinite(checked)||checked>Date.now()||r.backupRecipientSpkiSha256!=="f82fa8d7fc09b01a2487a02a6d36d3937c3ade3d6ff0a84c205882bbdb526044"||typeof r.custodyRecipientSha256!=="string"||!/^[a-f0-9]{64}$/.test(r.custodyRecipientSha256)||r.offsiteRetrieved!==true||r.independentRecoveryVerified!==true||r.recoveryEnvironment!=="INDEPENDENT_OF_ORIGINAL_WINDOWS_ACCOUNT")throw new Error("Verified independent off-site key recovery receipt is required.");
}
export function digest(value:Buffer|string):string {return createHash("sha256").update(value).digest("hex");}
export function assertCleanReleaseCheckout(expectedSha:string,run:(args:string[])=>string=(args)=>execFileSync("git",args,{encoding:"utf8",windowsHide:true})):void {
 if(!/^[a-f0-9]{40}$/.test(expectedSha)||run(["rev-parse","HEAD"]).trim()!==expectedSha)throw new Error("Actual checkout does not match the owner-approved release SHA.");
 if(run(["status","--porcelain","--untracked-files=all"]).trim())throw new Error("Release checkout must be clean before Production authorization.");
}
export async function discoverProtectedTables(client:PoolClient):Promise<string[]> {
 const result=await client.query("select tablename from pg_tables where schemaname='visa_os' and tablename<>'schema_migrations' and left(tablename,9)<>'_restore_' order by tablename");
 const tables=result.rows.map(row=>String(row.tablename));
 if(!tables.length||tables.some(table=>!/^[a-z_]+$/.test(table)||table.length>35))throw new Error("Protected source table inventory is invalid.");
 return tables;
}
export function validateReleaseApproval(value:unknown,context:{sha:string;ref:string;now?:number;directory?:string}):ReleaseAuthorization {
 if((value as {version?:number})?.version===2)return validatePhase2ReleaseApproval(value,context);
 const a=value as ReleaseApproval;
 const now=context.now??Date.now();
 if(!a||a.version!==1||a.status!=="APPROVED"||typeof a.approvedBy!=="string"||!a.approvedBy.trim()||typeof a.reason!=="string"||a.reason.trim().length<10)throw new Error("Explicit owner release approval is required.");
 if(!/^[a-f0-9]{40}$/.test(a.candidateSha)||a.candidateSha!==context.sha||a.releaseRef!==context.ref||!/^refs\/heads\/release\/essafaria-prod-candidate-[0-9-]+$/.test(a.releaseRef))throw new Error("Approval does not match the exact candidate SHA and release ref.");
 if(!/^[a-f0-9]{40}$/.test(a.sourceReleaseSha)||a.projectRef!=="xgetzgixalrsmuvfthpf"||a.schema!=="visa_os"||a.trafficDrained!==true)throw new Error("Production identity or maintenance approval is invalid.");
 const expires=Date.parse(a.expiresAt);
 if(!Number.isFinite(expires)||expires<=now||expires>now+24*3600000)throw new Error("Release approval is expired or exceeds the 24-hour window.");
 if(!/^[a-f0-9]{64}$/.test(a.verifiedManifestSha256)||!/^[a-f0-9]{64}$/.test(a.evidenceBundleSha256)||!/^[a-f0-9]{64}$/.test(a.custodyReceiptSha256))throw new Error("Approval must bind verified DR and custody evidence digests.");
 if(!/^[a-f0-9]{32}$/.test(a.authorizationId))throw new Error("Release authorization identifier is invalid.");
 if(JSON.stringify(a.authorizedDataChanges)!==JSON.stringify(EXPECTED_HARDENING_UPDATES))throw new Error("Exact legacy hardening transitions must be explicitly approved.");
 if(!a.migrations||JSON.stringify(Object.keys(a.migrations).sort())!==JSON.stringify([...QUALIFIED_RELEASE_SCOPE]))throw new Error("Approval must contain exactly migrations 0020–0033.");
 for(const name of QUALIFIED_RELEASE_SCOPE)if(digest(readFileSync(path.join(context.directory??path.join(process.cwd(),"migrations"),name)))!==a.migrations[name])throw new Error("Approved migration digest differs from the candidate.");
 return a;
}

function validatePhase2ReleaseApproval(value:unknown,context:{sha:string;ref:string;now?:number;directory?:string}):Phase2ReleaseApproval {
 const a=value as Phase2ReleaseApproval,now=context.now??Date.now();
 if(!a||a.status!=="APPROVED"||typeof a.approvedBy!=="string"||!a.approvedBy.trim()||typeof a.reason!=="string"||a.reason.trim().length<10)throw new Error("Explicit owner release approval is required.");
 if(!/^[a-f0-9]{40}$/.test(a.candidateSha)||a.candidateSha!==context.sha||a.releaseRef!==context.ref||!/^refs\/heads\/release\/essafaria-prod-candidate-[0-9-]+$/.test(a.releaseRef)||!/^[a-f0-9]{40}$/.test(a.sourceReleaseSha)||a.projectRef!=="xgetzgixalrsmuvfthpf"||a.schema!=="visa_os"||a.trafficDrained!==true||!/^[a-f0-9]{32}$/.test(a.authorizationId))throw new Error("Exact protected release identity and maintenance approval are required.");
 const expires=Date.parse(a.expiresAt);if(!Number.isFinite(expires)||expires<=now||expires>now+24*3600000)throw new Error("Release approval is expired or exceeds the 24-hour window.");
 validateRecoverySelection(a.recoveryPolicy,a.approvedBy,now);
 const scope=a.batch==="A"?QUALIFIED_RELEASE_SCOPE:a.batch==="B"?QUALIFIED_BATCH_B_SCOPE:null;
 const changes=a.batch==="A"?["0020_LEGACY_AGENCY_USERNAME_ASSIGNMENT",...EXPECTED_HARDENING_UPDATES]:["0034_RETENTION_POLICY_DISABLED_DEFAULT"];
 if(!scope||!a.migrations||JSON.stringify(Object.keys(a.migrations).sort())!==JSON.stringify(scope)||JSON.stringify(a.authorizedDataChanges)!==JSON.stringify(changes))throw new Error("The exact independently approved migration batch and data transitions are required.");
 if(a.batch==="B"&&(!/^[a-f0-9]{64}$/.test(a.batchAPostflightSha256??"")||!/^[a-f0-9]{40}$/.test(a.batchACandidateSha??"")))throw new Error("Batch B must bind its successful Batch A postflight and candidate SHA.");
 const directory=context.directory??path.join(process.cwd(),"migrations",...(a.batch==="B"?["candidates"]:[]));
 for(const name of scope)if(digest(readFileSync(path.join(directory,name)))!==a.migrations[name])throw new Error("Approved migration digest differs from the candidate.");
 return a;
}

/** CTAS never replaces an earlier restore point; all snapshots stay private. */
export async function createRestorePoints(client:PoolClient,tables:readonly string[]):Promise<string[]> {
 const stamp=randomBytes(8).toString("hex");
 const created:string[]=[];
 for(const table of tables){
  if(!/^[a-z_]+$/.test(table)||table.length>35)throw new Error("Invalid snapshot table identifier.");
  const exists=await client.query("select to_regclass($1) as t",[`visa_os.${table}`]);
  if(!exists.rows[0]?.t)continue;
  const name=`visa_os."_restore_${stamp}_${table}"`;
  await client.query(`create table ${name} as select * from visa_os."${table}"`);
  await client.query(`alter table ${name} enable row level security`);
  await client.query(`revoke all on ${name} from public`);
  for(const role of ["anon","authenticated"]){
   const found=await client.query("select 1 from pg_roles where rolname=$1",[role]);
   if(found.rowCount)await client.query(`revoke all on ${name} from "${role}"`);
  }
  created.push(name);
 }
 return created;
}

export async function sourceColumnProjection(client:PoolClient,tables:readonly string[],hardeningTransitions=true):Promise<Record<string,string[]>> {
 const projection:Record<string,string[]>={};
 for(const table of tables){
  if(!/^[a-z_]+$/.test(table))throw new Error("Invalid integrity table identifier.");
  const columns=await client.query("select column_name from information_schema.columns where table_schema='visa_os' and table_name=$1 order by ordinal_position",[table]);
  const allowed:Record<string,string[]>=hardeningTransitions?{sessions:["expires_at","last_activity_at"],document_requests:["status","updated_at"]}:{};
  if(columns.rowCount)projection[table]=columns.rows.map(r=>String(r.column_name)).filter(column=>!allowed[table]?.includes(column));
 }
 return projection;
}

/** Validate every excluded mutable field against its exact migration semantics. */
export async function verifyHardeningUpdates(client:PoolClient,snapshots:readonly string[]):Promise<void> {
 const original=(table:string)=>{
  const value=snapshots.find(name=>name.endsWith(`_${table}"`));
  if(!value||!/^visa_os\."_restore_[a-f0-9]{16}_[a-z_]+"$/.test(value))throw new Error("Original hardening snapshot is unavailable.");
  return value;
 };
 const sessions=await client.query(`select count(*)::int n from visa_os.sessions a join ${original("sessions")} b on a.id=b.id where a.expires_at is distinct from least(b.expires_at,b.created_at+case when exists(select 1 from visa_os.users u where u.id=b.user_id and u.agency_id is not null) then interval '24 hours' else interval '12 hours' end) or a.last_activity_at is distinct from b.created_at`);
 const requests=await client.query(`with ranked as(select id,row_number() over(partition by application_id,document_type_id order by created_at desc,id desc) n from ${original("document_requests")} where status='OPEN'), expected as(select b.*,case when b.status='OPEN' and (coalesce(r.n,0)>1 or s.is_terminal) then 'CANCELLED' else b.status end expected_status from ${original("document_requests")} b left join ranked r on r.id=b.id join visa_os.applications app on app.id=b.application_id join visa_os.statuses s on s.id=app.status_id) select count(*)::int n from expected b join visa_os.document_requests a on a.id=b.id where a.status is distinct from b.expected_status or a.updated_at is distinct from case when b.expected_status<>b.status then now() else b.updated_at end`);
 if(Number(sessions.rows[0].n)||Number(requests.rows[0].n))throw new Error("Legacy hardening transition differs from the exact approved semantics.");
}
/** Hash original columns only, including complete blob bytes and password hashes. */
export async function protectedContentDigests(client:PoolClient,projection:Record<string,string[]>):Promise<Record<string,string>> {
 const digests:Record<string,string>={};
 for(const [table,columns] of Object.entries(projection)){
  const fields=columns.flatMap(column=>[`'${column.replaceAll("'","''")}'`,`t."${column.replaceAll('"','""')}"`]).join(",");
  const result=await client.query(`select encode(sha256(convert_to(coalesce(string_agg(h,'|' order by h),''),'UTF8')),'hex') as digest from (select encode(sha256(convert_to(jsonb_build_object(${fields})::text,'UTF8')),'hex') h from visa_os."${table}" t) rows`);
  digests[table]=String(result.rows[0].digest);
 }
 return digests;
}
