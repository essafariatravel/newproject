import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest';
import {candidateSuiteSetup} from './helpers/candidate-migrations';
import {agencyByEmail,userByEmail} from './helpers/fixtures';
import {pool} from '@/lib/db';
import {createDraftApplication,getDecisionDocuments} from '@/lib/applications';
import {createDocumentRetentionService} from '@/lib/document-retention';
import * as storage from '@/lib/storage';
import {removeStorageProposal} from './helpers/storage-proposal';

candidateSuiteSetup();
const objects=new Map<string,{data:Buffer;mime:string}>();
let deleteFault=false,falseDelete=false,readFault=false,deleteTimeout=false;
const server=createServer(async(req,res)=>{
 if(req.headers.authorization!=='Bearer fictional-retention-local'){res.writeHead(403);return res.end();}
 const key=decodeURIComponent((req.url??'').replace('/storage/v1/object/visa-documents-preview/',''));
 if(req.method==='POST'){
  if(objects.has(key)){res.writeHead(409);return res.end();}
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
  objects.set(key,{data:Buffer.concat(chunks),mime:String(req.headers['content-type'])});res.writeHead(200);return res.end('{}');
 }
 if(req.method==='DELETE'){
  if(deleteFault){res.writeHead(503);return res.end();}
  if(deleteTimeout){objects.delete(key);return;}
  if(!falseDelete)objects.delete(key);res.writeHead(204);return res.end();
 }
 if(readFault){res.writeHead(503);return res.end();}
 const object=objects.get(key);if(!object){res.writeHead(404,{'content-type':'application/json'});return res.end('{"code":"NoSuchKey"}');}
 res.writeHead(200,{'content-type':object.mime});res.end(object.data);
});
beforeAll(async()=>{
 const ddl=await pool.connect();try{await ddl.query('begin;set local search_path to public,pg_catalog');await ddl.query(readFileSync('migrations/proposals/0036_storage_operations.sql','utf8'));await ddl.query('commit');}catch(error){await ddl.query('rollback');throw error;}finally{ddl.release();}
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw Error('LOCAL_BIND_REQUIRED');
 for(const [key,value] of Object.entries({STORAGE_PROVIDER:'supabase',STORAGE_OPERATIONS_ENABLED:'local-qualification',STORAGE_LOCAL_HTTP_ORIGIN:`http://127.0.0.1:${address.port}`,SUPABASE_URL:`http://127.0.0.1:${address.port}`,SUPABASE_STORAGE_BUCKET:'visa-documents-preview',SUPABASE_SERVICE_ROLE_KEY:'fictional-retention-local'}))vi.stubEnv(key,value);
});
afterAll(async()=>{
 await storage.closeStorageOperations();vi.unstubAllEnvs();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
 await removeStorageProposal(pool);
});
const service=()=>createDocumentRetentionService(pool,{schema:'public',databaseUrl:'postgresql://postgres:postgres@localhost:5434/essafaria_test',enabled:true});
const decisionAt=new Date('2026-01-31T18:45:00Z');
async function fixture(){
 deleteFault=false;falseDelete=false;readFault=false;deleteTimeout=false;
 const actor=await userByEmail('superadmin@test.example'),agency=await agencyByEmail('ops@agencyb.example');
 const visaTypeId=(await pool.query("select id from visa_types where code='JP-BUS'")).rows[0].id;
 const app=await createDraftApplication({agencyId:agency.id,visaTypeId,createdBy:actor}),docId=randomUUID(),auditId=randomUUID(),key=`visa-documents/${app.id}/${docId}`;
 const data=Buffer.from(`%PDF-1.7 fictional final decision ${app.id}`),sha=createHash('sha256').update(data).digest('hex');
 await storage.storageProvider().put(key,data,'application/pdf');
 const client=await pool.connect();try{
  await client.query('begin');
  await client.query(`insert into documents(id,application_id,document_type_id,original_filename,mime_type,size_bytes,storage_key,status,uploaded_by,reviewed_by,reviewed_at,created_at,sha256)
   select $1,$2,id,'fictional.pdf','application/pdf',$3,$4,'ACCEPTED',$5,$5,$6,$6,$7 from document_types where code='DECISION_VISA_APPROVAL'`,[docId,app.id,data.length,key,actor.id,decisionAt,sha]);
  await storage.storageReferenceCommitted(client,key);
  await client.query("update applications set status_id=(select id from statuses where code='APPROVED'),decision_at=$2,created_at=$2,updated_at=$2 where id=$1",[app.id,decisionAt]);
  await client.query("insert into application_status_history(application_id,from_status_id,to_status_id,changed_by,created_at) select $1,f.id,t.id,$2,$3 from statuses f,statuses t where f.code='IN_PROCESS' and t.code='APPROVED'",[app.id,actor.id,decisionAt]);
  await client.query("insert into audit_logs(id,actor_id,action,entity,entity_id,metadata,created_at) values($1,$2,'APPLICATION_DECISION_RECORDED','application',$3,$4,$5)",[auditId,actor.id,app.id,JSON.stringify({outcome:'APPROVED',documentId:docId,from:'IN_PROCESS'}),decisionAt]);
  await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 await service().recordCaseControl(actor,{applicationId:app.id,reviewedDecisionAt:decisionAt,exceptionsReviewed:true,legalHold:false,evidenceReference:randomUUID()});
 const before=await service().dryRun(actor,app.id);
 await pool.query(`update document_retention_policy set execution_enabled=true,approved_at=now(),legal_review_reference=$1,coverage_fingerprint=$2,coverage_approved_at=now(),all_live_copies_covered=true,restore_reconciliation_approved=true,target_database=current_database(),target_schema='public',storage_provider='supabase'`,[randomUUID(),before.coverageFingerprint]);
 const plan=await service().dryRun(actor,app.id);
 return{actor,app,docId,key,data,plan};
}
const purge=(f:Awaited<ReturnType<typeof fixture>>)=>service().purge(f.actor,{applicationId:f.app.id,manifestHash:f.plan.manifestHash,confirmation:'DELETE_VISA_DOCUMENTS_AFTER_120_DAYS'});
describe('external J+120 retention on real PostgreSQL and HTTP storage',()=>{
 it.each(['coverage approval','target database','target schema','schema drift','open request','additional copy'])('stops physical reconciliation after %s invalidates a pending intent',async condition=>{
  const f=await fixture();deleteFault=true;expect((await purge(f)).status).toBe('PENDING');deleteFault=false;
  const policy=(await pool.query('select * from document_retention_policy where singleton')).rows[0];
  try{
   if(condition==='coverage approval')await pool.query('update document_retention_policy set coverage_approved_at=null');
   if(condition==='target database')await pool.query("update document_retention_policy set target_database='wrong'");
   if(condition==='target schema')await pool.query("update document_retention_policy set target_schema='wrong'");
   if(condition==='schema drift')await pool.query('alter table documents add column extra_storage_key text');
   if(condition==='open request')await pool.query("insert into document_requests(application_id,document_type_id,type,reason) select $1,id,'ADDITIONAL','fictional new request' from document_types where code='PASSPORT'",[f.app.id]);
   if(condition==='additional copy')await pool.query("insert into document_blobs(key,mime_type,size_bytes,data) values($1,'application/pdf',$2,$3)",['visa-documents/'+randomUUID()+'/'+randomUUID(),f.data.length,f.data]);
   await pool.query("update storage_operations set updated_at=now()-interval '2 minutes' where object_key=$1",[f.key]);
   await storage.reconcileStorageOperations(100);
   expect(objects.has(f.key)).toBe(true);
   expect((await pool.query('select state from storage_operations where object_key=$1',[f.key])).rows[0].state).not.toBe('DELETED');
   expect((await pool.query('select count(*)::int n from document_retention_receipts where application_id=$1',[f.app.id])).rows[0].n).toBe(0);
  }finally{
   if(condition==='schema drift')await pool.query('alter table documents drop column extra_storage_key');
   await pool.query('update document_retention_policy set coverage_approved_at=$1,policy_version=$2,target_database=$3,target_schema=$4',[policy.coverage_approved_at,policy.policy_version,policy.target_database,policy.target_schema]);
  }
 });
 it('refuses verifying a completed intent against a different bucket after restart',async()=>{
  const f=await fixture();expect((await purge(f)).status).toBe('PURGED');objects.set(f.key,{data:f.data,mime:'application/pdf'});
  await storage.closeStorageOperations();vi.stubEnv('SUPABASE_STORAGE_BUCKET','different-preview');
  try{await expect(purge(f)).rejects.toMatchObject({code:'RETENTION_TARGET_CHANGED'});expect(objects.has(f.key)).toBe(true);}
  finally{await storage.closeStorageOperations();vi.stubEnv('SUPABASE_STORAGE_BUCKET','visa-documents-preview');objects.delete(f.key);}
 });
 it('never presents WEBP, DOC or DOCX as an official final-decision proof',async()=>{
  const f=await fixture();
  for(const [mime,extension,data] of [['image/webp','webp',Buffer.from('RIFF0000WEBP')],['application/msword','doc',Buffer.from('d0cf11e0a1b11ae1','hex')],['application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx',Buffer.from('PK\x03\x04word/document.xml')]] as const){
   const id=randomUUID(),key=`visa-documents/${f.app.id}/${id}`;await storage.storageProvider().put(key,data,mime);
   const tx=await pool.connect();try{await tx.query('begin');await tx.query("insert into documents(id,application_id,document_type_id,original_filename,mime_type,size_bytes,storage_key,status,uploaded_by,reviewed_by,reviewed_at,sha256) select $1,$2,id,$3,$4,$5,$6,'ACCEPTED',$7,$7,$8,$9 from document_types where code='DECISION_VISA_APPROVAL'",[id,f.app.id,'fictional.'+extension,mime,data.length,key,f.actor.id,decisionAt,createHash('sha256').update(data).digest('hex')]);await storage.storageReferenceCommitted(tx,key);await tx.query('commit');}catch(error){await tx.query('rollback');throw error;}finally{tx.release();}
  }
  expect((await getDecisionDocuments(f.app.id)).map(doc=>doc.id)).toEqual([f.docId]);
 });
 it('covers every accepted document format, including owned objects without a live document reference',async()=>{
  const f=await fixture();
  const formats:[string,Buffer][]=[['image/jpeg',Buffer.from('ffd8ff','hex')],['image/png',Buffer.from('89504e470d0a1a0a','hex')],['image/webp',Buffer.from('RIFF0000WEBP')],['application/msword',Buffer.from('d0cf11e0a1b11ae1','hex')],['application/vnd.openxmlformats-officedocument.wordprocessingml.document',Buffer.from('PK\x03\x04word/document.xml')]];
  const keys=[f.key];
  for(const [mime,signature] of formats){const key=`visa-documents/${f.app.id}/${randomUUID()}`;await storage.storageProvider().put(key,Buffer.concat([signature,Buffer.from(f.app.id)]),mime);keys.push(key);}
  f.plan=await service().dryRun(f.actor,f.app.id);
  expect(f.plan.eligible).toBe(true);expect(f.plan.blobCount).toBe(6);
  expect((await purge(f)).status).toBe('PURGED');for(const key of keys)expect(objects.has(key)).toBe(false);
 });
 it('proves eligibility and physical absence before one immutable successful receipt',async()=>{
  const f=await fixture();expect(f.plan.eligible).toBe(true);expect(f.plan.blobCount).toBe(1);
  expect(await getDecisionDocuments(f.app.id)).toHaveLength(1);
  expect((await purge(f)).status).toBe('PURGED');expect(objects.has(f.key)).toBe(false);
  expect((await pool.query('select 1 from documents where id=$1',[f.docId])).rowCount).toBe(0);
  expect((await pool.query('select 1 from document_retention_receipts where application_id=$1',[f.app.id])).rowCount).toBe(1);
  expect((await purge(f)).status).toBe('ALREADY_PURGED');
 });
 it('keeps a durable pending intent on HTTP failure and resumes after process recreation',async()=>{
  const f=await fixture();deleteFault=true;expect((await purge(f)).status).toBe('PENDING');
  expect(objects.has(f.key)).toBe(true);expect((await pool.query('select 1 from document_retention_receipts where application_id=$1',[f.app.id])).rowCount).toBe(0);
  await storage.closeStorageOperations();deleteFault=false;expect((await purge(f)).status).toBe('PURGED');expect(objects.has(f.key)).toBe(false);
 });
 it('requires actual absence rather than HTTP DELETE acknowledgment',async()=>{
  const f=await fixture();falseDelete=true;expect((await purge(f)).status).toBe('PENDING');expect(objects.has(f.key)).toBe(true);
  falseDelete=false;expect((await purge(f)).status).toBe('PURGED');
 });
 it('retains pending state after a real DELETE timeout with lost acknowledgment, then verifies absence on retry',async()=>{
  const f=await fixture();deleteTimeout=true;expect((await purge(f)).status).toBe('PENDING');expect(objects.has(f.key)).toBe(false);
  expect((await pool.query('select 1 from document_retention_receipts where application_id=$1',[f.app.id])).rowCount).toBe(0);
  deleteTimeout=false;expect((await purge(f)).status).toBe('PURGED');
 },45000);
 it('does not claim a new success for restored bytes behind an existing receipt',async()=>{
  const f=await fixture();expect((await purge(f)).status).toBe('PURGED');objects.set(f.key,{data:f.data,mime:'application/pdf'});
  await expect(purge(f)).rejects.toMatchObject({code:'RETENTION_RESTORED_COPY_DETECTED'});objects.delete(f.key);
 });
 it('retries after final receipt/audit failure without inventing rollback of already deleted bytes',async()=>{
  const f=await fixture();await pool.query("create function external_retention_fail() returns trigger language plpgsql as $$begin if NEW.action='DOCUMENT_RETENTION_PURGED' then raise exception 'fictional receipt audit failure';end if;return NEW;end$$; create trigger external_retention_fail before insert on audit_logs for each row execute function external_retention_fail()");
  try{await expect(purge(f)).rejects.toThrow('fictional receipt audit failure');}finally{await pool.query('drop trigger external_retention_fail on audit_logs;drop function external_retention_fail()');}
  expect(objects.has(f.key)).toBe(false);expect((await pool.query('select state from document_retention_jobs where application_id=$1',[f.app.id])).rows[0].state).toBe('PENDING');
  expect((await pool.query('select 1 from document_retention_receipts where application_id=$1',[f.app.id])).rowCount).toBe(0);expect((await purge(f)).status).toBe('PURGED');
 });
 it('serializes concurrent attempts and leaves one successful global receipt',async()=>{
  const f=await fixture();const results=await Promise.all([purge(f),purge(f)]);expect(results.map(result=>result.status).sort()).toEqual(['ALREADY_PURGED','PURGED']);
  expect((await pool.query('select 1 from document_retention_receipts where application_id=$1',[f.app.id])).rowCount).toBe(1);
 });
 it('blocks a hold before arming, and stops pending physical work when a new hold arrives',async()=>{
  const f=await fixture();await service().recordCaseControl(f.actor,{applicationId:f.app.id,reviewedDecisionAt:decisionAt,exceptionsReviewed:true,legalHold:true,evidenceReference:randomUUID()});
  await expect(purge(f)).rejects.toMatchObject({code:'RETENTION_BLOCKED'});expect(objects.has(f.key)).toBe(true);
  const g=await fixture();deleteFault=true;expect((await purge(g)).status).toBe('PENDING');
  await service().recordCaseControl(g.actor,{applicationId:g.app.id,reviewedDecisionAt:decisionAt,exceptionsReviewed:true,legalHold:true,evidenceReference:randomUUID()});
  deleteFault=false;expect((await purge(g)).status).toBe('PENDING');expect(objects.has(g.key)).toBe(true);
 });
 it('refuses new uploads and metadata references while a durable purge is pending',async()=>{
  const f=await fixture();deleteFault=true;expect((await purge(f)).status).toBe('PENDING');
  await expect(storage.storageProvider().put(`visa-documents/${f.app.id}/${randomUUID()}`,f.data,'application/pdf')).rejects.toThrow();
  await expect(pool.query("insert into documents(application_id,document_type_id,original_filename,mime_type,size_bytes,storage_key) select $1,id,'fictional.pdf','application/pdf',4,$2 from document_types where code='PASSPORT'",[f.app.id,f.key])).rejects.toThrow(/retention/i);
  deleteFault=false;expect((await purge(f)).status).toBe('PURGED');
 });
});
