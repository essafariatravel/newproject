import {describe,it,expect} from 'vitest';
import {and,eq} from 'drizzle-orm';
import {suiteSetup} from './helpers/global-state';
import {nextIp,registrationData,userByEmail,registrationPdf} from './helpers/fixtures';
import {createSession} from './helpers/authenticated-session';
import {hashToken} from '@/lib/crypto';
import {db,pool} from '@/lib/db';
import {sessions,authRateLimits,applications,visaTypes,walletTopupRequests,auditLogs,documentTypes,documents,statuses,applicants,communications} from '@/db/schema';
import {agencyClosurePreview,closeAgency,requireAgencyClosureTarget} from '@/lib/agency-closure';
import {submitAgencyRegistration,approveRegistration} from '@/lib/registrations';
import {createDraftApplication,getApplicationForUser,recordApplicationDecision} from '@/lib/applications';
import {applyWalletMutation,chargeApplicationSubmission} from '@/lib/wallet';
import {updateAccount} from '@/lib/account-security';
import {issueAccessToken,resetAccountFromToken} from '@/lib/account-recovery';
import {authenticate} from '@/lib/auth';
import {uploadDocument,getDocumentForUser} from '@/lib/documents';
import {storageProvider} from '@/lib/storage';
import {createTopupRequest,processTopupRequest} from '@/lib/topup';
import {updateInternalNotesAction} from '@/app/actions/applications';
import {request} from './helpers/request';
import {clearAgencyLogo} from '@/lib/branding';
import {applyPriceAdjustment} from '@/lib/price-adjustments';
import {postMessageAction} from '@/app/actions/communications';

suiteSetup();
async function fixture(){
 await db.delete(authRateLimits);const owner=await userByEmail('superadmin@test.example'),minted=await createSession(owner.id);
 const [session]=await db.select().from(sessions).where(eq(sessions.tokenHash,hashToken(minted.token)));
 const actor={...owner,sessionId:session!.id,mfaPending:false},data=registrationData();
 const reg=await submitAgencyRegistration({data,files:[],ipAddress:nextIp()}),approved=await approveRegistration({actor,registrationId:reg.id});
 const input={agencyId:approved.agencyId,confirmationName:data.legalName,currentPassword:'Test-Password-123',retentionReference:'QA APPROVED RETENTION',retainUntil:'2030-12-31',acceptObligations:true,responsibilityNote:'ESSAFARIA QA owner explicitly retains every open obligation.'};
 return {actor,data,approved,input,ownerToken:minted.token};
}
describe('F030 outstanding obligations and trusted target',()=>{
 async function fundedDraft(){
  const state=await fixture(),[programme]=await db.select().from(visaTypes).limit(1);
  const app=await createDraftApplication({agencyId:state.approved.agencyId,visaTypeId:programme!.id,createdBy:state.actor});
  await db.insert(applicants).values({applicationId:app.id,firstName:'Synthetic',lastName:'Finance',nationality:'DZ'});
  const client=await pool.connect();try{await client.query('begin');await applyWalletMutation(client,{agencyId:state.approved.agencyId,operation:'CREDIT',amountAbs:'100000.00',reason:'Synthetic closure finance fixture',actorId:state.actor.id});await client.query('commit');}finally{client.release();}
  const [submitted]=await db.select().from(statuses).where(eq(statuses.code,'SUBMITTED'));
  const charge={applicationId:app.id,actorId:state.actor.id,actor:state.actor,draftStatusId:app.statusId,submittedStatusId:submitted!.id,overrideReason:'Synthetic qualified Staff override fixture'};
  return {...state,app,charge};
 }
 it('refuses the independent Staff submission debit path after closure',async()=>{
  const state=await fundedDraft();await closeAgency(state.actor,state.input);
  await expect(chargeApplicationSubmission(state.charge)).rejects.toMatchObject({code:'INVALID_STATE'});
  expect((await pool.query('select count(*)::int n from wallet_transactions where application_id=$1',[state.app.id])).rows[0].n).toBe(0);
 });
 it('refuses price-adjustment credits and preserves the archived wallet and submitted price',async()=>{
  const state=await fundedDraft();await chargeApplicationSubmission(state.charge);await closeAgency(state.actor,state.input);
  const before=(await pool.query('select * from wallet_transactions where agency_id=$1 order by id',[state.approved.agencyId])).rows;
  await expect(applyPriceAdjustment({applicationId:state.app.id,actor:state.actor,type:'REFUND',amount:5,reason:'Synthetic forbidden archived refund'})).rejects.toMatchObject({code:'INVALID_STATE'});
  expect((await pool.query('select * from wallet_transactions where agency_id=$1 order by id',[state.approved.agencyId])).rows).toEqual(before);
 });
 it('accepts a correctly linked partial top-up as reconciled without altering its credited amount',async()=>{
  const {actor,input,approved,data}=await fixture();const access=await issueAccessToken(actor,approved.adminUserId,'ACTIVATION');await resetAccountFromToken(access.token,'Synthetic partial credit river garden');
  const receipt=await createTopupRequest({agencyId:approved.agencyId,actor:await userByEmail(data.email),amount:100,proof:registrationPdf()});
  await processTopupRequest({requestId:receipt.id,actor,decision:'CREDIT',amount:50,decisionNote:'QA legitimate partial funding'});
  expect((await agencyClosurePreview(actor,approved.agencyId)).blockers).toEqual([]);
  await expect(closeAgency(actor,input)).resolves.toMatchObject({status:'CLOSED',balance:'50.00'});
 });
 it('refuses messages that would change a terminal closed dossier archive',async()=>{
  const {actor,input,approved,ownerToken}=await fixture(),[programme]=await db.select().from(visaTypes).limit(1);
  const app=await createDraftApplication({agencyId:approved.agencyId,visaTypeId:programme!.id,createdBy:actor});
  const [terminal]=await db.select().from(statuses).where(eq(statuses.code,'CANCELLED'));await db.update(applications).set({statusId:terminal!.id}).where(eq(applications.id,app.id));
  await closeAgency(actor,input);const form=new FormData();form.set('applicationId',app.id);form.set('back','/admin/communications');form.set('body','QA archive must remain unchanged');form.set('visibility','INTERNAL');request.cookie=ownerToken;
  try{await expect(postMessageAction(form)).rejects.toMatchObject({digest:expect.stringContaining('error=')});}finally{request.cookie='';}
  expect(await db.select().from(communications).where(eq(communications.applicationId,app.id))).toHaveLength(0);
 });
 it('refuses removal of the archived agency identity artwork',async()=>{
  const {actor,input,approved}=await fixture();await closeAgency(actor,input);
  await expect(clearAgencyLogo(approved.agencyId,actor)).rejects.toMatchObject({code:'INVALID_STATE'});
 });
 it.each(['ADMIN','VISA_AGENT','ACCOUNTING','AGENCY_ADMIN'] as const)('refuses direct closure by %s even with delegated Staff permissions',async(role)=>{
  const {actor,input}=await fixture();await expect(closeAgency({...actor,role,staffPermissions:{catalogManage:true,staffManage:true}},input)).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('rejects a revoked live owner MFA session even when the captured actor claims verification',async()=>{
  const {actor,input}=await fixture();await db.update(sessions).set({mfaVerifiedAt:null}).where(eq(sessions.id,actor.sessionId));
  await expect(closeAgency(actor,input)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 });
 it('permits the exact hosted target and rejects cross-environment routing or unsafe URI overrides',()=>{
  const connection='postgresql://postgres:synthetic@db.xgetzgixalrsmuvfthpf.supabase.co:5432/postgres?sslmode=require';
  for(const [environment,schema]of [['preview','visa_os_preview'],['production','visa_os']]){
   const env={VERCEL:'1',VERCEL_ENV:environment,VERCEL_PROJECT_ID:'prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp',DATABASE_SCHEMA:schema,DATABASE_URL:connection};
   expect(()=>requireAgencyClosureTarget(env)).not.toThrow();
   expect(()=>requireAgencyClosureTarget({...env,ESSAFARIA_AGENCY_CLOSURE_DISABLED:'true'})).toThrow();
   expect(()=>requireAgencyClosureTarget({...env,DATABASE_SCHEMA:schema==='visa_os'?'visa_os_preview':'visa_os'})).toThrow();
   expect(()=>requireAgencyClosureTarget({...env,VERCEL_PROJECT_ID:'another-project'})).toThrow();
   expect(()=>requireAgencyClosureTarget({...env,DATABASE_URL:connection+'&options=-csearch_path=visa_os'})).toThrow();
  }
 });
 it('closes access with open dossiers, retained credit and pending topups only after explicit assumption, without changing them',async()=>{
  const {actor,approved,input}=await fixture();const [programme]=await db.select().from(visaTypes).limit(1);
  const app=await createDraftApplication({agencyId:approved.agencyId,visaTypeId:programme!.id,createdBy:actor});
  const client=await pool.connect();try{await client.query('begin');await applyWalletMutation(client,{agencyId:approved.agencyId,operation:'CREDIT',amountAbs:'75.00',reason:'Synthetic retained credit',actorId:actor.id});await client.query('commit');}finally{client.release();}
  const [pending]=await db.insert(walletTopupRequests).values({agencyId:approved.agencyId,amount:'100',currency:'DZD'}).returning();
  const before=await pool.query('select * from wallet_transactions where agency_id=$1 order by id',[approved.agencyId]);
  const preview=await agencyClosurePreview(actor,approved.agencyId);
  expect(preview).toMatchObject({blockers:[],obligations:expect.arrayContaining(['BALANCE_NOT_ZERO','OPEN_APPLICATIONS','PENDING_TOPUPS'])});
  await expect(closeAgency(actor,{...input,acceptObligations:false})).rejects.toMatchObject({code:'OBLIGATIONS_ACKNOWLEDGEMENT_REQUIRED'});
  await expect(closeAgency(actor,input)).resolves.toMatchObject({status:'CLOSED',balance:'75.00',openApplications:1,pendingTopups:1});
  expect((await pool.query('select * from wallet_transactions where agency_id=$1 order by id',[approved.agencyId])).rows).toEqual(before.rows);
  expect((await db.select().from(applications).where(eq(applications.id,app.id)))[0]?.statusId).toBe(app.statusId);
  expect((await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.id,pending!.id)))[0]?.status).toBe('PENDING');
  expect((await db.select().from(auditLogs).where(eq(auditLogs.action,'AGENCY_CLOSED'))).find(a=>a.entityId===approved.agencyId)?.metadata).toMatchObject({obligationsAccepted:true,responsibleStaffId:actor.id,responsibilityNote:input.responsibilityNote});
  expect((await getApplicationForUser(app.id,actor)).app.id).toBe(app.id);
  await expect(updateAccount(actor,approved.adminUserId,{toggleStatus:true})).rejects.toMatchObject({code:'INVALID_STATE'});
 });
 it.each(['APPROVED','REJECTED','CANCELLED'])('preserves %s dossiers, travellers, document bytes and private receipts while denying former and other tenants',async(code)=>{
  const {actor,approved,input,data}=await fixture();const [programme]=await db.select().from(visaTypes).limit(1);
  const app=await createDraftApplication({agencyId:approved.agencyId,visaTypeId:programme!.id,createdBy:actor});
  const [traveller]=await db.insert(applicants).values({applicationId:app.id,firstName:'Synthetic',lastName:'Archived Traveller',fullName:'Synthetic Archived Traveller',nationality:'DZ',passportNumber:'QA-F030-ONLY'}).returning();
  const [kind]=await db.select().from(documentTypes).where(eq(documentTypes.agencyUploadable,true)).limit(1);
  const file=registrationPdf();const uploaded=await uploadDocument({applicationId:app.id,actor,documentTypeId:kind!.id,file});
  const activation=await issueAccessToken(actor,approved.adminUserId,'ACTIVATION');await resetAccountFromToken(activation.token,'Synthetic river violet cedar garden');
  const former=await userByEmail(data.email),receipt=await createTopupRequest({agencyId:approved.agencyId,actor:former,amount:100,proof:file});
  const [beforeReceipt]=await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.id,receipt.id));
  const [terminal]=await db.select().from(statuses).where(eq(statuses.code,code));expect(terminal?.isTerminal).toBe(true);
  if(code==='APPROVED'||code==='REJECTED'){
   const [processing]=await db.select().from(statuses).where(eq(statuses.code,'IN_PROCESS'));
   await db.update(applications).set({statusId:processing!.id,submittedAt:new Date()}).where(eq(applications.id,app.id));
   await recordApplicationDecision({applicationId:app.id,actor,outcome:code,file});
  }else await db.update(applications).set({statusId:terminal!.id}).where(eq(applications.id,app.id));
  await closeAgency(actor,input);
  expect((await db.select().from(documents).where(eq(documents.id,uploaded.id)))[0]?.storageKey).toBe(uploaded.storageKey);
  expect((await db.select().from(applicants).where(eq(applicants.id,traveller!.id)))[0]?.applicationId).toBe(app.id);
  expect((await storageProvider().get(uploaded.storageKey)).data.equals(file.data)).toBe(true);
  expect((await storageProvider().get(beforeReceipt!.proofStorageKey!)).data.equals(file.data)).toBe(true);
  expect((await getDocumentForUser(uploaded.id,actor)).doc.id).toBe(uploaded.id);
  await expect(getDocumentForUser(uploaded.id,former)).rejects.toMatchObject({code:'NOT_FOUND'});
  await expect(getDocumentForUser(uploaded.id,await userByEmail('b-admin@test.example'))).rejects.toMatchObject({code:'NOT_FOUND'});
  await expect(processTopupRequest({requestId:receipt.id,actor,decision:'CREDIT',decisionNote:'Must not credit a closed Wallet'})).rejects.toMatchObject({code:'INVALID_STATE'});
  expect((await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.id,receipt.id)))[0]?.status).toBe('PENDING');
 });
 it('keeps open dossiers available to authorized Staff without cancellation and isolates a fresh registration with the same email',async()=>{
  const {actor,approved,input,data,ownerToken}=await fixture();const [programme]=await db.select().from(visaTypes).limit(1);
  const app=await createDraftApplication({agencyId:approved.agencyId,visaTypeId:programme!.id,createdBy:actor});
  await closeAgency(actor,input);
  const notes=new FormData();notes.set('applicationId',app.id);notes.set('internalNotes','Explicit ESSAFARIA follow-up after portal closure');request.cookie=ownerToken;
  try{await expect(updateInternalNotesAction(notes)).rejects.toMatchObject({digest:expect.stringContaining('ok=')});}finally{request.cookie='';}
  expect((await db.select().from(applications).where(eq(applications.id,app.id)))[0]?.internalNotes).toBe('Explicit ESSAFARIA follow-up after portal closure');
  const reg=await submitAgencyRegistration({data,files:[],ipAddress:nextIp()}),fresh=await approveRegistration({actor,registrationId:reg.id});
  expect(fresh.agencyId).not.toBe(approved.agencyId);expect(fresh.adminUserId).not.toBe(approved.adminUserId);
  const token=await issueAccessToken(actor,fresh.adminUserId,'ACTIVATION');await resetAccountFromToken(token.token,'Synthetic second violet river garden');
  const authenticated=await authenticate(data.email,'Synthetic second violet river garden');
  const signedIn={...authenticated,role:'AGENCY_ADMIN' as const,userStatus:authenticated.status,agencyStatus:'ACTIVE',agencyName:data.legalName};expect(signedIn.agencyId).toBe(fresh.agencyId);expect(signedIn.role).toBe('AGENCY_ADMIN');
  await expect(getApplicationForUser(app.id,signedIn)).rejects.toMatchObject({code:'NOT_FOUND'});
  const wallet=(await pool.query('select balance::text from agencies where id=$1',[fresh.agencyId])).rows[0];expect(wallet.balance).toBe('0.00');
 });
 it('makes concurrent closure retries idempotent with exactly one audit and no financial side effects',async()=>{
  const {actor,input,approved}=await fixture();
  const results=await Promise.all([closeAgency(actor,input),closeAgency(actor,input)]);
  expect(results.map(r=>r.status)).toEqual(['CLOSED','CLOSED']);
  expect((await db.select().from(auditLogs).where(eq(auditLogs.action,'AGENCY_CLOSED'))).filter(a=>a.entityId===approved.agencyId)).toHaveLength(1);
  expect((await pool.query('select count(*)::int n from wallet_transactions where agency_id=$1',[approved.agencyId])).rows[0].n).toBe(0);
 });
 it('serializes closure with an in-flight credit without losing retained money or accepting a post-closure movement',async()=>{
  const {actor,input,approved}=await fixture();
  const credit=async()=>{const client=await pool.connect();try{await client.query('begin');await applyWalletMutation(client,{agencyId:approved.agencyId,operation:'CREDIT',amountAbs:'15.00',reason:'Synthetic concurrent credit',actorId:actor.id});await client.query('commit');}catch(error){await client.query('rollback');throw error;}finally{client.release();}};
  const [closed,credited]=await Promise.allSettled([closeAgency(actor,input),credit()]);expect(closed.status).toBe('fulfilled');
  const actual=(await pool.query('select balance::text,status from agencies where id=$1',[approved.agencyId])).rows[0];expect(actual.status).toBe('CLOSED');
  const [audit]=await db.select().from(auditLogs).where(and(eq(auditLogs.action,'AGENCY_CLOSED'),eq(auditLogs.entityId,approved.agencyId)));
  expect(audit?.metadata?.balance).toBe(actual.balance);
  const movements=(await pool.query('select count(*)::int n from wallet_transactions where agency_id=$1',[approved.agencyId])).rows[0].n;
  expect(movements).toBe(credited.status==='fulfilled'?1:0);expect(actual.balance).toBe(credited.status==='fulfilled'?'15.00':'0.00');
 });
});
