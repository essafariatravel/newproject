import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import * as policy from '../scripts/lib/release-recovery-policy';
import {attestObjectRecovery,buildObjectArchive,encryptObjectArchive,objectSetDigest} from '../scripts/lib/external-storage-recovery';

describe('separately opted-in signed external byte coverage',()=>{
 it('accepts only authenticated complete local recovery, preserves V1 refusal, and rejects all identity/freshness/content drift',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'essafaria-policy-age-')),identity=path.join(dir,'synthetic-key'),binary=process.env.DR_LOCAL_AGE_BIN??'age',keygen=process.env.DR_LOCAL_AGE_KEYGEN_BIN??'age-keygen';
  try{
   if(spawnSync(keygen,['-o',identity],{timeout:30000,shell:false}).status!==0)throw Error('SYNTHETIC_AGE_REQUIRED');
   const recipient=spawnSync(keygen,['-y',identity],{encoding:'utf8',timeout:30000,shell:false}).stdout.trim();
   const rsa=generateKeyPairSync('rsa',{modulusLength:3072}),now=Date.now(),at=new Date(now).toISOString();
   const objects=[{id:'11111111-1111-4111-8111-111111111111',bucket:'documents',name:'synthetic/file.pdf',version:'v1',updatedAt:at,declaredBytes:3}];
   const signed=attestObjectRecovery({ciphertext:encryptObjectArchive(buildObjectArchive(objects,[Buffer.from('abc')]),recipient,binary),identity,objects,binary,signer:rsa.privateKey,operatorSha:'a'.repeat(40),inventorySha256:'b'.repeat(64),recipientFileSha256:'c'.repeat(64),sourceObservedAt:at,sourcePayloads:[Buffer.from('abc')],recipient});
   const choice={kind:'SUPABASE_MANAGED_PHYSICAL_SIGNED_OBJECTS_V2',selectedBy:'Owner',selectedAt:at,evidenceSha256:'e'.repeat(64),acceptedGapSeconds:86400,maxBackupAgeSeconds:86400,minRetentionRemainingSeconds:86400,acceptedRisks:[...policy.MANAGED_BACKUP_RISKS,'OWNER_MANAGED_NOT_INDEPENDENT','NO_VERIFIED_OFFSITE_OBJECT_COPY','OBJECT_AND_DATABASE_POINTS_NOT_ATOMIC'],externalRecoveryEvidenceSha256:'f'.repeat(64),externalRecoveryOperatorSha:'a'.repeat(40),ownerAgeRecipientSha256:'c'.repeat(64)};
   const evidence={version:1,kind:'SUPABASE_MANAGED_PHYSICAL_BACKUP_EVIDENCE',projectRef:'xgetzgixalrsmuvfthpf',database:'postgres',observedAt:at,retentionDays:7,independentRestoreStatus:'NOT_PERFORMED',source:{kind:'SUPABASE_MANAGEMENT_API',requestPath:'/v1/projects/xgetzgixalrsmuvfthpf/database/backups',responseSha256:'d'.repeat(64)},backup:{id:1,is_physical_backup:true,status:'COMPLETED',inserted_at:new Date(now-3600000).toISOString()},externalStorage:{kind:'EXTERNAL_OBJECT_RECOVERY_REQUIRED',checkedAt:at,inventorySha256:'b'.repeat(64),objectCount:1,referenceCount:0,objectSetSha256:objectSetDigest(objects),declaredBytes:3}};
   const validate=(e:unknown=evidence,s:unknown=signed,c:unknown=choice)=>policy.validateManagedExternalBackupEvidence(e,c as never,s,{now:now+1000,recipient:rsa.publicKey});
   expect(()=>validate()).not.toThrow();
   expect(validate()).toMatchObject({status:'MANAGED_PHYSICAL_SIGNED_OBJECTS_POLICY_PASS',independentRestoreStatus:'NOT_PERFORMED',offsiteVerified:false});
   expect(()=>policy.validateManagedBackupEvidence(evidence,{...choice,kind:'SUPABASE_MANAGED_PHYSICAL_V1',acceptedRisks:[...policy.MANAGED_BACKUP_RISKS]} as never,{now})).toThrow();
   for(const e of [{...evidence,externalStorage:{...evidence.externalStorage,objectCount:2}},{...evidence,externalStorage:{...evidence.externalStorage,declaredBytes:4}},{...evidence,externalStorage:{...evidence.externalStorage,objectSetSha256:'0'.repeat(64)}},{...evidence,externalStorage:{...evidence.externalStorage,referenceCount:1}},{...evidence,externalStorage:{...evidence.externalStorage,checkedAt:new Date(now-7200000).toISOString()}},{...evidence,projectRef:'nqudhszgodmzckautrby'}])expect(()=>validate(e)).toThrow();
   for(const s of [{...signed,signature:''},{...signed,proof:{...signed.proof,recoveredBytes:4}},{...signed,proof:{...signed.proof,offsiteVerified:true}},{...signed,proof:{...signed.proof,operatorSha:'0'.repeat(40)}}])expect(()=>validate(evidence,s)).toThrow();
   expect(()=>validate(evidence,signed,{...choice,acceptedRisks:[...policy.MANAGED_BACKUP_RISKS]})).toThrow();
   // The real production gate defaults to its committed owner recipient, never this disposable fixture key.
   expect(()=>policy.validateManagedExternalBackupEvidence(evidence,choice as never,signed,{now})).toThrow();
   expect(readFileSync(identity).length).toBeGreaterThan(0);
  }finally{if(path.dirname(dir)===tmpdir()&&path.basename(dir).startsWith('essafaria-policy-age-'))rmSync(dir,{recursive:true,force:true});}
 });
});
