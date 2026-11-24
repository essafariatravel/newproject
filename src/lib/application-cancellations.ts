import type { PoolClient } from "pg";
import { after } from "next/server";
import { pool } from "@/lib/db";
import { qualifiedTable as table } from "@/lib/database-schema";
import { AppError, isAgencyRole, isStaffRole, type AuthUser } from "@/lib/types";
import { currentOperationActorPg } from "@/lib/operation-identity";
import { requirePermission } from "@/lib/rbac";
import { recordAuditPg } from "@/lib/audit";
import { applyWalletMutation } from "@/lib/wallet";
import { dispatchStaffPush } from "@/lib/push-service";

export type CancellationRow = {
 id: string; origin: "AGENCY" | "STAFF"; status: "PENDING" | "APPROVED" | "REFUSED";
 request_reason: string; requested_at: Date; decision_reason: string | null;
 decided_at: Date | null; refund_amount: string | null;
};
export const CANCELLATION_ERRORS = {
 state: "Only submitted, open applications can be cancelled.",
 pending: "A cancellation request is already awaiting a decision.",
 noPending: "This cancellation request is no longer pending.",
 useWorkflow: "Resolve the pending cancellation request first.",
 funds: "The refund cannot exceed the net amount paid for this application.",
 mismatch: "The payment ledger requires reconciliation before cancellation.",
 amount: "Enter an explicit refund amount (0 or more, with at most two decimals).",
 reason: "Enter a reason between 8 and 1000 characters.",
} as const;

export function cancellationAmountCents(raw: string): bigint {
 const value = raw.trim().replace(",", ".");
 if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) throw new AppError("VALIDATION", CANCELLATION_ERRORS.amount);
 const [whole, fraction = ""] = value.split(".");
 return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2,"0"));
}
function money(cents: bigint): string {
 return (cents / 100n).toString() + "." + (cents % 100n).toString().padStart(2,"0");
}
function reasonOf(raw: string): string {
 const reason = raw.trim();
 if (reason.length < 8 || reason.length > 1000) throw new AppError("VALIDATION", CANCELLATION_ERRORS.reason);
 return reason;
}
type LockedApplication = {
 id: string; agency_id: string; reference: string; status_id: string; status_code: string;
 is_terminal: boolean; is_draft: boolean; submitted_at: Date | null;
 effective_price: string | null; submitted_price: string | null; submitted_currency: string | null;
};
async function lockApplication(client: PoolClient,id: string,actor: AuthUser): Promise<LockedApplication> {
 const {rows} = await client.query<LockedApplication>(`
 select a.id,a.agency_id,a.reference,a.status_id,s.code status_code,s.is_terminal,s.is_draft,
 a.submitted_at,a.effective_price::text,a.submitted_price::text,a.submitted_currency
 from ${table("applications")} a join ${table("statuses")} s on s.id=a.status_id
 where a.id=$1 for update of a for share of s`,[id]);
 const app=rows[0];
 if(!app || (actor.agencyId && actor.agencyId!==app.agency_id)) throw new AppError("NOT_FOUND","Application not found.");
 if(!app.submitted_at || app.is_draft || app.is_terminal) throw new AppError("BAD_STATE",CANCELLATION_ERRORS.state);
 return app;
}
async function notify(client: PoolClient,app: LockedApplication,kind: string,reason: string,staff: boolean): Promise<string[]> {
 const rows=await client.query<{id:string}>(`
 insert into ${table("notifications")}(user_id,agency_id,application_id,type,title,body,link)
 select u.id,$1,$2,$3,$4,$5,$6 from ${table("users")} u
 where u.status='ACTIVE' and not u.activation_pending and
 ${staff ? "u.agency_id is null and u.role in ('SUPER_ADMIN','ADMIN','VISA_AGENT','ACCOUNTING')" : "u.agency_id=$1 and u.role in ('AGENCY_ADMIN','AGENCY_USER')"}
 returning id`,[app.agency_id,app.id,kind,kind,reason, (staff?"/admin":"/portal")+"/applications/"+app.id+"#cancellation"]);
 return rows.rows.map(row=>row.id);
}
function sendPush(ids: string[]) {
 if(!ids.length)return;
 try {after(async()=>{try{await dispatchStaffPush(ids)}catch{console.warn("[cancellation] push delivery unavailable")}})}catch{/* no request context */}
}
export async function listApplicationCancellations(id:string,actor:AuthUser):Promise<CancellationRow[]> {
 if(actor.agencyId ? !isAgencyRole(actor.role) : !isStaffRole(actor.role)) throw new AppError("FORBIDDEN","You are not authorized to perform this action.");
 const rows=await pool.query<CancellationRow>(`
 select r.id,r.origin,r.status,r.request_reason,r.requested_at,r.decision_reason,r.decided_at,r.refund_amount::text
 from ${table("application_cancellation_requests")} r join ${table("applications")} a on a.id=r.application_id
 where a.id=$1 and ($2::uuid is null or a.agency_id=$2)
 order by r.requested_at desc,r.id desc`,[id,actor.agencyId]);
 return rows.rows;
}

export async function requestApplicationCancellation(params:{applicationId:string;actor:AuthUser;reason:string}):Promise<string> {
 if(!params.actor.agencyId || !isAgencyRole(params.actor.role)) throw new AppError("FORBIDDEN","Only agency users can request cancellation.");
 const reason=reasonOf(params.reason);
 const client=await pool.connect();let ids:string[]=[];let requestId:string;
 try{
  await client.query("begin");
  const actor=await currentOperationActorPg(client,params.actor);
  const app=await lockApplication(client,params.applicationId,actor);
  const exists=await client.query(`select 1 from ${table("application_cancellation_requests")} where application_id=$1 and status in ('PENDING','APPROVED')`,[app.id]);
  if(exists.rowCount)throw new AppError("DUPLICATE",CANCELLATION_ERRORS.pending);
  const inserted=await client.query<{id:string}>(`insert into ${table("application_cancellation_requests")}(application_id,origin,status,requested_by,request_reason) values($1,'AGENCY','PENDING',$2,$3) returning id`,[app.id,actor.id,reason]);
  requestId=inserted.rows[0]!.id;
  await recordAuditPg(client,{actor,action:"CANCELLATION_REQUESTED",entity:"application",entityId:app.id,agencyId:app.agency_id,metadata:{requestId,reason}});
  ids=await notify(client,app,"CANCELLATION_REQUESTED",reason,true);
  await client.query("commit");
 }catch(e){await client.query("rollback").catch(()=>{});throw e}finally{client.release()}
 sendPush(ids);return requestId!;
}

export async function decideApplicationCancellation(params:{
 applicationId:string;actor:AuthUser;requestId?:string|null;decision:"APPROVED"|"REFUSED";reason:string;refundAmount?:string;
}):Promise<{refundAmount:string|null;requestId:string}> {
 if(params.actor.agencyId || !isStaffRole(params.actor.role)) throw new AppError("FORBIDDEN","You are not authorized to perform this action.");
 requirePermission(params.actor,"applications.status.change");requirePermission(params.actor,"applications.pricing.adjust");
 const reason=reasonOf(params.reason);
 if(!["APPROVED","REFUSED"].includes(params.decision))throw new AppError("VALIDATION","Choose a final decision.");
 const cents=params.decision==="APPROVED"?cancellationAmountCents(params.refundAmount??""):null;
 const amount=cents===null?null:money(cents);
 const client=await pool.connect();
 try{
  await client.query("begin");
  const actor=await currentOperationActorPg(client,params.actor);
  requirePermission(actor,"applications.status.change");requirePermission(actor,"applications.pricing.adjust");
  const app=await lockApplication(client,params.applicationId,actor);
  const pending=(await client.query<{id:string}>(`select id from ${table("application_cancellation_requests")} where application_id=$1 and status='PENDING' for update`,[app.id])).rows[0];
  if(params.requestId ? pending?.id!==params.requestId : Boolean(pending)) throw new AppError("BAD_STATE",params.requestId?CANCELLATION_ERRORS.noPending:CANCELLATION_ERRORS.useWorkflow);
  if(params.decision==="REFUSED"&&!pending)throw new AppError("BAD_STATE",CANCELLATION_ERRORS.noPending);
  let requestId=pending?.id;
  let walletId:string|null=null, adjustmentId:string|null=null;
  if(cents!==null){
   // Validate the immutable debit and all existing adjustments; never trust a form price.
   const ledger=(await client.query<{charges:number;net:string;invalid:number}>(`
    select count(*) filter(where type='APPLICATION_CHARGE')::int charges,
    coalesce(sum(case when type in ('APPLICATION_CHARGE','COMMERCIAL_SURCHARGE') then amount when type='COMMERCIAL_DISCOUNT' then -amount else 0 end),0)::text net,
    count(*) filter(where currency<>'DZD' or agency_id<>$2 or type not in ('APPLICATION_CHARGE','COMMERCIAL_SURCHARGE','COMMERCIAL_DISCOUNT'))::int invalid
    from ${table("wallet_transactions")} where application_id=$1`,[app.id,app.agency_id])).rows[0]!;
   if(app.submitted_currency!=="DZD" || app.submitted_price===null || app.effective_price===null || ledger.charges!==1 || ledger.invalid!==0 || ledger.net.startsWith("-") ||
     cancellationAmountCents(ledger.net)!==cancellationAmountCents(app.effective_price))
    throw new AppError("BAD_STATE",CANCELLATION_ERRORS.mismatch);
   const before=cancellationAmountCents(app.effective_price);
   if(cents>before)throw new AppError("VALIDATION",CANCELLATION_ERRORS.funds);
   const after=money(before-cents);
   if(cents>0n){
    const wallet=await applyWalletMutation(client,{agencyId:app.agency_id,applicationId:app.id,operation:"CREDIT",type:"COMMERCIAL_DISCOUNT",amountAbs:amount!,reason:"Cancellation refund — "+app.reference+" — "+reason,actorId:actor.id});
    walletId=wallet.transactionId;
    adjustmentId=(await client.query<{id:string}>(`insert into ${table("application_price_adjustments")}(application_id,type,amount,currency,reason,effective_before,effective_after,wallet_transaction_id,actor_id,idempotency_key)
     values($1,'REFUND',$2,'DZD',$3,$4,$5,$6,$7,$8) returning id`,[app.id,amount,reason,money(before),after,walletId,actor.id,"cancellation-"+app.id])).rows[0]!.id;
    await client.query(`update ${table("applications")} set effective_price=$2,updated_at=now() where id=$1`,[app.id,after]);
    await recordAuditPg(client,{actor,action:"PRICE_ADJUSTED",entity:"application",entityId:app.id,agencyId:app.agency_id,metadata:{type:"REFUND",amount,reason,adjustmentId,walletTransactionId:walletId,effectiveBefore:money(before),effectiveAfter:after,currency:"DZD",source:"CANCELLATION"}});
   }
  }
  if(requestId){
   await client.query(`update ${table("application_cancellation_requests")} set status=$2,decided_by=$3,decided_at=now(),decision_reason=$4,refund_amount=$5,wallet_transaction_id=$6,price_adjustment_id=$7 where id=$1`,[requestId,params.decision,actor.id,reason,amount,walletId,adjustmentId]);
  }else{
   requestId=(await client.query<{id:string}>(`insert into ${table("application_cancellation_requests")}(application_id,origin,status,requested_by,request_reason,decided_by,decided_at,decision_reason,refund_amount,wallet_transaction_id,price_adjustment_id)
    values($1,'STAFF','APPROVED',$2,$3,$2,now(),$3,$4,$5,$6) returning id`,[app.id,actor.id,reason,amount,walletId,adjustmentId])).rows[0]!.id;
  }
  if(params.decision==="APPROVED"){
   const cancelled=(await client.query<{id:string}>(`select id from ${table("statuses")} where code='CANCELLED' and active and is_terminal for share`)).rows[0];
   if(!cancelled)throw new AppError("CONFIG_ERROR","Cancellation status is unavailable.");
   await client.query(`update ${table("applications")} set status_id=$2,completed_at=now(),updated_at=now() where id=$1`,[app.id,cancelled.id]);
   await client.query(`insert into ${table("application_status_history")}(application_id,from_status_id,to_status_id,changed_by,reason) values($1,$2,$3,$4,$5)`,[app.id,app.status_id,cancelled.id,actor.id,reason]);
   await client.query(`update ${table("document_requests")} set status='CANCELLED',updated_at=now() where application_id=$1 and status='OPEN'`,[app.id]);
  }
  const kind=params.decision==="APPROVED"?"CANCELLATION_APPROVED":"CANCELLATION_REFUSED";
  await recordAuditPg(client,{actor,action:kind,entity:"application",entityId:app.id,agencyId:app.agency_id,metadata:{requestId,origin:pending?"AGENCY":"STAFF",reason,refundAmount:amount,walletTransactionId:walletId,adjustmentId}});
  await client.query(`update ${table("notifications")} set read_at=coalesce(read_at,now()) where application_id=$1 and type='CANCELLATION_REQUESTED' and user_id in (select id from ${table("users")} where agency_id is null)`,[app.id]);
  await notify(client,app,kind,reason,false);
  await client.query("commit");
  return {requestId:requestId!,refundAmount:amount};
 }catch(e){await client.query("rollback").catch(()=>{});throw e}finally{client.release()}
}
