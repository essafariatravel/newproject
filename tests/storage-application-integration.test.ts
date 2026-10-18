import {createServer} from "node:http";
import {once} from "node:events";
import {readFileSync} from "node:fs";
import {beforeAll,afterAll,describe,it,expect,vi} from "vitest";
import {suiteSetup} from "./helpers/global-state";
import {agencyByEmail,userByEmail,documentTypeIdByCode,registrationData,registrationPdf,nextIp} from "./helpers/fixtures";
import {pool} from "@/lib/db";
import {createDraftApplication} from "@/lib/applications";
import {uploadDocument,deleteDocument,getDocumentForUser} from "@/lib/documents";
import * as storage from "@/lib/storage";
import {submitAgencyRegistration,startRegistrationReview} from '@/lib/registrations';
import {createRegistrationFollowup,resolveRegistrationFollowup,uploadRegistrationFollowup} from '@/lib/registration-followup';
import {createTopupRequest} from '@/lib/topup';
import {setAgencyLogo,clearAgencyLogo} from '@/lib/branding';
import {randomUUID} from 'node:crypto';

suiteSetup();
const objects=new Map<string,{data:Buffer;mime:string}>();
let denyDelete=false;
const server=createServer(async(req,res)=>{
  if(req.headers.authorization!=="Bearer local-fictional-storage-key"){res.writeHead(403);return res.end();}
  const key=decodeURIComponent((req.url??"").replace("/storage/v1/object/visa-documents-preview/",""));
  if(req.method==="POST"){
    if(objects.has(key)){res.writeHead(409);return res.end();}
    const chunks:Buffer[]=[];for await(const part of req)chunks.push(Buffer.from(part));
    objects.set(key,{data:Buffer.concat(chunks),mime:String(req.headers["content-type"])});res.writeHead(200);return res.end("{}");
  }
  if(req.method==="DELETE"){
    if(denyDelete){res.writeHead(503);return res.end();}
    objects.delete(key);res.writeHead(204);return res.end();
  }
  const item=objects.get(key);
  if(!item){res.writeHead(404,{"content-type":"application/json"});return res.end(JSON.stringify({code:"NoSuchKey"}));}
  res.writeHead(200,{"content-type":item.mime,"content-length":item.data.length});res.end(item.data);
});
beforeAll(async()=>{
  const client=await pool.connect();try{
    const ddl=readFileSync("migrations/proposals/0036_storage_operations.sql","utf8");
    await client.query("begin;set local search_path to public,pg_catalog");await client.query(ddl);await client.query("rollback");
    expect((await client.query("select to_regclass('public.storage_operations') relation")).rows[0].relation).toBeNull();
    await client.query("begin;set local search_path to public,pg_catalog");await client.query(ddl);await client.query("commit");
  }finally{client.release();}
  server.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();if(!address||typeof address==="string")throw Error("LOCAL_BIND_FAILED");
  vi.stubEnv("STORAGE_PROVIDER","supabase");vi.stubEnv("STORAGE_OPERATIONS_ENABLED","local-qualification");vi.stubEnv("STORAGE_LOCAL_HTTP_ORIGIN",`http://127.0.0.1:${address.port}`);vi.stubEnv("SUPABASE_URL",`http://127.0.0.1:${address.port}`);vi.stubEnv("SUPABASE_STORAGE_BUCKET","visa-documents-preview");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","local-fictional-storage-key");
});
afterAll(async()=>{
  const close=Reflect.get(storage,"closeStorageOperations");if(typeof close==="function")await close();
  vi.unstubAllEnvs();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  await pool.query("drop table public.storage_operation_events,public.storage_operations;drop function public.reject_storage_operation_identity_mutation(),public.reject_storage_operation_event_mutation()");
});
async function fixture(){const actor=await userByEmail("b-admin@test.example"),agency=await agencyByEmail("ops@agencyb.example"),type=await documentTypeIdByCode("PASSPORT"),visa=(await pool.query("select id from visa_types where code='JP-BUS'")).rows[0].id;const app=await createDraftApplication({agencyId:agency.id,visaTypeId:visa,createdBy:actor});return{actor,app,type};}
async function upload(f:Awaited<ReturnType<typeof fixture>>){const data=Buffer.from("%PDF-1.4\nFictional passport only\n%%EOF");return uploadDocument({applicationId:f.app.id,actor:f.actor,documentTypeId:f.type,file:{name:"fictional.pdf",type:"application/pdf",size:data.length,data}});}
describe("actual application writers with PostgreSQL and HTTP object storage",()=>{
  it("commits document metadata and a REFERENCED operation together",async()=>{const f=await fixture(),doc=await upload(f);expect((await pool.query("select state from storage_operations where object_key=$1",[doc.storageKey])).rows[0]?.state).toBe("REFERENCED");expect((await storage.storageProvider().get(doc.storageKey)).data.toString()).toContain("Fictional passport only");});
  it("denies another tenant's read and delete without object I/O or metadata mutation",async()=>{const f=await fixture(),doc=await upload(f),other=await userByEmail("a-admin@test.example");await expect(getDocumentForUser(doc.id,other)).rejects.toThrow();await expect(deleteDocument(doc.id,other)).rejects.toThrow();expect(objects.has(doc.storageKey)).toBe(true);expect((await pool.query("select id from documents where id=$1",[doc.id])).rowCount).toBe(1);});
  it("retains a durable pending operation when physical deletion fails, then resumes safely",async()=>{const f=await fixture(),doc=await upload(f);denyDelete=true;await expect(deleteDocument(doc.id,f.actor)).rejects.toMatchObject({code:"STORAGE_DELETE_PENDING"});expect((await pool.query("select state from storage_operations where object_key=$1",[doc.storageKey])).rows[0]?.state).toBe("RETRY_REQUIRED");expect(objects.has(doc.storageKey)).toBe(true);expect((await pool.query("select count(*)::int n from storage_operation_events where state='DELETED'")).rows[0].n).toBe(0);denyDelete=false;await storage.storageProvider().delete(doc.storageKey);expect(objects.has(doc.storageKey)).toBe(false);expect((await pool.query("select state from storage_operations where object_key=$1",[doc.storageKey])).rows[0]?.state).toBe("DELETED");});
  it('publishes initial registration and follow-up file references through the same durable protocol',async()=>{
    const reg=await submitAgencyRegistration({data:registrationData(),files:[registrationPdf()],ipAddress:nextIp()});
    const owner=await userByEmail('admin@test.example');await startRegistrationReview(reg.id,owner);
    const link=await createRegistrationFollowup({actor:owner,registrationId:reg.id,note:'Fictional local administrative follow-up',slots:[{category:'TAX_DOCUMENT',label:'Fictional tax document'}]});
    const resolved=await resolveRegistrationFollowup(link.token);expect(resolved).not.toBeNull();
    await uploadRegistrationFollowup({token:link.token,slotId:resolved!.slots[0]!.id,file:registrationPdf('TAX_DOCUMENT')});
    const rows=(await pool.query('select s.state,d.storage_key from agency_registration_documents d join storage_operations s on s.object_key=d.storage_key where d.registration_id=$1',[reg.id])).rows;
    expect(rows).toHaveLength(2);for(const row of rows){expect(row.state).toBe('REFERENCED');expect(objects.has(row.storage_key)).toBe(true);}
  });
  it('publishes top-up proof and replaces external logos without losing old cleanup intent',async()=>{
    const f=await fixture(),agency=await agencyByEmail('ops@agencyb.example'),proof=registrationPdf();
    const topup=await createTopupRequest({agencyId:agency.id,amount:100,actor:f.actor,idempotencyKey:randomUUID(),proof:{name:proof.name,type:proof.type,size:proof.size,data:proof.data}});
    const row=(await pool.query('select s.state from wallet_topup_requests w join storage_operations s on s.object_key=w.proof_storage_key where w.id=$1',[topup.id])).rows[0];expect(row.state).toBe('REFERENCED');
    const owner=await userByEmail('superadmin@test.example'),logo={data:Buffer.from('89504e470d0a1a0a00112233','hex'),mimeType:'image/png'};
    await setAgencyLogo(agency.id,logo,owner);const old=(await pool.query('select logo_key from agencies where id=$1',[agency.id])).rows[0].logo_key;
    denyDelete=true;await setAgencyLogo(agency.id,logo,owner);const latest=(await pool.query('select logo_key from agencies where id=$1',[agency.id])).rows[0].logo_key;
    expect(latest).not.toBe(old);expect((await pool.query('select state from storage_operations where object_key=$1',[old])).rows[0].state).toBe('RETRY_REQUIRED');expect(objects.has(old)).toBe(true);
    denyDelete=false;await storage.storageProvider().delete(old);await clearAgencyLogo(agency.id,owner);expect(objects.has(latest)).toBe(false);expect((await pool.query('select state from storage_operations where object_key=$1',[latest])).rows[0].state).toBe('DELETED');
  });
});
