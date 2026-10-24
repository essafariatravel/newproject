import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import * as safeguards from "../scripts/lib/release-safeguards";
import {validateManagedBackupEvidence, type ManagedRecoveryPolicy} from "../scripts/lib/release-recovery-policy";
import {assertReleaseJobIdentity,guardedProductionPoolConfig} from "../scripts/prod-release";

const now=Date.now(),sha="a".repeat(40),ref="refs/heads/release/essafaria-prod-candidate-2026-10-20";
const hash=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");
const batchA=()=>Object.fromEntries(safeguards.QUALIFIED_RELEASE_SCOPE.map(n=>[n,hash(readFileSync(`migrations/${n}`))]));
const risks=["PROVIDER_DEPENDENCE","NO_INDEPENDENT_RESTORE_PROOF","ACCEPTED_RECOVERY_POINT_GAP","PROJECT_WIDE_RESTORE_AND_DOWNTIME","EXTERNAL_STORAGE_BYTES_EXCLUDED","CUSTOM_ROLE_PASSWORDS_NOT_BACKED_UP"];
function approved(){return {version:2,status:"APPROVED",approvedBy:"Owner",reason:"Exact Phase 2B migration batch maintenance",candidateSha:sha,releaseRef:ref,sourceReleaseSha:"831607a2ed0423d575d693b8f8f3a9dfc1e5d9d1",projectRef:"xgetzgixalrsmuvfthpf",schema:"visa_os",expiresAt:new Date(now+3600000).toISOString(),trafficDrained:true,authorizationId:"d".repeat(32),batch:"A",authorizedDataChanges:["0020_LEGACY_AGENCY_USERNAME_ASSIGNMENT",...safeguards.EXPECTED_HARDENING_UPDATES],migrations:batchA(),recoveryPolicy:{kind:"SUPABASE_MANAGED_PHYSICAL_V1",selectedBy:"Owner",selectedAt:new Date(now-1000).toISOString(),evidenceSha256:"e".repeat(64),acceptedGapSeconds:86400,maxBackupAgeSeconds:86400,minRetentionRemainingSeconds:86400,acceptedRisks:risks}};}

describe("explicit owner-selected release recovery and batches",()=>{
 it("publishes a platform-independent manifest for the exact unmodified SQL execution bytes",()=>{
  const manifest=JSON.parse(readFileSync('docs/operations/phase2-migration-manifest.json','utf8'));
  expect(readFileSync('.gitattributes','utf8')).toContain('migrations/** text eol=lf');
  for(const [batch,dir,names] of [['batchA','migrations',safeguards.QUALIFIED_RELEASE_SCOPE],['batchB','migrations/candidates',safeguards.QUALIFIED_BATCH_B_SCOPE]] as const){
   expect(Object.keys(manifest[batch]).sort()).toEqual([...names].sort());
   for(const name of names){const bytes=readFileSync(`${dir}/${name}`);expect(bytes.includes(13)).toBe(false);expect(manifest[batch][name]).toBe(hash(bytes));}
  }
 });
 it("requires the exact protected repository/workflow/ref and never treats a dispatch as apply",()=>{
  const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"essafariatravel/newproject",GITHUB_REPOSITORY_ID:"1375109458",GITHUB_REF:ref,GITHUB_REF_PROTECTED:"true",GITHUB_WORKFLOW_REF:`essafariatravel/newproject/.github/workflows/prod-release.yml@${ref}`,GITHUB_SHA:sha,GITHUB_EVENT_NAME:"push"};
  expect(()=>assertReleaseJobIdentity(env,"apply")).not.toThrow();
  for(const bad of [{...env,GITHUB_REF_PROTECTED:"false"},{...env,GITHUB_REPOSITORY:"other/repo"},{...env,GITHUB_WORKFLOW_REF:"other.yml"},{...env,GITHUB_REF:"refs/heads/main"},{...env,GITHUB_EVENT_NAME:"workflow_dispatch"}])expect(()=>assertReleaseJobIdentity(bad,"apply")).toThrow();
  expect(()=>assertReleaseJobIdentity({...env,GITHUB_EVENT_NAME:"workflow_dispatch"},"audit")).not.toThrow();
 });
 it("rejects another database on the otherwise correct Production project before connection",()=>{
  // Deliberately invalid fixture assembled in memory; never a stored credential.
  const fixture=new URL('postgresql://invalid/other');fixture.hostname='aws-0-us-east-1.pooler.supabase.com';fixture.port='5432';fixture.username='postgres.xgetzgixalrsmuvfthpf';fixture.password='deliberately-invalid-fixture-only';
  expect(()=>guardedProductionPoolConfig({DATABASE_SCHEMA:"visa_os",DATABASE_URL:fixture.href})).toThrow("exactly postgres");
 });
 it("accepts managed physical approval as its own policy, never an independent restore PASS",()=>{
  expect(()=>safeguards.validateReleaseApproval(approved(),{sha,ref,now})).not.toThrow();
 });
 it("rejects absent choice, missing accepted risks, excessive age budget and digest drift",()=>{
  const a=approved();for(const bad of [{...a,recoveryPolicy:undefined},{...a,recoveryPolicy:{...a.recoveryPolicy,acceptedRisks:[]}},{...a,recoveryPolicy:{...a.recoveryPolicy,maxBackupAgeSeconds:8*86400}},{...a,migrations:{...a.migrations,"0032_privileged_mfa.sql":"0".repeat(64)}},{...a,batch:"B"}])expect(()=>safeguards.validateReleaseApproval(bad,{sha,ref,now})).toThrow();
 });
 it("binds Batch B independently to only 0034–0035, never 0036",()=>{
  const migrations=Object.fromEntries(["0034_document_retention.sql","0035_legal_document_kinds.sql"].map(n=>[n,hash(readFileSync(`migrations/candidates/${n}`))]));
  const b={...approved(),batch:"B",migrations,authorizedDataChanges:["0034_RETENTION_POLICY_DISABLED_DEFAULT"],batchAPostflightSha256:"f".repeat(64),batchACandidateSha:sha};
  expect(()=>safeguards.validateReleaseApproval(b,{sha,ref,now})).not.toThrow();
  expect(()=>safeguards.validateReleaseApproval({...b,migrations:{...migrations,"0036_storage_operations.sql":"0".repeat(64)}},{sha,ref,now})).toThrow();
  expect(()=>safeguards.validateReleaseApproval({...b,batchAPostflightSha256:undefined},{sha,ref,now})).toThrow();
 });
});

describe("managed physical evidence is not a restore receipt",()=>{
 const choice=()=>approved().recoveryPolicy as ManagedRecoveryPolicy;
 const evidence=()=>({version:1,kind:"SUPABASE_MANAGED_PHYSICAL_BACKUP_EVIDENCE",projectRef:"xgetzgixalrsmuvfthpf",database:"postgres",observedAt:new Date(now-1000).toISOString(),retentionDays:7,independentRestoreStatus:"NOT_PERFORMED",source:{kind:"SUPABASE_MANAGEMENT_API",requestPath:"/v1/projects/xgetzgixalrsmuvfthpf/database/backups",responseSha256:"b".repeat(64)},backup:{id:123,is_physical_backup:true,status:"COMPLETED",inserted_at:new Date(now-3600000).toISOString()},externalStorage:{kind:"NO_EXTERNAL_OBJECTS_VERIFIED",checkedAt:new Date(now-1000).toISOString(),inventorySha256:"c".repeat(64),objectCount:0,referenceCount:0}});
 it("reports only the selected managed-policy result with a concrete recovery gap",()=>{
  expect(validateManagedBackupEvidence(evidence(),choice(),{now})).toMatchObject({status:"MANAGED_PHYSICAL_POLICY_PASS",backupRef:"123",ageSeconds:3600,independentRestoreStatus:"NOT_PERFORMED"});
 });
 it("rejects ambiguous, failed, nonphysical, expired, wrong-project and fabricated restore evidence",()=>{
  const e=evidence();for(const bad of [{...e,projectRef:"nqudhszgodmzckautrby"},{...e,database:"other"},{...e,backup:{...e.backup,status:"PENDING"}},{...e,backup:{...e.backup,is_physical_backup:false}},{...e,backup:{...e.backup,id:undefined}},{...e,backup:{...e.backup,inserted_at:new Date(now-25*3600000).toISOString()}},{...e,observedAt:new Date(now+1).toISOString()},{...e,retentionDays:0},{...e,independentRestoreStatus:"RESTORE_PASS"},{...e,source:{...e.source,kind:"OWNER_REPORTED_ROW"}}])expect(()=>validateManagedBackupEvidence(bad,choice(),{now})).toThrow();
 });
 it("blocks any uncovered external object or reference and stale inventory",()=>{
  const e=evidence();for(const externalStorage of [{...e.externalStorage,objectCount:1},{...e.externalStorage,referenceCount:1},{...e.externalStorage,checkedAt:new Date(now-2*3600000).toISOString()},{...e.externalStorage,kind:"SEPARATE_OBJECT_RECOVERY_VERIFIED",objectCount:2,restoredObjects:1,recoveryManifestSha256:"f".repeat(64)}])expect(()=>validateManagedBackupEvidence({...e,externalStorage},choice(),{now})).toThrow();
 });
 it("does not accept an unverified object-recovery hash and self-declared restored count",()=>{
  const e=evidence();expect(()=>validateManagedBackupEvidence({...e,externalStorage:{...e.externalStorage,kind:"SEPARATE_OBJECT_RECOVERY_VERIFIED",objectCount:1,referenceCount:1,restoredObjects:1,recoveryManifestSha256:"f".repeat(64)}},choice(),{now})).toThrow();
 });
});
