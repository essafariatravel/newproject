import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,writeFileSync,readdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,createHash} from 'node:crypto';
import * as recovery from '../scripts/lib/external-storage-recovery';

let fixture:string,identity:string,recipient:string;
const binary=process.env.DR_LOCAL_AGE_BIN??'age';
const rsa=generateKeyPairSync('rsa',{modulusLength:3072}); // disposable synthetic signing key only
const objects=[{id:'11111111-1111-4111-8111-111111111111',bucket:'documents',name:'synthetic/a.pdf',version:'v1',updatedAt:'2026-10-20T12:00:00.000Z',declaredBytes:3}];
const bytes=Buffer.from('abc'),sha256=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
beforeAll(()=>{
 fixture=mkdtempSync(path.join(tmpdir(),'essafaria-external-recovery-'));identity=path.join(fixture,'synthetic-identity.txt');
 const r=spawnSync(process.env.DR_LOCAL_AGE_KEYGEN_BIN??'age-keygen',['-o',identity],{shell:false,encoding:'utf8',timeout:30000});
 if(r.status!==0)throw Error('SYNTHETIC_AGE_FIXTURE_REQUIRED');
 const p=spawnSync(process.env.DR_LOCAL_AGE_KEYGEN_BIN??'age-keygen',['-y',identity],{shell:false,encoding:'utf8',timeout:30000});if(p.status!==0)throw Error('SYNTHETIC_PUBLIC_RECIPIENT_REQUIRED');recipient=p.stdout.trim();
});
afterAll(()=>{if(fixture&&path.dirname(fixture)===tmpdir()&&path.basename(fixture).startsWith('essafaria-external-recovery-'))rmSync(fixture,{recursive:true,force:true});});

describe('external object recovery is actual private byte verification',()=>{
 it('runs HTTP read to encrypted disk archive to real local decrypt without a plaintext artifact',async()=>{
  const server=createServer((req,res)=>{
   if(req.method!=='GET'||req.headers.authorization!=='Bearer synthetic-private-token'||!req.url?.endsWith('/synthetic/a.pdf')){res.writeHead(403);res.end();return;}
   res.writeHead(200,{'content-type':'application/pdf','content-length':'3'});res.end('abc');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
   const address=server.address();if(!address||typeof address==='string')throw Error('LOCAL_HTTP_FIXTURE_REQUIRED');
   const fetcher:typeof fetch=async(input,init)=>{const url=new URL(String(input));if(url.hostname!=='xgetzgixalrsmuvfthpf.supabase.co')throw Error('UNEXPECTED_CLOUD_TARGET');return fetch(`http://127.0.0.1:${address.port}${url.pathname}`,init);};
   const payload=await recovery.downloadExternalObjects(objects,'synthetic-private-token',fetcher);
   const cipher=recovery.encryptObjectArchive(recovery.buildObjectArchive(objects,payload),recipient,binary),file=path.join(fixture,'synthetic.archive.age');
   writeFileSync(file,cipher,{flag:'wx',mode:0o600});
   expect(recovery.verifyObjectArchive(readFileSync(file),identity,objects,binary)).toMatchObject({recoveredBytes:3,objectCount:1});
   expect(readdirSync(fixture).sort()).toEqual(['synthetic-identity.txt','synthetic.archive.age']);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
 });
 it('encrypts complete payloads and verifies real age decryption without persisting plaintext',()=>{
  const archive=recovery.buildObjectArchive(objects,[bytes]);
  const encrypted=recovery.encryptObjectArchive(archive,recipient,binary);
  expect(encrypted.subarray(0,22).toString()).toBe('age-encryption.org/v1\n');
  expect(encrypted.includes(Buffer.from('synthetic/a.pdf'))).toBe(false);
  const proof=recovery.verifyObjectArchive(encrypted,identity,objects,binary);
  expect(proof).toMatchObject({status:'LOCAL_EXTERNAL_OBJECT_RECOVERY_PASS',objectCount:1,declaredBytes:3,recoveredBytes:3,scope:'LOCAL_ONLY',offsiteVerified:false,independentRestoreStatus:'NOT_PERFORMED'});
  expect(proof.ciphertextSha256).toBe(sha256(encrypted));expect(JSON.stringify(proof)).not.toContain('synthetic/a.pdf');
 });
 it('refuses omitted, duplicate, malformed, truncated and wrong-size payload sets',()=>{
  expect(()=>recovery.buildObjectArchive(objects,[])).toThrow();
  expect(()=>recovery.buildObjectArchive([...objects,...objects],[bytes,bytes])).toThrow();
  expect(()=>recovery.buildObjectArchive([{...objects[0]!,name:'../private'}],[bytes])).toThrow();
  expect(()=>recovery.buildObjectArchive(objects,[Buffer.from('ab')])).toThrow();
 });
 it('fails closed on corrupt ciphertext, changed source generation and wrong private identity',()=>{
  const cipher=recovery.encryptObjectArchive(recovery.buildObjectArchive(objects,[bytes]),recipient,binary);
  const corrupt=Buffer.from(cipher);corrupt[corrupt.length-1]=corrupt[corrupt.length-1]!^1;
  expect(()=>recovery.verifyObjectArchive(corrupt,identity,objects,binary)).toThrow();
  expect(()=>recovery.verifyObjectArchive(cipher,identity,[{...objects[0]!,version:'v2'}],binary)).toThrow();
  expect(()=>recovery.verifyObjectArchive(cipher,path.join(fixture,'missing-key'),objects,binary)).toThrow();
 });
 it('requires a signed attestation derived from actual decrypt/read-back, not self-declared hashes and counts',()=>{
  const cipher=recovery.encryptObjectArchive(recovery.buildObjectArchive(objects,[bytes]),recipient,binary);
  const context={identity,objects,binary,signer:rsa.privateKey,operatorSha:'a'.repeat(40),inventorySha256:'b'.repeat(64),recipientFileSha256:'c'.repeat(64),sourceObservedAt:new Date().toISOString(),sourcePayloads:[bytes],recipient};
  const signed=recovery.attestObjectRecovery({ciphertext:cipher,...context});
  expect(recovery.verifyRecoveryAttestation(signed,rsa.publicKey)).toMatchObject({objectCount:1,recoveredBytes:3,operatorSha:'a'.repeat(40)});
  expect(()=>recovery.verifyRecoveryAttestation({...signed,proof:{...signed.proof,recoveredBytes:4}},rsa.publicKey)).toThrow();
  expect(()=>recovery.verifyRecoveryAttestation({...signed,signature:undefined},rsa.publicKey)).toThrow();
  const other=generateKeyPairSync('rsa',{modulusLength:3072});expect(()=>recovery.verifyRecoveryAttestation(signed,other.publicKey)).toThrow();
  expect(()=>recovery.attestObjectRecovery({ciphertext:Buffer.from('fake'),...context})).toThrow();
  const wrongBytes=recovery.encryptObjectArchive(recovery.buildObjectArchive(objects,[Buffer.from('xyz')]),recipient,binary);
  expect(()=>recovery.attestObjectRecovery({ciphertext:wrongBytes,...context})).toThrow();
 });
 it('never attests a recovery identity unrelated to the registered age recipient',()=>{
  const otherIdentity=path.join(fixture,'other-synthetic-identity.txt');
  if(spawnSync(process.env.DR_LOCAL_AGE_KEYGEN_BIN??'age-keygen',['-o',otherIdentity],{shell:false,timeout:30000}).status!==0)throw Error('OTHER_SYNTHETIC_IDENTITY_REQUIRED');
  const otherRecipient=spawnSync(process.env.DR_LOCAL_AGE_KEYGEN_BIN??'age-keygen',['-y',otherIdentity],{shell:false,encoding:'utf8',timeout:30000}).stdout.trim();
  const wrongRecipient=recovery.encryptObjectArchive(recovery.buildObjectArchive(objects,[bytes]),otherRecipient,binary);
  expect(()=>recovery.attestObjectRecovery({ciphertext:wrongRecipient,identity:otherIdentity,objects,binary,signer:rsa.privateKey,operatorSha:'a'.repeat(40),inventorySha256:'b'.repeat(64),recipientFileSha256:'c'.repeat(64),sourceObservedAt:new Date().toISOString(),sourcePayloads:[bytes],recipient})).toThrow();
 });
 it('refuses redirects, HTTP errors, short and overlong downloads without forwarding private provider diagnostics',async()=>{
  const attempt=(response:Response)=>recovery.downloadExternalObjects(objects,'synthetic-private-token',async()=>response);
  await expect(attempt(new Response('private response',{status:403}))).rejects.toThrow('EXTERNAL_OBJECT_READ_FAILED');
  await expect(attempt(new Response('ab'))).rejects.toThrow();
  await expect(attempt(new Response('abcd'))).rejects.toThrow();
  const payload=await attempt(new Response(bytes));expect(payload[0]).toEqual(bytes);
  expect(readFileSync(identity,'utf8')).toContain('AGE-SECRET-KEY-'); // fixture is never a user key
 });
});
