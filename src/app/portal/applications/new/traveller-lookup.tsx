"use client";
import {useRef,useEffect,useState} from "react";
import {hubCopy} from "@/lib/traveller-hub-copy";
import {safeLookupTerm,type TravellerMatch,type TravellerSource} from "@/lib/traveller-hub-policy";
export function TravellerLookup({locale,disabled,onChoose}:{locale:"fr"|"en"|"ar";disabled:boolean;onChoose:(s:TravellerSource)=>boolean}){
 const t=hubCopy[locale], [open,setOpen]=useState(false),[term,setTerm]=useState(""),[rows,setRows]=useState<TravellerMatch[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const active=useRef<AbortController|null>(null);
 useEffect(()=>()=>active.current?.abort(),[]);
 function cancel(){active.current?.abort();active.current=null;setBusy(false)}
 async function request(payload:Record<string,string>){
  cancel();const c=new AbortController();active.current=c;setBusy(true);setMessage("");
  try{const r=await fetch("/api/agency/travellers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store",signal:c.signal});if(!r.ok)throw Error("Unavailable");const data=await r.json();if(c.signal.aborted)return;
   if(payload.action==="search"){setRows(data.rows??[]);if(!data.rows?.length)setMessage(t.empty)}
   else if(data.source&&onChoose(data.source)){setOpen(false);setTerm("");setRows([])}
  }catch{if(!c.signal.aborted)setMessage(t.unavailable)}
  finally{if(active.current===c){active.current=null;setBusy(false)}}
 }
 return <div className="th-lookup"><button type="button" className="booking-link" aria-expanded={open} disabled={disabled} onClick={()=>{if(open)cancel();setOpen(!open);setRows([]);setMessage("")}}>{t.lookup} <span aria-hidden="true">{open?"−":"+"}</span></button>{open?<div className="th-lookup-body"><div className="th-search"><input type="search" autoComplete="off" value={term} maxLength={100} className="input" aria-label={t.lookupHint} placeholder={t.search} onChange={e=>{cancel();setTerm(e.currentTarget.value);setRows([]);setMessage("")}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();if(safeLookupTerm(term))void request({action:"search",q:term});else setMessage(t.minChars)}}}/><button type="button" className="btn-secondary" disabled={busy||disabled||!safeLookupTerm(term)} onClick={()=>void request({action:"search",q:term})}>{t.searchAction}</button></div>{busy?<small role="status">{t.searchBusy}</small>:null}{rows.length?<small>{t.chooseIdentity}</small>:null}{rows.map(r=><div key={r.id} className="th-reuse-row"><span><strong>{r.name}</strong><small><bdi>{r.nationality} · {r.passport} · {r.reference}</bdi></small></span><button type="button" className="btn-secondary" disabled={busy||disabled} onClick={()=>void request({action:"select",id:r.id})}>{t.choose}</button></div>)}{message?<p role="status">{message}</p>:null}</div>:null}</div>
}
