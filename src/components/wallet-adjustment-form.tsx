"use client";
import { useState } from "react";
import { adjustWalletAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/forms";
import { contentT } from "@/lib/i18n-content";
import { formatDZD } from "@/lib/format";
import type { UiLocale } from "@/lib/ui-i18n";
export function WalletAdjustmentForm({agencies,back,locale}:{agencies:{id:string;name:string;balance:string}[];back:string;locale:UiLocale}) {
  const ct=contentT(locale);
  const [agencyId,setAgencyId]=useState(agencies[0]?.id??""),[operation,setOperation]=useState("CREDIT"),[amount,setAmount]=useState(""),[confirmed,setConfirmed]=useState(false);
  const agency=agencies.find(row=>row.id===agencyId),value=Number(amount),result=Number(agency?.balance??0)+(operation==="CREDIT"?value:-value),valid=Boolean(agency)&&Number.isFinite(value)&&value>0&&result>=0;
  return <form action={adjustWalletAction} className="wallet-adjustment-form">
    <input type="hidden" name="back" value={back}/>
    <div><label className="label" htmlFor="adjust-agency">{ct("Agency")}</label><select id="adjust-agency" name="agencyId" className="input" value={agencyId} onChange={e=>{setAgencyId(e.target.value);setConfirmed(false);}} required>{agencies.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
    <div><label className="label" htmlFor="adjust-operation">{ct("Operation")}</label><select id="adjust-operation" name="operation" className="input" value={operation} onChange={e=>{setOperation(e.target.value);setConfirmed(false);}}><option value="CREDIT">{ct("Credit wallet")}</option><option value="DEBIT">{ct("Debit wallet")}</option></select></div>
    <div><label className="label" htmlFor="adjust-amount">{ct("Amount (DZD)")}</label><input id="adjust-amount" name="amount" className="input" type="number" min="0.01" max="10000000" step="0.01" required value={amount} onChange={e=>{setAmount(e.target.value);setConfirmed(false);}}/></div>
    <div><label className="label" htmlFor="adjust-reason">{ct("Reason (mandatory)")}</label><input id="adjust-reason" name="reason" className="input" minLength={5} maxLength={500} required onChange={()=>setConfirmed(false)}/></div>
    <div className="wallet-adjustment-preview" aria-live="polite"><p>{ct("Current balance")}: <bdi dir="ltr">{formatDZD(agency?.balance??0)}</bdi></p><p>{ct("Balance after confirmation")}: <strong><bdi dir="ltr">{valid?formatDZD(result):"—"}</bdi></strong></p><small>{ct("The server recalculates the final balance when applying the adjustment.")}</small></div>
    <label className="wallet-adjustment-confirm"><input type="checkbox" name="confirmed" value="yes" required checked={confirmed} disabled={!valid} onChange={e=>setConfirmed(e.target.checked)}/>{ct("I confirm this agency, amount and resulting balance.")}</label>
    <SubmitButton className="btn-primary" disabled={!valid||!confirmed} pendingLabel={ct("Adjusting…")}>{ct("Apply adjustment")}</SubmitButton>
  </form>;
}
