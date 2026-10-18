import './lib/perf-local-env';
import {readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Pool} from 'pg';
import {assertSafePerfTarget} from './perf-safety';

/** Bounded changed-path qualification, not a replacement for the historical
 * mixed k6 gate. Concurrent requests use genuinely authenticated fixture actors;
 * they are not claimed to be distinct people or cloud-capacity evidence. */
async function main(){
 const target=assertSafePerfTarget(); // Before private fixture reads or requests.
 if(target.schema!=='public'||target.dbName!=='essafaria_test'||target.dbPort!=='5434'||!target.baseUrl)throw Error('DISPOSABLE_LOCAL_FIXTURE_REQUIRED');
 const fixturePath=process.env.PERF_LOCAL_FIXTURE_FILE,output=process.env.PERF_LOCAL_RESULT_FILE;
 if(!fixturePath||!output||!path.isAbsolute(fixturePath)||!path.isAbsolute(output)||(await stat(fixturePath)).size>1024*1024)throw Error('PRIVATE_LOCAL_FIXTURE_REQUIRED');
 const fixture=JSON.parse(await readFile(fixturePath,'utf8'));
 if(fixture.kind!=='ESSAFARIA_CHANGED_PATH_LOCAL'||fixture.baseUrl!==target.baseUrl||!Array.isArray(fixture.actors)||!Array.isArray(fixture.submissions)||!/^[a-f0-9]{40}$/.test(fixture.sourceSha))throw Error('FIXTURE_IDENTITY_INVALID');
 const stages=[10,25,50,100];
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:6});
 const result:{[key:string]:unknown;stages:Array<Record<string,unknown>>}={kind:'LOCAL_CHANGED_DOCUMENT_FINANCIAL_CONCURRENCY',startedAt:new Date().toISOString(),sourceSha:fixture.sourceSha,status:'RUNNING',cloudConnections:0,distinctAuthenticatedActors:fixture.actors.length,distinctPeopleClaim:false,cloudCapacityClaim:false,uploadBytes:512*1024,stages:[]};
 const actors=new Map<string,{role:string;cookie:string;id:string}>();
 const samples:Array<{connections:number;waiting:number;deadlocks:string}>=[];
 let monitor:ReturnType<typeof setInterval>|undefined;
 const persist=()=>writeFile(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});
 try{
  const identity=(await pool.query("select current_database() name,host(inet_server_addr()) host,inet_server_port() port")).rows[0];
  if(identity.name!=='essafaria_test'||identity.port!==5434||!['127.0.0.1','::1'].includes(identity.host))throw Error('LIVE_LOCAL_DATABASE_IDENTITY_MISMATCH');
  for(const actor of fixture.actors){
   if(!/^(SUPER_ADMIN|ADMIN|VISA_AGENT|ACCOUNTING|AGENCY_ADMIN|AGENCY_USER)$/.test(actor.role)||!/^evos_session=[A-Za-z0-9_-]+$/.test(actor.cookie))throw Error('FIXTURE_ACTOR_INVALID');
   const token=actor.cookie.slice('evos_session='.length);
   const row=(await pool.query(`select u.id,u.role,u.agency_id,s.mfa_verified_at from public.sessions s join public.users u on u.id=s.user_id where s.token_hash=$1 and s.credential_version=u.credential_version and s.expires_at>now() and u.status='ACTIVE' and not u.must_change_password and not u.activation_pending`,[createHash('sha256').update(token).digest('hex')])).rows[0];
   if(!row||row.role!==actor.role||(!row.agency_id&&!row.mfa_verified_at))throw Error('ACTUAL_AUTHENTICATED_FACTOR_REQUIRED');
   actors.set(actor.role,{...actor,id:row.id});
  }
  for(const role of ['AGENCY_USER','AGENCY_ADMIN','VISA_AGENT','ACCOUNTING','SUPER_ADMIN','ADMIN'])if(!actors.has(role))throw Error('REQUIRED_ACTOR_MISSING');
  const paths:Record<string,string[]>={AGENCY_USER:['/portal','/portal/documents','/portal/wallet'],AGENCY_ADMIN:['/portal/applications','/portal/communications'],VISA_AGENT:['/admin','/admin/documents'],ACCOUNTING:['/admin/billing','/admin/reports'],SUPER_ADMIN:['/admin/users','/admin/reports'],ADMIN:['/admin','/admin/applications']};
  async function request(actor:{cookie:string},pathname:string,options:RequestInit={}){
   const started=performance.now();const response=await fetch(target.baseUrl+pathname,{...options,redirect:'manual',signal:AbortSignal.timeout(15_000),headers:{cookie:actor.cookie,Origin:target.baseUrl!,...options.headers}});
   const bytes=Buffer.from(await response.arrayBuffer());return{response,bytes,ms:performance.now()-started};
  }
  for(const actor of actors.values())for(const pathname of paths[actor.role]??[]){const probe=await request(actor,pathname);if(probe.response.status!==200)throw Error('ROLE_WARMUP_DENIED_'+actor.role);}
  monitor=setInterval(()=>{void pool.query("select (select count(*)::int from pg_stat_activity where datname=current_database()) connections,(select count(*)::int from pg_stat_activity where datname=current_database() and wait_event_type='Lock') waiting,(select deadlocks::text from pg_stat_database where datname=current_database()) deadlocks").then(value=>samples.push(value.rows[0])).catch(()=>{});},1000);
  const digest=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
  const quantile=(values:number[],p:number)=>{const sorted=[...values].sort((a,b)=>a-b);return Number((sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]??0).toFixed(2));};
  const distribution=(values:number[])=>({count:values.length,p50:quantile(values,.5),p95:quantile(values,.95),p99:quantile(values,.99)});
  const payload=Buffer.alloc(512*1024,65);payload.write('%PDF-1.7\nFictional local performance document\n');
  const agency=actors.get('AGENCY_ADMIN')!;
  for(let stageIndex=0;stageIndex<stages.length;stageIndex++){
   const concurrency=stages[stageIndex]!,submission=fixture.submissions[stageIndex];if(!submission)throw Error('SUBMISSION_FIXTURE_REQUIRED');
   const started=performance.now(),uploads:number[]=[],downloads:number[]=[],reads:number[]=[],wallet:number[]=[];
   const before=(await pool.query('select balance::text from public.agencies where id=(select agency_id from public.users where id=$1)',[agency.id])).rows[0].balance;
   let critical:string|undefined,successfulUploads=0;
   const stage:Record<string,unknown>={concurrency,status:'RUNNING',iterationsPerWorker:3,globalP95BudgetMs:2000,documentP99BudgetMs:4000};result.stages.push(stage);await persist();
   // A cold simultaneous submission and its retries must produce exactly one
   // dossier/debit, never a forged session or a synthetic direct SQL charge.
   const submissions=await Promise.all(Array.from({length:concurrency},async()=>{
    try{const call=await request(agency,'/api/agency/requests',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(submission)});wallet.push(call.ms);if(call.response.status!==200)critical='WALLET_HTTP_'+call.response.status;return JSON.parse(call.bytes.toString('utf8'));}catch{critical='WALLET_TRANSPORT_OR_RESPONSE_FAILURE';return null;}
   }));
   const ids=new Set(submissions.map(value=>value?.applicationId).filter(Boolean));if(ids.size!==1||submissions.some(value=>!value?.applicationId))critical??='WALLET_IDEMPOTENCY_FAILED';
   const applicationId=[...ids][0];
   if(applicationId){
    const ledger=(await pool.query("select count(*)::int n,coalesce(sum(amount),0)::text amount from public.wallet_transactions where application_id=$1 and type='APPLICATION_CHARGE'",[applicationId])).rows[0];
    const after=(await pool.query('select balance::text from public.agencies where id=(select agency_id from public.users where id=$1)',[agency.id])).rows[0].balance;
    const balanced=(await pool.query('select $1::numeric-$2::numeric=abs($3::numeric) matches',[before,after,ledger.amount])).rows[0].matches;
    if(ledger.n!==1||!balanced)critical??='WALLET_LEDGER_OR_BALANCE_MISMATCH';
    stage.walletChargeCount=ledger.n;
   }
   if(!critical)await Promise.all(Array.from({length:concurrency},async(_,worker)=>{
    const slot=(worker*37)%100,role=slot<45?'AGENCY_USER':slot<65?'AGENCY_ADMIN':slot<90?'VISA_AGENT':slot<97?'ACCOUNTING':'SUPER_ADMIN';
    const actor=actors.get(role)!;
    for(let iteration=0;iteration<3&&!critical;iteration++)try{
     const pathname=paths[role]![iteration%paths[role]!.length]!;const read=await request(actor,pathname);reads.push(read.ms);if(read.response.status!==200){critical='ROLE_READ_HTTP_'+read.response.status;break;}
     const name='local-perf-'+randomUUID()+'.pdf',form=new FormData();form.set('$ACTION_ID_'+fixture.uploadActionId,'');form.set('applicationId',fixture.applicationId);form.set('checklistItemId',fixture.checklistItemId);form.set('back','/portal/applications/'+fixture.applicationId);form.set('file',new Blob([payload],{type:'application/pdf'}),name);
     const upload=await request(agency,'/portal/applications/'+fixture.applicationId+'?tab=documents',{method:'POST',headers:{Accept:'text/html'},body:form});uploads.push(upload.ms);
     if(![200,303].includes(upload.response.status)||new URL(upload.response.headers.get('location')??'/',target.baseUrl!).searchParams.has('error')){critical='UPLOAD_HTTP_OR_ACTION_FAILURE';break;}
     const doc=(await pool.query('select id,sha256 from public.documents where application_id=$1 and original_filename=$2',[fixture.applicationId,name])).rows[0];if(!doc||doc.sha256!==digest(payload)){critical='UPLOAD_METADATA_OR_SHA_MISMATCH';break;}successfulUploads++;
     const download=await request(agency,'/api/documents/'+doc.id);downloads.push(download.ms);if(download.response.status!==200||digest(download.bytes)!==doc.sha256){critical='DOWNLOAD_INTEGRITY_FAILURE';break;}
    }catch{critical='DOCUMENT_OR_READ_TRANSPORT_FAILURE';}
   }));
   Object.assign(stage,{durationMs:Number((performance.now()-started).toFixed(2)),successfulUploads,uploads:distribution(uploads),downloads:distribution(downloads),roleReads:distribution(reads),wallet:distribution(wallet),requestsPerSecond:Number(((uploads.length+downloads.length+reads.length+wallet.length)/((performance.now()-started)/1000)).toFixed(2))});
   const metrics=[uploads,downloads,reads,wallet].filter(values=>values.length);
   if(!critical&&metrics.some(values=>quantile(values,.95)>=2000||quantile(values,.99)>=4000))critical='LOCAL_LATENCY_BUDGET_EXCEEDED';
   if(samples.some(sample=>sample.deadlocks!=='0'))critical??='DATABASE_DEADLOCK_DETECTED';
   stage.status=critical?'STOP':'PASS';stage.critical=critical??null;await persist();
   if(critical){result.status='STOP';result.stopReason=critical;break;}
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  result.databaseSamples=samples;result.status=result.status==='STOP'?'STOP':'PASS';
  const dangling=(await pool.query("select count(*)::int n from public.documents d left join public.storage_operations operation on operation.object_key=d.storage_key where operation.state is distinct from 'REFERENCED'")).rows[0].n;
  result.danglingDocumentReferences=dangling;if(dangling){result.status='STOP';result.stopReason='DANGLING_DOCUMENT_REFERENCE';}
  result.peakConnections=Math.max(0,...samples.map(sample=>sample.connections));result.peakLockWaiters=Math.max(0,...samples.map(sample=>sample.waiting));
  // A stopped tier must also demonstrate that finite local work drains and
  // ordinary serial requests recover. This never turns a STOP into PASS.
  if(monitor){clearInterval(monitor);monitor=undefined;}
  await new Promise(resolve=>setTimeout(resolve,1000));
  const recovered=[];
  for(const pathname of ['/api/health','/portal','/portal/wallet']){
   const probe=await request(agency,pathname);recovered.push({path:pathname,status:probe.response.status,durationMs:Number(probe.ms.toFixed(2))});
  }
  const idle=(await pool.query("select count(*)::int n from pg_stat_activity where datname=current_database() and (state='idle in transaction' or wait_event_type='Lock')")).rows[0].n;
  const recoveryPass=idle===0&&recovered.every(probe=>probe.status===200&&probe.durationMs<2000);
  result.recoveryAfterLoad={status:recoveryPass?'PASS':'FAIL',idleTransactionsOrLockWaits:idle,probes:recovered};
  if(!recoveryPass){result.status='STOP';result.stopReason='RECOVERY_AFTER_LOAD_FAILED';}
 }catch{result.status='FAIL';result.stopReason='LOCAL_QUALIFICATION_FAILED';}
 finally{if(monitor)clearInterval(monitor);await pool.end();result.finishedAt=new Date().toISOString();await persist();}
 console.log(JSON.stringify({status:result.status,stages:result.stages.map(stage=>({concurrency:stage.concurrency,status:stage.status})),cloudConnections:0}));
 if(result.status!=='PASS')process.exitCode=1;
}
main().catch(()=>{console.error('LOCAL_CHANGED_PATH_QUALIFICATION_REFUSED');process.exitCode=1;});
