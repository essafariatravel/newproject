"use client";
import {useEffect,useRef,useState} from "react";
import {hubCopy} from "@/lib/traveller-hub-copy";
import type {ReuseFile} from "@/lib/traveller-hub-policy";
export function TravellerReuse({locale,sourceId,programmeId,options,onFile}:{programmeId:string;sourceId:string;locale:"fr"|"en"|"ar";options:ReuseFile[];onFile:(file:File)=>boolean}){
 const t=hubCopy[locale],controller=useRef<AbortController|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function load(d:ReuseFile){if(controller.current||!window.confirm(t.confirmReuse+(d.tripSpecific?"\n"+t.tripConfirm:"")))return;const c=new AbortController();controller.current=c;setBusy(true);setMessage("");try{
 const response=await fetch("/api/agency/travellers/"+sourceId+"/passport/"+d.id+"?programme="+encodeURIComponent(programmeId),{cache:"no-store",signal:c.signal,headers:{"X-Document-Intent":"download"}});
 if(!response.ok||Number(response.headers.get("content-length"))!==d.size)throw Error("Unavailable");
 const blob=await response.blob();if(c.signal.aborted)return;
 if(blob.size!==d.size||blob.type.toLowerCase()!==d.mime.toLowerCase())throw Error("Unavailable");
 if(onFile(new File([blob],d.name,{type:blob.type})))setMessage(t.reuseDone);
 }catch{if(!c.signal.aborted)setMessage(t.reuseFail)}finally{if(!c.signal.aborted)setBusy(false);controller.current=null}}
 if(!options.length)return null;
 return <div className="th-reuse"><strong>{t.reuse}</strong><small>{t.reuseNote}</small>{options.map(d=><div className="th-reuse-row" key={d.id}><span><bdi>{d.name}</bdi><small><bdi>{d.sourceReference} · {new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:"UTC"}).format(new Date(d.createdAt))}</bdi></small></span><button className="btn-secondary" type="button" disabled={busy} onClick={()=>void load(d)}>{busy?t.reuseBusy:t.choose}</button></div>)}{message?<p role="status">{message}</p>:null}</div>
}
