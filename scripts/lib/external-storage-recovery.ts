/** Private read-only object backup. No upload/delete operation exists here. */
import {createHash,constants,sign,verify,type KeyObject} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {recipientFingerprint} from './key-custody';
import type {PoolClient} from 'pg';
export interface ExternalObject {id:string;bucket:string;name:string;version:string;updatedAt:string;declaredBytes:number;}
const project='xgetzgixalrsmuvfthpf',limit=8*1024*1024;
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
export function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
export function checkedObjects(objects:ExternalObject[]):ExternalObject[] {
 if(!Array.isArray(objects)||objects.length<1||objects.length>4)throw Error('EXACT_BOUNDED_OBJECT_SET_REQUIRED');
 const checked=objects.map(o=>{
  if(!o||!(/^[a-zA-Z0-9-]{1,128}$/).test(o.id)||o.bucket!=='documents'||typeof o.name!=='string'||!o.name.length||o.name.length>1024||/[\x00-\x1f\x7f]/.test(o.name)||o.name.split('/').some(s=>!s||s==='.'||s==='..')||typeof o.version!=='string'||!o.version.length||o.version.length>200||!Number.isFinite(Date.parse(o.updatedAt))||!Number.isSafeInteger(o.declaredBytes)||o.declaredBytes<1||o.declaredBytes>limit)throw Error('INVALID_OBJECT_IDENTITY_OR_SIZE');
  return {id:o.id,bucket:o.bucket,name:o.name,version:o.version,updatedAt:o.updatedAt,declaredBytes:o.declaredBytes};
 }).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 if(new Set(checked.map(o=>o.id)).size!==checked.length||new Set(checked.map(o=>o.name)).size!==checked.length||checked.reduce((s,o)=>s+o.declaredBytes,0)>limit/2)throw Error('DUPLICATE_OR_OVERLIMIT_OBJECT_SET');
 return checked;
}
export function objectSetDigest(objects:ExternalObject[]):string{return hash(canonical(checkedObjects(objects)));}
/** Names remain private in memory; callers publish only set digests and counts. */
export async function readExternalObjectInventory(client:PoolClient,schema='storage'):Promise<ExternalObject[]> {
 if(!/^[a-z_]+$/.test(schema)||(await client.query('show transaction_read_only')).rows[0].transaction_read_only!=='on')throw Error('READ_ONLY_OBJECT_INVENTORY_REQUIRED');
 const result=await client.query(`select o.id::text,o.bucket_id bucket,o.name,o.version,to_char(o.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "updatedAt",case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else null end as "declaredBytes",b.public from "${schema}".objects o left join "${schema}".buckets b on b.id=o.bucket_id order by o.bucket_id,o.name`);
 if(!result.rowCount)return [];
 if(result.rows.some(r=>r.public!==false))throw Error('PRIVATE_BUCKET_SOURCE_REQUIRED');
 return checkedObjects(result.rows.map(r=>({...r,declaredBytes:Number(r.declaredBytes)})));
}
export function buildObjectArchive(objects:ExternalObject[],payloads:Buffer[]):Buffer {
 checkedObjects(objects);if(payloads.length!==objects.length)throw Error('COMPLETE_PAYLOAD_SET_REQUIRED');
 const entries=objects.map((o,i)=>{const b=payloads[i]!;if(!Buffer.isBuffer(b)||b.length!==o.declaredBytes)throw Error('OBJECT_SIZE_MISMATCH');return {object:o,sha256:hash(b),data:b.toString('base64')};});
 const raw=Buffer.from(canonical({version:1,kind:'ESSAFARIA_PRIVATE_STORAGE_BYTES',projectRef:project,objectSetSha256:objectSetDigest(objects),entries}));
 if(raw.length>limit)throw Error('ARCHIVE_SIZE_LIMIT');return raw;
}
function age(binary:string,args:string[],input:Buffer):Buffer {
 const env:NodeJS.ProcessEnv={NODE_ENV:'production',...Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SystemRoot|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|HOME|USERPROFILE)$/i.test(k)))};
 const r=spawnSync(binary,args,{input,env,shell:false,windowsHide:true,timeout:30000,maxBuffer:limit+65536});
 if(r.status!==0||r.error||r.stdout.length>limit)throw Error('AGE_OPERATION_FAILED_NO_PRIVATE_OUTPUT');return r.stdout;
}
export function encryptObjectArchive(archive:Buffer,recipient:string,binary:string):Buffer {
 if(archive.length>limit||!/^age1[0-9a-z]{58}$/.test(recipient))throw Error('INVALID_PRIVATE_ARCHIVE_RECIPIENT_OR_SIZE');
 const encrypted=age(binary,['--encrypt','--recipient',recipient],archive);
 if(encrypted.subarray(0,22).toString()!=='age-encryption.org/v1\n')throw Error('AGE_CIPHERTEXT_REQUIRED');return encrypted;
}
export function assertAgeIdentityRecipient(identity:string,recipient:string,binary:string):void {
 const keygen=path.dirname(binary)==='.'?'age-keygen':path.join(path.dirname(binary),path.extname(binary).toLowerCase()==='.exe'?'age-keygen.exe':'age-keygen');
 const derived=age(keygen,['-y',identity],Buffer.alloc(0)).toString('utf8').trim();
 if(derived!==recipient)throw Error('REGISTERED_AGE_RECIPIENT_AND_PRIVATE_IDENTITY_MISMATCH');
}
export interface ExternalRecoveryProof {
 status:'LOCAL_EXTERNAL_OBJECT_RECOVERY_PASS';projectRef:string;bucket:'documents';scope:'LOCAL_ONLY';offsiteVerified:false;independentRestoreStatus:'NOT_PERFORMED';
 objectCount:number;declaredBytes:number;recoveredBytes:number;objectSetSha256:string;payloadSetSha256:string;manifestSha256:string;ciphertextSha256:string;ciphertextBytes:number;
}
export function verifyObjectArchive(ciphertext:Buffer,identity:string,objects:ExternalObject[],binary:string):ExternalRecoveryProof {
 const expected=checkedObjects(objects);if(ciphertext.length>limit||ciphertext.subarray(0,22).toString()!=='age-encryption.org/v1\n')throw Error('AGE_CIPHERTEXT_REQUIRED');
 const raw=age(binary,['--decrypt','--identity',identity],ciphertext);
 try{
  const value=JSON.parse(raw.toString('utf8'));
  if(value.version!==1||value.kind!=='ESSAFARIA_PRIVATE_STORAGE_BYTES'||value.projectRef!==project||value.objectSetSha256!==objectSetDigest(expected)||!Array.isArray(value.entries)||value.entries.length!==expected.length)throw Error('ARCHIVE_IDENTITY_OR_COMPLETENESS_MISMATCH');
  const actual=checkedObjects(value.entries.map((e:{object:ExternalObject})=>e.object));if(canonical(actual)!==canonical(expected))throw Error('SOURCE_OBJECT_GENERATION_CHANGED');
  let total=0;const payloads:Array<{id:string;sha256:string}>=[];
  for(const e of value.entries){if(typeof e.data!=='string'||!(/^[a-f0-9]{64}$/).test(e.sha256))throw Error('INVALID_ARCHIVE_PAYLOAD');const bytes=Buffer.from(e.data,'base64');try{if(bytes.toString('base64')!==e.data||bytes.length!==e.object.declaredBytes||hash(bytes)!==e.sha256)throw Error('ARCHIVE_PAYLOAD_INTEGRITY_FAILED');total+=bytes.length;payloads.push({id:e.object.id,sha256:e.sha256});}finally{bytes.fill(0);}}
  return {status:'LOCAL_EXTERNAL_OBJECT_RECOVERY_PASS',projectRef:project,bucket:'documents',scope:'LOCAL_ONLY',offsiteVerified:false,independentRestoreStatus:'NOT_PERFORMED',objectCount:expected.length,declaredBytes:expected.reduce((s,o)=>s+o.declaredBytes,0),recoveredBytes:total,objectSetSha256:objectSetDigest(expected),payloadSetSha256:hash(canonical(payloads.sort((a,b)=>a.id<b.id?-1:1))),manifestSha256:hash(raw),ciphertextSha256:hash(ciphertext),ciphertextBytes:ciphertext.length};
 }catch{throw Error('PRIVATE_ARCHIVE_RECOVERY_FAILED');}finally{raw.fill(0);}
}
export interface SignedRecoveryAttestation {proof:ExternalRecoveryProof&{operatorSha:string;inventorySha256:string;recipientFileSha256:string;sourceObservedAt:string;checkedAt:string};signature:string;signerSha256:string;}
function rsaKey(key:KeyObject){if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength??0)<3072)throw Error('OWNER_RSA3072_SIGNING_KEY_REQUIRED');}
export function attestObjectRecovery(input:{ciphertext:Buffer;identity:string;objects:ExternalObject[];binary:string;signer:KeyObject;operatorSha:string;inventorySha256:string;recipientFileSha256:string;sourceObservedAt:string;sourcePayloads:Buffer[];recipient:string}):SignedRecoveryAttestation {
 rsaKey(input.signer);if(input.signer.type!=='private'||!(/^[a-f0-9]{40}$/).test(input.operatorSha)||![input.inventorySha256,input.recipientFileSha256].every(s=>(/^[a-f0-9]{64}$/).test(s))||!Number.isFinite(Date.parse(input.sourceObservedAt))||Date.parse(input.sourceObservedAt)>Date.now()||Date.now()-Date.parse(input.sourceObservedAt)>3600000)throw Error('FRESH_BOUND_RECOVERY_CONTEXT_REQUIRED');
 assertAgeIdentityRecipient(input.identity,input.recipient,input.binary);
 const proof={...verifyObjectArchive(input.ciphertext,input.identity,input.objects,input.binary),operatorSha:input.operatorSha,inventorySha256:input.inventorySha256,recipientFileSha256:input.recipientFileSha256,sourceObservedAt:input.sourceObservedAt,checkedAt:new Date().toISOString()};
 const source=buildObjectArchive(input.objects,input.sourcePayloads);
 try{if(hash(source)!==proof.manifestSha256)throw Error('RECOVERED_BYTES_DO_NOT_MATCH_PROVIDER_DOWNLOAD');}finally{source.fill(0);}
 return {proof,signature:sign('sha256',Buffer.from(canonical(proof)),{key:input.signer,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32}).toString('base64'),signerSha256:recipientFingerprint(input.signer)};
}
export function verifyRecoveryAttestation(value:unknown,signer:KeyObject):SignedRecoveryAttestation['proof'] {
 rsaKey(signer);const e=value as SignedRecoveryAttestation;
 if(!e||e.signerSha256!==recipientFingerprint(signer)||typeof e.signature!=='string'||!verify('sha256',Buffer.from(canonical(e.proof)),{key:signer,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32},Buffer.from(e.signature,'base64')))throw Error('AUTHENTICATED_OWNER_RECOVERY_ATTESTATION_REQUIRED');return e.proof;
}
export async function downloadExternalObjects(objects:ExternalObject[],token:string,fetcher:typeof fetch=fetch):Promise<Buffer[]> {
 checkedObjects(objects);if(!token||token.length>16384||/[\r\n]/.test(token))throw Error('PRIVATE_READ_CREDENTIAL_REQUIRED');const payloads:Buffer[]=[];
 try{for(const o of objects){
  const headers:Record<string,string>={apikey:token};if(!token.startsWith('sb_secret_'))headers.Authorization=`Bearer ${token}`;
  const url=`https://${project}.supabase.co/storage/v1/object/authenticated/documents/${o.name.split('/').map(encodeURIComponent).join('/')}`;
  const r=await fetcher(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(r.status!==200){await r.body?.cancel().catch(()=>{});throw Error('EXTERNAL_OBJECT_READ_FAILED');}
  const declared=r.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)!==o.declaredBytes)){await r.body?.cancel().catch(()=>{});throw Error('EXTERNAL_OBJECT_READ_FAILED');}
  const reader=r.body?.getReader();if(!reader)throw Error('EXTERNAL_OBJECT_READ_FAILED');const chunks:Buffer[]=[];let size=0;
  try{for(;;){const c=await reader.read();if(c.done)break;size+=c.value.length;if(size>o.declaredBytes){await reader.cancel();throw Error('EXTERNAL_OBJECT_READ_FAILED');}chunks.push(Buffer.from(c.value));}if(size!==o.declaredBytes)throw Error('EXTERNAL_OBJECT_READ_FAILED');payloads.push(Buffer.concat(chunks,size));}finally{reader.releaseLock();for(const b of chunks)b.fill(0);}
 }return payloads;}catch{for(const b of payloads)b.fill(0);throw Error('EXTERNAL_OBJECT_READ_FAILED');}
}
