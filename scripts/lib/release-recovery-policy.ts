/** Offline validation only. Evidence is bound to the protected owner approval digest. */
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
export type RecoveryPolicy = ManagedRecoveryPolicy | IndependentRecoveryPolicy;
export const sha256Pattern=/^[a-f0-9]{64}$/;
export function validateRecoverySelection(policy:RecoveryPolicy,owner:string,now:number):void {
 if(!policy||policy.selectedBy!==owner||!Number.isFinite(Date.parse(policy.selectedAt))||Date.parse(policy.selectedAt)>now||Date.parse(policy.selectedAt)<now-24*3600000)throw new Error("A fresh explicit owner-selected recovery policy is required.");
 if(policy.kind==="INDEPENDENT_DR_V1"){
  if(![policy.verifiedManifestSha256,policy.evidenceBundleSha256,policy.custodyReceiptSha256].every(v=>sha256Pattern.test(v)))throw new Error("Independent recovery evidence and custody digests are required.");
 }else if(policy.kind==="SUPABASE_MANAGED_PHYSICAL_V1"){
  if(!sha256Pattern.test(policy.evidenceSha256)||!Number.isInteger(policy.acceptedGapSeconds)||policy.acceptedGapSeconds<1||policy.acceptedGapSeconds>86400||!Number.isInteger(policy.maxBackupAgeSeconds)||policy.maxBackupAgeSeconds<1||policy.maxBackupAgeSeconds>policy.acceptedGapSeconds||!Number.isInteger(policy.minRetentionRemainingSeconds)||policy.minRetentionRemainingSeconds<3600||policy.minRetentionRemainingSeconds>7*86400||JSON.stringify(policy.acceptedRisks)!==JSON.stringify(MANAGED_BACKUP_RISKS))throw new Error("Managed physical backup limits and all residual risks require exact owner acceptance.");
 }else throw new Error("Unknown recovery policy; no implicit fallback is permitted.");
}
export interface ManagedBackupEvidence {
 version:1; kind:"SUPABASE_MANAGED_PHYSICAL_BACKUP_EVIDENCE"; projectRef:string; database:"postgres";
 observedAt:string; retentionDays:7; independentRestoreStatus:"NOT_PERFORMED";
 source:{kind:"SUPABASE_MANAGEMENT_API";requestPath:string;responseSha256:string};
 backup:{id:number;is_physical_backup:true;status:"COMPLETED";inserted_at:string};
 externalStorage:{kind:"NO_EXTERNAL_OBJECTS_VERIFIED"|"SEPARATE_OBJECT_RECOVERY_VERIFIED";checkedAt:string;inventorySha256:string;objectCount:number;referenceCount:number;recoveryManifestSha256?:string;restoredObjects?:number};
}
export function validateManagedBackupEvidence(value:unknown,selection:ManagedRecoveryPolicy,context:{now?:number}={}) {
 const e=value as ManagedBackupEvidence,now=context.now??Date.now();
 validateRecoverySelection(selection,selection.selectedBy,now);
 if(!e||e.version!==1||e.kind!=="SUPABASE_MANAGED_PHYSICAL_BACKUP_EVIDENCE"||e.projectRef!=="xgetzgixalrsmuvfthpf"||e.database!=="postgres"||e.independentRestoreStatus!=="NOT_PERFORMED"||e.retentionDays!==7)throw new Error("Exact Production managed backup identity and honest recovery status are required.");
 const observed=Date.parse(e.observedAt),backupAt=Date.parse(e.backup?.inserted_at),storageAt=Date.parse(e.externalStorage?.checkedAt);
 if(!Number.isFinite(observed)||observed>now||now-observed>3600000||!Number.isFinite(backupAt)||backupAt>observed||now-backupAt>selection.maxBackupAgeSeconds*1000||now-backupAt>selection.acceptedGapSeconds*1000||backupAt+e.retentionDays*86400000-now<selection.minRetentionRemainingSeconds*1000)throw new Error("Managed backup freshness, accepted recovery gap or remaining retention is invalid.");
 if(e.source?.kind!=="SUPABASE_MANAGEMENT_API"||e.source.requestPath!=="/v1/projects/xgetzgixalrsmuvfthpf/database/backups"||!sha256Pattern.test(e.source.responseSha256)||!Number.isSafeInteger(e.backup.id)||e.backup.id<0||e.backup.is_physical_backup!==true||e.backup.status!=="COMPLETED")throw new Error("Actual successful physical backup reference and authoritative API observation are required.");
 const storage=e.externalStorage;
 if(!storage||!Number.isFinite(storageAt)||storageAt>now||now-storageAt>3600000||!sha256Pattern.test(storage.inventorySha256)||![storage.objectCount,storage.referenceCount].every(n=>Number.isInteger(n)&&n>=0))throw new Error("Fresh external object/reference inventory coverage is required separately.");
 if(storage.kind==="NO_EXTERNAL_OBJECTS_VERIFIED"){
  if(storage.objectCount!==0||storage.referenceCount!==0)throw new Error("Database backups do not cover external Storage bytes.");
 }else if(storage.kind==="SEPARATE_OBJECT_RECOVERY_VERIFIED"){
  throw new Error("External object recovery needs its separately qualified protocol; a manifest hash and self-declared counts are not recovery proof. Managed policy v1 supports only verified database-backed storage.");
 }else throw new Error("External Storage coverage is ambiguous.");
 return {status:"MANAGED_PHYSICAL_POLICY_PASS" as const,backupRef:String(e.backup.id),backupAt:e.backup.inserted_at,ageSeconds:Math.ceil((now-backupAt)/1000),retainedUntil:new Date(backupAt+e.retentionDays*86400000).toISOString(),independentRestoreStatus:"NOT_PERFORMED" as const};
}
