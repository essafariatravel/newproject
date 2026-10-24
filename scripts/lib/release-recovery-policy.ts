/** Offline validation only. Evidence is bound to the protected owner approval digest. */
import {createPublicKey,type KeyObject} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {verifyRecoveryAttestation} from './external-storage-recovery';
import {recipientFingerprint} from './key-custody';
export const MANAGED_BACKUP_RISKS = [
 "PROVIDER_DEPENDENCE", "NO_INDEPENDENT_RESTORE_PROOF", "ACCEPTED_RECOVERY_POINT_GAP",
 "PROJECT_WIDE_RESTORE_AND_DOWNTIME", "EXTERNAL_STORAGE_BYTES_EXCLUDED", "CUSTOM_ROLE_PASSWORDS_NOT_BACKED_UP",
] as const;
export interface ManagedRecoveryPolicy {
 kind:"SUPABASE_MANAGED_PHYSICAL_V1"; selectedBy:string; selectedAt:string; evidenceSha256:string;
 acceptedGapSeconds:number; maxBackupAgeSeconds:number; minRetentionRemainingSeconds:number; acceptedRisks:string[];
}
export interface IndependentRecoveryPolicy {
 kind:"INDEPENDENT_DR_V1"; selectedBy:string; selectedAt:string;
 verifiedManifestSha256:string; evidenceBundleSha256:string; custodyReceiptSha256:string;
}
export const MANAGED_EXTERNAL_RISKS=[...MANAGED_BACKUP_RISKS,'OWNER_MANAGED_NOT_INDEPENDENT','NO_VERIFIED_OFFSITE_OBJECT_COPY','OBJECT_AND_DATABASE_POINTS_NOT_ATOMIC'] as const;
export interface ManagedExternalRecoveryPolicy extends Omit<ManagedRecoveryPolicy,'kind'> {
 kind:'SUPABASE_MANAGED_PHYSICAL_SIGNED_OBJECTS_V2';externalRecoveryEvidenceSha256:string;externalRecoveryOperatorSha:string;ownerAgeRecipientSha256:string;
}
export type RecoveryPolicy = ManagedRecoveryPolicy | ManagedExternalRecoveryPolicy | IndependentRecoveryPolicy;
export const sha256Pattern=/^[a-f0-9]{64}$/;
export function validateRecoverySelection(policy:RecoveryPolicy,owner:string,now:number):void {
 if(!policy||policy.selectedBy!==owner||!Number.isFinite(Date.parse(policy.selectedAt))||Date.parse(policy.selectedAt)>now||Date.parse(policy.selectedAt)<now-24*3600000)throw new Error("A fresh explicit owner-selected recovery policy is required.");
 if(policy.kind==="INDEPENDENT_DR_V1"){
  if(![policy.verifiedManifestSha256,policy.evidenceBundleSha256,policy.custodyReceiptSha256].every(v=>sha256Pattern.test(v)))throw new Error("Independent recovery evidence and custody digests are required.");
 }else if(policy.kind==="SUPABASE_MANAGED_PHYSICAL_V1"||policy.kind==='SUPABASE_MANAGED_PHYSICAL_SIGNED_OBJECTS_V2'){
  const risks=policy.kind==='SUPABASE_MANAGED_PHYSICAL_V1'?MANAGED_BACKUP_RISKS:MANAGED_EXTERNAL_RISKS;
  if(!sha256Pattern.test(policy.evidenceSha256)||!Number.isInteger(policy.acceptedGapSeconds)||policy.acceptedGapSeconds<1||policy.acceptedGapSeconds>86400||!Number.isInteger(policy.maxBackupAgeSeconds)||policy.maxBackupAgeSeconds<1||policy.maxBackupAgeSeconds>policy.acceptedGapSeconds||!Number.isInteger(policy.minRetentionRemainingSeconds)||policy.minRetentionRemainingSeconds<3600||policy.minRetentionRemainingSeconds>7*86400||JSON.stringify(policy.acceptedRisks)!==JSON.stringify(risks))throw new Error("Managed physical backup limits and all residual risks require exact owner acceptance.");
  if(policy.kind==='SUPABASE_MANAGED_PHYSICAL_SIGNED_OBJECTS_V2'&&(!sha256Pattern.test(policy.externalRecoveryEvidenceSha256)||!sha256Pattern.test(policy.ownerAgeRecipientSha256)||!(/^[a-f0-9]{40}$/).test(policy.externalRecoveryOperatorSha)))throw Error('Explicit signed object-recovery evidence/operator/recipient binding is required.');
 }else throw new Error("Unknown recovery policy; no implicit fallback is permitted.");
}
export interface ManagedBackupEvidence {
 version:1; kind:"SUPABASE_MANAGED_PHYSICAL_BACKUP_EVIDENCE"; projectRef:string; database:"postgres";
 observedAt:string; retentionDays:7; independentRestoreStatus:"NOT_PERFORMED";
 source:{kind:"SUPABASE_MANAGEMENT_API";requestPath:string;responseSha256:string};
 backup:{id:number;is_physical_backup:true;status:"COMPLETED";inserted_at:string};
 externalStorage:{kind:"NO_EXTERNAL_OBJECTS_VERIFIED"|"SEPARATE_OBJECT_RECOVERY_VERIFIED"|'EXTERNAL_OBJECT_RECOVERY_REQUIRED';checkedAt:string;inventorySha256:string;objectCount:number;referenceCount:number;objectSetSha256?:string;declaredBytes?:number;recoveryManifestSha256?:string;restoredObjects?:number};
}
function physicalEvidence(value:unknown,selection:ManagedRecoveryPolicy|ManagedExternalRecoveryPolicy,context:{now?:number}={}) {
 const e=value as ManagedBackupEvidence,now=context.now??Date.now();
 validateRecoverySelection(selection,selection.selectedBy,now);
 if(!e||e.version!==1||e.kind!=="SUPABASE_MANAGED_PHYSICAL_BACKUP_EVIDENCE"||e.projectRef!=="xgetzgixalrsmuvfthpf"||e.database!=="postgres"||e.independentRestoreStatus!=="NOT_PERFORMED"||e.retentionDays!==7)throw new Error("Exact Production managed backup identity and honest recovery status are required.");
 const observed=Date.parse(e.observedAt),backupAt=Date.parse(e.backup?.inserted_at),storageAt=Date.parse(e.externalStorage?.checkedAt);
 if(!Number.isFinite(observed)||observed>now||now-observed>3600000||!Number.isFinite(backupAt)||backupAt>observed||now-backupAt>selection.maxBackupAgeSeconds*1000||now-backupAt>selection.acceptedGapSeconds*1000||backupAt+e.retentionDays*86400000-now<selection.minRetentionRemainingSeconds*1000)throw new Error("Managed backup freshness, accepted recovery gap or remaining retention is invalid.");
 if(e.source?.kind!=="SUPABASE_MANAGEMENT_API"||e.source.requestPath!=="/v1/projects/xgetzgixalrsmuvfthpf/database/backups"||!sha256Pattern.test(e.source.responseSha256)||!Number.isSafeInteger(e.backup.id)||e.backup.id<0||e.backup.is_physical_backup!==true||e.backup.status!=="COMPLETED")throw new Error("Actual successful physical backup reference and authoritative API observation are required.");
 const storage=e.externalStorage;
 if(!storage||!Number.isFinite(storageAt)||storageAt>now||now-storageAt>3600000||!sha256Pattern.test(storage.inventorySha256)||![storage.objectCount,storage.referenceCount].every(n=>Number.isInteger(n)&&n>=0))throw new Error("Fresh external object/reference inventory coverage is required separately.");
 return {e,storage,now,result:{status:'MANAGED_PHYSICAL_POLICY_PASS' as const,backupRef:String(e.backup.id),backupAt:e.backup.inserted_at,ageSeconds:Math.ceil((now-backupAt)/1000),retainedUntil:new Date(backupAt+e.retentionDays*86400000).toISOString(),independentRestoreStatus:'NOT_PERFORMED' as const}};
}
export function validateManagedBackupEvidence(value:unknown,selection:ManagedRecoveryPolicy,context:{now?:number}={}) {
 if(selection.kind!=='SUPABASE_MANAGED_PHYSICAL_V1')throw Error('Managed v1 never implicitly selects external recovery.');
 const {storage,result}=physicalEvidence(value,selection,context);
 if(storage.kind==="NO_EXTERNAL_OBJECTS_VERIFIED"){
  if(storage.objectCount!==0||storage.referenceCount!==0)throw new Error("Database backups do not cover external Storage bytes.");
 }else if(storage.kind==="SEPARATE_OBJECT_RECOVERY_VERIFIED"){
  throw new Error("External object recovery needs its separately qualified protocol; a manifest hash and self-declared counts are not recovery proof. Managed policy v1 supports only verified database-backed storage.");
 }else throw new Error("External Storage coverage is ambiguous.");
 return result;
}
/** The CLI never supplies a recipient override: it pins the pre-existing committed owner key. */
export function validateManagedExternalBackupEvidence(value:unknown,selection:ManagedExternalRecoveryPolicy,attestation:unknown,context:{now?:number;recipient?:KeyObject}={}) {
 if(selection.kind!=='SUPABASE_MANAGED_PHYSICAL_SIGNED_OBJECTS_V2')throw Error('Separate explicit signed-object policy is required.');
 const {storage,now,result}=physicalEvidence(value,selection,context);
 const recipient=context.recipient??createPublicKey(readFileSync(path.join(process.cwd(),'docs/consolidation/dr-backup-recipient.public-key.txt')));
 if(!context.recipient&&recipientFingerprint(recipient)!=='f82fa8d7fc09b01a2487a02a6d36d3937c3ade3d6ff0a84c205882bbdb526044')throw Error('Pinned owner recovery verifier changed.');
 const proof=verifyRecoveryAttestation(attestation,recipient),checked=Date.parse(proof.checkedAt),observed=Date.parse(proof.sourceObservedAt);
 if(storage.kind!=='EXTERNAL_OBJECT_RECOVERY_REQUIRED'||storage.referenceCount!==0||storage.objectCount<1||storage.objectCount>4||!sha256Pattern.test(storage.objectSetSha256??'')||!Number.isSafeInteger(storage.declaredBytes)||storage.declaredBytes!<1||proof.status!=='LOCAL_EXTERNAL_OBJECT_RECOVERY_PASS'||proof.projectRef!=='xgetzgixalrsmuvfthpf'||proof.bucket!=='documents'||proof.scope!=='LOCAL_ONLY'||proof.offsiteVerified!==false||proof.independentRestoreStatus!=='NOT_PERFORMED'||proof.objectCount!==storage.objectCount||proof.declaredBytes!==storage.declaredBytes||proof.recoveredBytes!==storage.declaredBytes||proof.objectSetSha256!==storage.objectSetSha256||proof.inventorySha256!==storage.inventorySha256||proof.sourceObservedAt!==storage.checkedAt||!Number.isFinite(checked)||!Number.isFinite(observed)||checked<observed||checked>now||now-checked>3600000||proof.operatorSha!==selection.externalRecoveryOperatorSha||proof.recipientFileSha256!==selection.ownerAgeRecipientSha256||![proof.manifestSha256,proof.payloadSetSha256,proof.ciphertextSha256].every(v=>sha256Pattern.test(v))||!Number.isSafeInteger(proof.ciphertextBytes)||proof.ciphertextBytes<150||proof.ciphertextBytes>8*1024*1024)throw Error('Signed byte recovery must cover the exact fresh source set and private recipient, without offsite or restore claims.');
 return {...result,status:'MANAGED_PHYSICAL_SIGNED_OBJECTS_POLICY_PASS' as const,offsiteVerified:false as const,objectCount:proof.objectCount,recoveredBytes:proof.recoveredBytes};
}
