/** Durable journal. Application integration is gated to the isolated local lab. */
import {createHash} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import type {StorageProvider} from "./storage";
import {AppError} from "./types";
import {assertLocalHttpOrigin,assertLocalPostgresUrl} from "../../perf/local-safety.js";
import {currentRetentionIntentAllowed} from './document-retention-policy';

interface Configuration {enabled?:boolean;databaseUrl:string;origin:string;bucket:string;schema:string;transportTimeoutMs?:number}
interface Reservation {key:string;mimeType:string;sizeBytes:number;sha256:string}
interface Operation {id:string;provider_origin:string;bucket:string;object_key:string;mime_type:string;size_bytes:number;sha256:string;state:string;attempts:number;upload_acknowledged_at:Date|null}
interface Event {sequence:string;operation_id:string;state:string;occurred_at:Date;code:string}
type Mutation=(client:PoolClient)=>Promise<unknown>;
type Connection=Pick<PoolClient,"query">;
const failure=(code:string)=>new AppError(code,"The storage operation requires verification. No completed deletion is claimed.");
const hash=(data:Buffer)=>createHash("sha256").update(data).digest("hex");
const validId=(id:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
const references=["documents","agency_registration_documents","wallet_topup_requests","agencies","site_settings","legacy_reconciliation_issues","document_blobs"];

/** The backend is a trusted dependency supplied only by local qualification tests.
 * No configuration value authorizes a cloud backend or application rollout. */
export function createLocalStorageOperations(config:Configuration,backend:StorageProvider){
  const url=new URL(assertLocalPostgresUrl(config.databaseUrl));
  const origin=assertLocalHttpOrigin(config.origin);
  if(config.enabled!==true||config.schema!=="public"||url.port!=="5434"||url.pathname!=="/essafaria_test"||
     !/^[A-Za-z0-9_-]{1,80}$/.test(config.bucket)||process.env.VERCEL_ENV||process.env.VERCEL_TARGET_ENV||
     (process.env.VERCEL&&!['0','false'].includes(process.env.VERCEL))||process.env.NETLIFY||process.env.RENDER||process.env.CF_PAGES)
    throw failure("STORAGE_OPERATIONS_LOCAL_ONLY");
  // Freeze binding: a caller cannot retarget an existing instance after reservation.
  const bucket=config.bucket;
  const timeoutMs=config.transportTimeoutMs??15_000;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<20||timeoutMs>15_000)throw failure("STORAGE_TRANSPORT_TIMEOUT_INVALID");
  const pool=new Pool({connectionString:config.databaseUrl,max:4});
  pool.on("error",()=>{}); // No raw server diagnostics or credentials in logs.
  const table=(name:string)=>`"public"."${name}"`;
  async function bounded<T>(run:()=>Promise<T>):Promise<T>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([run(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(failure("STORAGE_TRANSPORT_TIMEOUT")),timeoutMs);})]);}
    finally{if(timer)clearTimeout(timer);}
    // A timeout does not cancel the remote action. Uploads remain UNCERTAIN and
    // cannot be retired without independently qualified drainage/reconciliation.
  }
  async function transaction<T>(action:(client:PoolClient)=>Promise<T>,scope:'serial'|'object'='serial'):Promise<T>{
    const client=await pool.connect();
    try{
      await client.query("begin");
      await client.query("set local lock_timeout='2s';set local statement_timeout='15s'");
      const target=(await client.query("select current_database() name,host(inet_server_addr()) address,inet_server_port() port")).rows[0];
      if(target.name!=="essafaria_test"||target.port!==5434||!["127.0.0.1","::1"].includes(target.address))throw failure("STORAGE_OPERATIONS_LOCAL_ONLY");
      // Deletion, adoption and reference reconciliation remain serialized.
      // Independent upload phases use their immutable row lock; reservations
      // retain the unique-key constraint and identity/retention lock below.
      if(scope==='serial')await client.query("select pg_advisory_xact_lock(2030181036)");
      const result=await action(client);await client.query("commit");return result;
    }catch(error){
      await client.query("rollback").catch(()=>{});
      if(error instanceof AppError)throw error;
      if((error as {code?:string})?.code==='23505')throw failure("STORAGE_KEY_ALREADY_RESERVED");
      throw failure("STORAGE_TRANSACTION_FAILED");
    }finally{client.release();}
  }
  async function locked(client:Connection,id:string){
    if(!validId(id))throw failure("STORAGE_OPERATION_INVALID");
    const row=(await client.query<Operation>(`select * from ${table("storage_operations")} where id=$1 for update`,[id])).rows[0];
    if(!row)throw failure("STORAGE_OPERATION_INVALID");
    if(row.provider_origin!==origin||row.bucket!==bucket)throw failure("STORAGE_TARGET_MISMATCH");
    return row;
  }
  async function event(client:Connection,id:string,state:string,code:string){
    await client.query(`insert into ${table("storage_operation_events")}(operation_id,state,code) values($1,$2,$3)`,[id,state,code]);
  }
  async function transition(client:Connection,row:Operation,state:string,code:string){
    await client.query(`update ${table("storage_operations")} set state=$2,updated_at=clock_timestamp() where id=$1`,[row.id,state]);
    await event(client,row.id,state,code);
  }
  async function hasReference(client:Connection,key:string,lockTables=true){
    // Also blocks legacy metadata writers during this transaction; after release,
    // only a cooperatively integrated writer may adopt the immutable key again.
    if(lockTables)await client.query(`lock table ${references.map(table).join(',')} in share row exclusive mode`);
    const known=new Set(["documents.storage_key","agency_registration_documents.storage_key","wallet_topup_requests.proof_storage_key","agencies.logo_key","legacy_reconciliation_issues.storage_key"]);
    const columns=(await client.query<{table_name:string;column_name:string}>("select table_name,column_name from information_schema.columns where table_schema='public' and column_name ~ '(storage_key|logo_key)$'")).rows;
    if(columns.some(c=>!known.has(`${c.table_name}.${c.column_name}`)))throw failure("STORAGE_REFERENCE_COVERAGE_CHANGED");
    const result=await client.query(`select
      exists(select 1 from ${table("documents")} where storage_key=$1) or
      exists(select 1 from ${table("agency_registration_documents")} where storage_key=$1) or
      exists(select 1 from ${table("wallet_topup_requests")} where proof_storage_key=$1) or
      exists(select 1 from ${table("agencies")} where logo_key=$1) or
      exists(select 1 from ${table("site_settings")} where strpos(value::text,$1)>0) or
      exists(select 1 from ${table("legacy_reconciliation_issues")} where storage_key=$1) or
      exists(select 1 from ${table("document_blobs")} where key=$1) as present`,[key]);
    return result.rows[0].present===true;
  }
  async function byKey(client:Connection,key:string){
    const row=(await client.query<Operation>(`select * from ${table("storage_operations")} where provider_origin=$1 and bucket=$2 and object_key=$3 for update`,[origin,bucket,key])).rows[0];
    if(!row)throw failure("STORAGE_OWNERSHIP_NOT_PROVEN");return row;
  }
  async function pendingRetention(client:Connection,key:string){
    const id=/^visa-documents\/([a-f0-9-]{36})\//i.exec(key)?.[1];if(!id||!validId(id))return false;
    return (await client.query("select exists(select 1 from public.document_retention_jobs where application_id=$1 and state='PENDING') present",[id])).rows[0].present===true;
  }
  async function held(client:Connection,key:string){
    const id=/^visa-documents\/([a-f0-9-]{36})\//i.exec(key)?.[1];if(!id||!validId(id))return false;
    if(!(await client.query("select to_regclass('public.document_retention_case_events') relation")).rows[0].relation)return false;
    const control=(await client.query("select legal_hold,exceptions_reviewed,reviewed_decision_at from public.document_retention_case_events where application_id=$1 order by event_sequence desc limit 1",[id])).rows[0];
    if(control?.legal_hold===true)return true;
    const job=(await client.query("select application_id,payload,decision_at from public.document_retention_jobs where application_id=$1 and state='PENDING'",[id])).rows[0];
    if(!job)return false;
    if(job.payload.origin!==origin||job.payload.bucket!==bucket)return true;
    return !await currentRetentionIntentAllowed(client,'public',job);
  }
  return {
    async referenceCommitted(client:Connection,key:string){
      if(await pendingRetention(client,key))throw failure('STORAGE_RETENTION_PENDING');
      const row=await byKey(client,key);
      if(!['UPLOADED','REFERENCED'].includes(row.state))throw failure("STORAGE_STATE_INVALID");
      if(!await hasReference(client,key,false))throw failure("STORAGE_REFERENCE_REQUIRED");
      if(row.state!=='REFERENCED')await transition(client,row,'REFERENCED','REFERENCE_COMMITTED');
    },
    async deletionQueued(client:Connection,key:string){
      const row=await byKey(client,key);
      if(!['UPLOADED','REFERENCED','DELETE_PENDING','RETRY_REQUIRED','DELETED'].includes(row.state))throw failure("STORAGE_RECONCILIATION_REQUIRED");
      if(await held(client,key))throw failure("STORAGE_LEGAL_HOLD");
      if(row.state!=='DELETED')await transition(client,row,'DELETE_PENDING','DELETE_QUEUED');
    },
    findByKey(key:string){return transaction(client=>byKey(client,key));},
    async resumeUpload(id:string){
      return transaction(async client=>{
        const row=await locked(client,id);
        if(!['UPLOAD_STARTED','UPLOAD_UNCERTAIN','UPLOADED'].includes(row.state)||!row.upload_acknowledged_at)throw failure("STORAGE_RECONCILIATION_REQUIRED");
        const stored=await bounded(()=>backend.get(row.object_key));
        if(stored.data.length!==row.size_bytes||stored.mimeType!==row.mime_type||hash(stored.data)!==row.sha256)throw failure("STORAGE_VERIFICATION_FAILED");
        if(row.state!=='UPLOADED')await transition(client,row,'UPLOADED','UPLOAD_VERIFIED');
      });
    },
    async reconcile(limit=50):Promise<Array<{id:string;state:string}>>{
      if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw failure("STORAGE_LIMIT_INVALID");
      const rows=(await pool.query<Operation>(`select * from ${table("storage_operations")} where provider_origin=$1 and bucket=$2 and state in ('UPLOADED','UPLOAD_STARTED','UPLOAD_UNCERTAIN','DELETE_PENDING','RETRY_REQUIRED') and updated_at<clock_timestamp()-interval '60 seconds' order by updated_at limit $3`,[origin,bucket,limit])).rows;
      const result=[];
      for(const row of rows){
        // Reconciliation is intentionally conservative: no guessed ownership,
        // no deletion of unacknowledged writes and no public cleanup endpoint.
        try{
          if(['UPLOAD_STARTED','UPLOAD_UNCERTAIN'].includes(row.state)){await this.resumeUpload(row.id);result.push({id:row.id,state:'UPLOADED'});continue;}
          if(row.state==='UPLOADED'){
            const state=await transaction(async client=>{
            const current=await locked(client,row.id);
            if(current.state!=='UPLOADED')return current.state;
            if(await hasReference(client,row.object_key,false)){await transition(client,current,'REFERENCED','REFERENCE_COMMITTED');return 'REFERENCED';}
            if(await held(client,row.object_key))return 'PRESERVED_REFERENCED';
            await transition(client,current,'DELETE_PENDING','DELETE_QUEUED');return 'DELETE_PENDING';
            });
            if(!['DELETE_PENDING','RETRY_REQUIRED'].includes(state)){result.push({id:row.id,state});continue;}
          }
          result.push(await this.retryDeletion(row.id));
        }catch{result.push({id:row.id,state:'RECONCILIATION_REQUIRED'});}
      }return result;
    },
    async reserve(input:Reservation){
      if(!input.key||input.key.length>1024||!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(input.key)||input.key.split('/').some(p=>p==='.'||p==='..')||
         !/^[a-f0-9]{64}$/.test(input.sha256)||!Number.isSafeInteger(input.sizeBytes)||input.sizeBytes<1||input.sizeBytes>2*1024*1024||
         !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(input.mimeType))throw failure("STORAGE_RESERVATION_INVALID");
      return transaction(async client=>{
        await client.query('select pg_advisory_xact_lock_shared(1163087699)');
        if(await pendingRetention(client,input.key))throw failure('STORAGE_RETENTION_PENDING');
        const row=(await client.query<Operation>(`insert into ${table("storage_operations")}(provider_origin,bucket,object_key,mime_type,size_bytes,sha256,state)
          values($1,$2,$3,$4,$5,$6,'STAGED') returning *`,[origin,bucket,input.key,input.mimeType,input.sizeBytes,input.sha256])).rows[0]!;
        await event(client,row.id,'STAGED','RESERVED');return row;
      },'object');
    },
    async upload(id:string,data:Buffer){
      const row=await transaction(async client=>{
        const row=await locked(client,id);
        if(row.state!=='STAGED')throw failure("STORAGE_STATE_INVALID");
        if(data.length!==row.size_bytes||hash(data)!==row.sha256)throw failure("STORAGE_INPUT_CHANGED");
        await transition(client,row,'UPLOAD_STARTED','UPLOAD_BEGIN');return row;
      },'object');
      try{
        await bounded(()=>backend.put(row.object_key,data,row.mime_type));
        await transaction(async client=>{const pending=await locked(client,id);await client.query(`update ${table("storage_operations")} set upload_acknowledged_at=clock_timestamp() where id=$1`,[id]);await event(client,pending.id,'UPLOAD_STARTED','UPLOAD_ACKNOWLEDGED');},'object');
        const stored=await bounded(()=>backend.get(row.object_key));
        if(stored.data.length!==row.size_bytes||stored.mimeType!==row.mime_type||hash(stored.data)!==row.sha256)throw failure("STORAGE_VERIFICATION_FAILED");
      }catch{
        await transaction(async client=>{const pending=await locked(client,id);await transition(client,pending,'UPLOAD_UNCERTAIN','UPLOAD_UNCERTAIN');},'object');
        throw failure("STORAGE_UPLOAD_UNCERTAIN");
      }
      return transaction(async client=>{
        const pending=await locked(client,id);
        if(pending.state!=='UPLOAD_STARTED')throw failure("STORAGE_STATE_INVALID");
        await transition(client,pending,'UPLOADED','UPLOAD_VERIFIED');return {id,state:'UPLOADED' as const};
      },'object');
    },
    async adopt(id:string,mutate:Mutation){
      return transaction(async client=>{
        // Lock reference tables before the journal row. Application metadata
        // transactions may already hold ROW EXCLUSIVE before journal adoption.
        const observed=(await client.query<Operation>(`select * from ${table("storage_operations")} where id=$1`,[id])).rows[0];
        if(!observed)throw failure("STORAGE_OPERATION_INVALID");
        await hasReference(client,observed.object_key);
        const row=await locked(client,id);
        if(row.state!=='UPLOADED')throw failure("STORAGE_STATE_INVALID");
        await mutate(client);
        if(!await hasReference(client,row.object_key))throw failure("STORAGE_REFERENCE_REQUIRED");
        await transition(client,row,'REFERENCED','REFERENCE_COMMITTED');return {id,state:'REFERENCED' as const};
      });
    },
    async requestDeletion(id:string,detach:Mutation=async()=>{}){
      return transaction(async client=>{
        const row=await locked(client,id);
        // A reservation is not proof that this operation owns pre-existing bytes.
        if(['STAGED','UPLOAD_STARTED','UPLOAD_UNCERTAIN'].includes(row.state))throw failure("STORAGE_RECONCILIATION_REQUIRED");
        if(row.state==='DELETED')return {id,state:'DELETED' as const};
        await detach(client);
        await transition(client,row,'DELETE_PENDING','DELETE_QUEUED');return {id,state:'DELETE_PENDING' as const};
      });
    },
    async retryDeletion(id:string){
      return transaction(async client=>{
        await client.query('select pg_advisory_xact_lock(1163087699)');
        if((await client.query("select to_regclass('public.document_retention_case_events') relation")).rows[0].relation)
          await client.query('lock table public.document_retention_case_events in share row exclusive mode');
        const observed=(await client.query<Operation>(`select * from ${table("storage_operations")} where id=$1`,[id])).rows[0];
        if(!observed)throw failure("STORAGE_OPERATION_INVALID");
        const referenced=await hasReference(client,observed.object_key);
        const row=await locked(client,id);
        if(row.state==='DELETED')return {id,state:'DELETED' as const};
        if(!['DELETE_PENDING','RETRY_REQUIRED'].includes(row.state))throw failure("STORAGE_STATE_INVALID");
        if(referenced||await held(client,row.object_key)){
          await event(client,id,'PRESERVED_REFERENCED','OBJECT_STILL_REFERENCED');return {id,state:'PRESERVED_REFERENCED' as const};
        }
        await client.query(`update ${table("storage_operations")} set attempts=attempts+1 where id=$1`,[id]);
        let absent=false;
        try{
          await bounded(()=>backend.delete(row.object_key));
          try{await bounded(()=>backend.get(row.object_key));}catch(error){if(error instanceof AppError&&error.code==='NOT_FOUND')absent=true;}
        }catch{ /* An acknowledged deletion is never inferred from an exception. */ }
        if(!absent){await transition(client,row,'RETRY_REQUIRED','DELETE_UNCERTAIN');return {id,state:'RETRY_REQUIRED' as const};}
        await transition(client,row,'DELETED','OBJECT_ABSENCE_VERIFIED');return {id,state:'DELETED' as const};
      });
    },
    inspect(id:string){return transaction(client=>locked(client,id));},
    events(id:string){return transaction(async client=>{await locked(client,id);return (await client.query<Event>(`select * from ${table("storage_operation_events")} where operation_id=$1 order by sequence`,[id])).rows;});},
    close(){return pool.end();},
  };
}
