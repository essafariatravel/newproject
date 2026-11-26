"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { requestCancellationAction, decideCancellationAction } from "@/app/actions/cancellations";
import { formatAmount } from "@/lib/format";
import { SubmitButton } from "@/components/forms";

export type CancellationLabels = {
 actions:string; request:string; review:string; direct:string; close:string; keep:string;
 requestBody:string; reviewBody:string; directBody:string; reason:string; decisionReason:string;
 maximum:string; refund:string; retained:string; currentBalance:string; projectedBalance:string;
 noRefund:string; full:string; approve:string; refuse:string; refuseBody:string;
 confirm:string; confirmRefusal:string; submit:string; submitApproval:string; submitRefusal:string;
 pending:string; requestReason:string; estimate:string; unavailable:string;
};

function cents(raw:string):number|null {
 const value=raw.trim().replace(",",".");
 if(!/^\d{1,12}(\.\d{1,2})?$/.test(value))return null;
 const [whole,fraction=""]=value.split(".");
 return Number(whole)*100+Number(fraction.padEnd(2,"0"));
}
function CloseFormButton({label,onClose,onPending}:{label:string;onClose:()=>void;onPending:(pending:boolean)=>void}){
 const {pending}=useFormStatus();
 const wasPending=useRef(false);
 useEffect(()=>{onPending(pending);if(wasPending.current&&!pending)onClose();wasPending.current=pending},[pending,onPending,onClose]);
 return <button type="button" className="btn-secondary" disabled={pending} onClick={onClose}>{label}</button>;
}
export function CancellationActionMenu({id,staff,requestId,requestReason,netPaid,walletBalance,reference,summary,locale,labels:t}:{
 id:string;staff:boolean;requestId:string|null;requestReason:string|null;netPaid:string|null;walletBalance:string|null;
 reference:string;summary:string;locale:"en"|"fr"|"ar";labels:CancellationLabels;
}){
 const dialog=useRef<HTMLDialogElement>(null);
 const menu=useRef<HTMLDetailsElement>(null);
 const trigger=useRef<HTMLElement>(null);
 const uid=useId();
 const [decision,setDecision]=useState<"APPROVED"|"REFUSED">("APPROVED");
 const [refund,setRefund]=useState("");
 const [reason,setReason]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const submitting=useRef(false);
 const max=netPaid===null?null:cents(netPaid);
 const value=cents(refund);
 const balance=walletBalance===null?null:cents(walletBalance);
 const valid=value!==null&&max!==null&&value<=max;
 const approved=decision==="APPROVED";
 const title=staff?(requestId?t.review:t.direct):t.request;
 const reset=()=>{setDecision("APPROVED");setRefund("");setReason("");setConfirmed(false)};
 const show=()=>{if(menu.current)menu.current.open=false;reset();dialog.current?.showModal()};
 const close=useCallback(()=>{if(!submitting.current)dialog.current?.close()},[]);
 const onPending=useCallback((p:boolean)=>{submitting.current=p},[]);
 const money=(n:number)=>formatAmount(n/100,"DZD",locale);
 useEffect(()=>{
   // The agency controller owns native cancellation menus (including 180 ms pointer exit).
   if(!staff&&menu.current?.closest(".workspace-agency"))return;
   function outside(e:PointerEvent){if(menu.current?.open&&!menu.current.contains(e.target as Node))menu.current.open=false;}
   function escape(e:KeyboardEvent){if(e.key==="Escape"&&menu.current?.open){menu.current.open=false;trigger.current?.focus();}}
   document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
   return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape)};
 },[staff]);
 return <>
 {staff&&requestId?<button ref={node=>{trigger.current=node}} type="button" onClick={show} className="btn-primary btn-sm">{t.review}</button>:
 <details ref={menu} className="cancellation-menu relative">
  <summary ref={node=>{trigger.current=node}} className="btn-secondary btn-sm cursor-pointer list-none" aria-haspopup="true">
   {t.actions}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m6 9 6 6 6-6"/></svg>
  </summary>
  <div className="cancellation-menu-items"><button type="button" onClick={show} className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm font-semibold text-red-700 hover:bg-slate-50">
   <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>{title}
  </button></div>
 </details>}
 <dialog ref={dialog} dir={locale==="ar"?"rtl":"ltr"} className="cancellation-dialog" aria-labelledby={uid+"-title"} onCancel={e=>{if(submitting.current)e.preventDefault()}} onClose={()=>{trigger.current?.focus()}}>
 <div className="cancellation-dialog-inner">
  <header className="flex items-start justify-between gap-4">
   <div><p className="text-xs font-semibold text-slate-500"><bdi>{reference}</bdi></p><h2 id={uid+"-title"} className="mt-2 text-xl font-semibold tracking-tight text-navy-900">{title}</h2></div>
   <button className="btn-secondary btn-sm min-h-11 min-w-11" type="button" onClick={close} aria-label={t.close}>×</button>
  </header>
  <p className="mt-3 text-sm leading-relaxed text-slate-600">{staff?(requestId?t.reviewBody:t.directBody):t.requestBody}</p>
  <div className="mt-4 rounded-lg border border-line bg-slate-50 p-4">
   <p className="text-sm font-semibold text-navy-900"><bdi>{summary}</bdi></p>
   {netPaid!==null?<p className="mt-2 text-sm text-slate-600">{t.maximum} <strong className="ms-1 text-navy-900 tabular-nums" dir="ltr">{formatAmount(netPaid,"DZD",locale)}</strong></p>:null}
   {requestReason?<div className="mt-3 border-t border-line pt-3"><p className="text-xs text-slate-500">{t.requestReason}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm"><bdi>{requestReason}</bdi></p></div>:null}
  </div>
  <form action={staff?decideCancellationAction:requestCancellationAction} className="mt-5 space-y-4">
   <input type="hidden" name="applicationId" value={id}/>
   {staff?<><input type="hidden" name="requestId" value={requestId??""}/><input type="hidden" name="decision" value={decision}/></>:null}
   {staff&&requestId?<fieldset className="grid grid-cols-2 gap-2"><legend className="sr-only">{t.review}</legend>
    {(["APPROVED","REFUSED"] as const).map(d=><button key={d} type="button" aria-pressed={decision===d} className={decision===d?"btn-primary":"btn-secondary"} onClick={()=>{setDecision(d);setConfirmed(false)}}>{d==="APPROVED"?t.approve:t.refuse}</button>)}
   </fieldset>:null}
   {staff&&approved?<div className="space-y-3">
    <label className="label" htmlFor={uid+"-refund"}>{t.refund} *</label>
    <input id={uid+"-refund"} name="refundAmount" className="input text-lg font-semibold tabular-nums" dir="ltr" inputMode="decimal" type="text" required value={refund} onChange={e=>{setRefund(e.target.value);setConfirmed(false)}} placeholder="0.00" aria-invalid={refund!==""&&!valid}/>
    {max!==null?<div className="flex flex-wrap gap-2">{[0,25,50,75,100].filter((_p,i)=>max!==0||i===0).map(p=><button key={p} type="button" className="btn-secondary btn-sm" aria-pressed={valid&&value===Math.round(max*p/100)} onClick={()=>{setRefund((Math.round(max*p/100)/100).toFixed(2));setConfirmed(false)}}>{p===0?t.noRefund:p===100?t.full:p+" %"}</button>)}</div>:<p role="alert" className="text-sm text-red-700">{t.unavailable}</p>}
    {valid&&max!==null&&value!==null?<div aria-live="polite" className="rounded-lg border border-line p-4 text-sm space-y-3">
     <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-600 transition-[width] motion-reduce:transition-none" style={{width:(max?value/max*100:0)+"%"}}/></div>
     <div className="flex justify-between gap-3"><span className="text-slate-600">{t.refund}</span><strong className="text-emerald-700 tabular-nums" dir="ltr">{money(value)}</strong></div>
     <div className="flex justify-between gap-3"><span className="text-slate-600">{t.retained}</span><strong dir="ltr" className="tabular-nums">{money(max-value)}</strong></div>
     {balance!==null?<div className="border-t border-line pt-3"><div className="flex justify-between gap-3"><span className="text-slate-600">{t.projectedBalance}</span><strong className="tabular-nums" dir="ltr">{money(balance+value)}</strong></div><p className="mt-1 text-xs text-slate-500">{t.estimate}</p></div>:null}
    </div>:null}
   </div>:staff?<p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{t.refuseBody}</p>:null}
   <div><label className="label" htmlFor={uid+"-reason"}>{staff?t.decisionReason:t.reason} *</label>
   {!staff?<div className="agency-cancel-reasons">{({fr:["Annulation à la demande du client","Changement de programme de voyage","Erreur lors de la soumission"],en:["Cancellation requested by the traveller","Change of travel plans","Submission error"],ar:["إلغاء بطلب من المسافر","تغيير برنامج السفر","خطأ أثناء تقديم الطلب"]}[locale]).map(choice=><button type="button" key={choice} aria-pressed={reason===choice} className="btn-secondary btn-sm" onClick={()=>{setReason(choice);setConfirmed(false)}}>{choice}</button>)}</div>:null}
   <textarea id={uid+"-reason"} name="reason" required minLength={8} maxLength={1000} rows={3} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false)}} className="input"/>
   <p className="mt-1 text-end text-xs text-slate-500 tabular-nums">{reason.length}/1000</p></div>
   {staff?<label className="flex items-start gap-3 text-sm"><input type="checkbox" required name="confirm" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{approved?t.confirm:t.confirmRefusal}</span></label>:null}
   <div className="cancellation-dialog-footer">
    <CloseFormButton label={staff?t.close:t.keep} onClose={close} onPending={onPending}/>
    <SubmitButton pendingLabel={t.pending} className={staff&&approved?"btn-danger":"btn-primary"} disabled={reason.trim().length<8||(staff&&(!confirmed||(approved&&!valid)))}>{staff?(approved?t.submitApproval:t.submitRefusal):t.submit}</SubmitButton>
   </div>
  </form>
 </div>
 </dialog>
 </>;
}
