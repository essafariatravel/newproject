/** Owner-private operator: bounded read-only source/object access; encrypted files only. */
import {createHash,createPrivateKey,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {Pool} from 'pg';
import {guardedProductionPoolConfig} from './prod-release';
import {assertCleanReleaseCheckout} from './lib/release-safeguards';
import {privateArtifactPath} from './lib/dr-private-path';
import {recipientFingerprint} from './lib/key-custody';
import {readManagedStorageInventory} from './managed-backup-evidence';
import {readExternalObjectInventory,objectSetDigest,downloadExternalObjects,buildObjectArchive,encryptObjectArchive,verifyObjectArchive,attestObjectRecovery,assertAgeIdentityRecipient} from './lib/external-storage-recovery';

const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function main(){
 if(process.env.EXTERNAL_STORAGE_AUTHORIZATION!=='OWNER_PHASE2B0')throw Error('BLOCKED_EXTERNAL_ARCHIVE_AUTHORIZATION');
 const existing=process.env.EXTERNAL_STORAGE_EXISTING_ARCHIVE;
 const token=process.env.EXTERNAL_STORAGE_READ_TOKEN;
 if(!token)throw Error('BLOCKED_PRIVATE_STORAGE_READ_CREDENTIAL');
 if(process.env.EXTERNAL_STORAGE_PROJECT_REF!=='xgetzgixalrsmuvfthpf'||process.env.EXTERNAL_STORAGE_APPROVAL_REFERENCE!=='github-pr20-comment6292040915')throw Error('BLOCKED_EXACT_EXTERNAL_ARCHIVE_SCOPE');
 const operatorSha=process.env.EXTERNAL_STORAGE_OPERATOR_SHA??'';assertCleanReleaseCheckout(operatorSha);
 const config=guardedProductionPoolConfig();
 const output=privateArtifactPath(process.env.EXTERNAL_STORAGE_ARCHIVE_DIR??'','Private archive directory',{requireAbsolute:true});
 const publicFile=privateArtifactPath(process.env.EXTERNAL_STORAGE_AGE_RECIPIENT??'','Existing owner age recipient',{requireAbsolute:true});
 const recipientBytes=readFileSync(publicFile),recipientFileSha256=hash(recipientBytes);
 if(recipientFileSha256!==process.env.EXTERNAL_STORAGE_AGE_RECIPIENT_SHA256)throw Error('BLOCKED_OWNER_AGE_RECIPIENT_BINDING');
 const recipient=recipientBytes.toString('utf8').trim();
 const identity=privateArtifactPath(process.env.EXTERNAL_STORAGE_AGE_IDENTITY??'','Owner age identity on separate private device',{requireAbsolute:true});
 const binary=process.env.DR_LOCAL_AGE_BIN??'age';
 assertAgeIdentityRecipient(identity,recipient,binary);
 let signer;
 if(process.env.EXTERNAL_STORAGE_ATTEST_EXISTING_OWNER_KEY==='YES'){
  const chunks:Buffer[]=[];let size=0;
  try{for await(const chunk of process.stdin){size+=chunk.length;if(size>32768)throw Error('BLOCKED_PRIVATE_SIGNER_INPUT');chunks.push(Buffer.from(chunk));}const secret=Buffer.concat(chunks);try{signer=createPrivateKey(secret);}finally{secret.fill(0);}}
  finally{for(const chunk of chunks)chunk.fill(0);}
  if(recipientFingerprint(signer)!=='f82fa8d7fc09b01a2487a02a6d36d3937c3ade3d6ff0a84c205882bbdb526044')throw Error('BLOCKED_EXISTING_OWNER_SIGNER_BINDING');
 }
 const pool=new Pool({...config,max:1});
 try{const client=await pool.connect();try{
  if(!(client as unknown as {connection:{stream:{authorized:boolean}}}).connection.stream.authorized)throw Error('BLOCKED_VERIFIED_SOURCE_TLS');
  const capture=async()=>{
   await client.query('begin isolation level repeatable read read only');
   try{
    await client.query("set local statement_timeout='30s'");
    const id=(await client.query("select current_database() db,to_regnamespace('visa_os') is not null present,(select count(*)::int from storage.objects where created_at>=timestamptz '2026-08-05 00:00:00+00' and created_at<timestamptz '2026-08-06 00:00:00+00') approved_creation_day_count")).rows[0];
    if(id.db!=='postgres'||!id.present||id.approved_creation_day_count!==4)throw Error('BLOCKED_SOURCE_IDENTITY_OR_OBJECT_SCOPE_DRIFT');
    const inventory=await readManagedStorageInventory(client),objects=await readExternalObjectInventory(client);
    if(inventory.status!=='BLOCKED_EXTERNAL_STORAGE_COVERAGE'||inventory.externalStorage.referenceCount!==0||objects.length!==4||objects.reduce((s,o)=>s+o.declaredBytes,0)!==744452||objectSetDigest(objects)!==inventory.externalStorage.objectSetSha256)throw Error('BLOCKED_SOURCE_IDENTITY_OR_OBJECT_SCOPE_DRIFT');
    return {inventory,objects};
   }finally{await client.query('rollback');}
  };
  const before=await capture();const payloads=await downloadExternalObjects(before.objects,token);
  try{let cipher:Buffer;
   const raw=buildObjectArchive(before.objects,payloads);
   try{
    if(existing){const old=readFileSync(privateArtifactPath(existing,'Existing encrypted object archive',{requireAbsolute:true}));const prior=verifyObjectArchive(old,identity,before.objects,binary);if(prior.manifestSha256!==hash(raw))throw Error('BLOCKED_EXISTING_ARCHIVE_NOT_PROVIDER_BYTES');}
    // Even replay produces a new generation encrypted only to the registered recipient.
    cipher=encryptObjectArchive(raw,recipient,binary);
   }finally{raw.fill(0);}
   mkdirSync(output,{recursive:true,mode:0o700});
   const archiveFile=path.join(output,'production-storage-'+new Date().toISOString().replace(/[-:.]/g,'')+'-'+randomUUID()+'.age');
   writeFileSync(archiveFile,cipher,{flag:'wx',mode:0o600});
  // Verify bytes read back from the actual encrypted file, not only a transient buffer.
  const disk=readFileSync(archiveFile);if(hash(disk)!==hash(cipher))throw Error('BLOCKED_CIPHERTEXT_DISK_INTEGRITY');
  const after=await capture();
  if(after.inventory.externalStorage.inventorySha256!==before.inventory.externalStorage.inventorySha256||objectSetDigest(after.objects)!==objectSetDigest(before.objects))throw Error('BLOCKED_SOURCE_CHANGED_DURING_ARCHIVE');
  const local=verifyObjectArchive(disk,identity,before.objects,binary);
  const evidence=signer?attestObjectRecovery({ciphertext:disk,identity,objects:before.objects,binary,signer,operatorSha,inventorySha256:before.inventory.externalStorage.inventorySha256,recipientFileSha256,sourceObservedAt:before.inventory.externalStorage.checkedAt,sourcePayloads:payloads,recipient}):{status:'UNSIGNED_LOCAL_RECOVERY_NOT_RELEASE_COVERAGE',proof:local};
  const receipt=archiveFile+'.'+randomUUID()+'.recovery.json';writeFileSync(receipt,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:signer?'SIGNED_LOCAL_OBJECT_RECOVERY_PASS':'UNSIGNED_LOCAL_RECOVERY_NOT_RELEASE_COVERAGE',objectCount:4,recoveredBytes:local.recoveredBytes,ciphertextSha256:local.ciphertextSha256,archiveFile,receipt,offsiteVerified:false,independentRestoreStatus:'NOT_PERFORMED',productionWrites:0,objectDeletions:0}));
  }finally{for(const bytes of payloads)bytes.fill(0);}
 }finally{await client.query('rollback').catch(()=>{});client.release();}}finally{await pool.end();}
}
if(/external-storage-backup\.(ts|js)$/.test(process.argv[1]??''))main().catch(error=>{const text=error instanceof Error?error.message:'';console.error(JSON.stringify({status:/^BLOCKED_[A-Z_]+$/.test(text)?text:'BLOCKED_PRIVATE_EXTERNAL_RECOVERY_OPERATION',productionWrites:0,objectDeletions:0,privateDetailsSuppressed:true}));process.exitCode=1;});
