"use client";
import {useState} from "react";
import {authorizeMfaEnrollmentAction} from "@/app/actions/mfa-authorization";
export function MfaAuthorization({staff,labels}:{staff:Array<{id:string;name:string;email:string}>;labels:{title:string;instruction:string;issue:string;error:string}}){
  const [code,setCode]=useState("");const [failed,setFailed]=useState(false);const [busy,setBusy]=useState(false);
  return <form className="space-y-3" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);setBusy(true);setCode("");setFailed(false);try{const result=await authorizeMfaEnrollmentAction(String(data.get("userId")));if(result.code)setCode(result.code);else setFailed(true);}catch{setFailed(true);}finally{setBusy(false);}}}>
    <h2 className="text-lg font-semibold">{labels.title}</h2><p>{labels.instruction}</p>
    <label className="block" htmlFor="authorize-user">{labels.title}</label><select id="authorize-user" name="userId" className="input" required>{staff.map(user=><option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}</select>
    <button disabled={busy||!staff.length} className="btn btn-secondary">{labels.issue}</button>
    {failed&&<p role="alert">{labels.error}</p>}{code&&<p role="status"><code dir="ltr" className="break-all">{code}</code></p>}
  </form>;
}
