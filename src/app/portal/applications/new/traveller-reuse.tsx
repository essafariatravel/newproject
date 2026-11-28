"use client";
import {useEffect,useRef,useState} from "react";
import {hubCopy} from "@/lib/traveller-hub-copy";
import {fetchTravellerFile} from "./traveller-file-fetch";
import type {ReuseFile} from "@/lib/traveller-hub-policy";
export function TravellerReuse({locale,sourceId,programmeId,options,onFile}:{programmeId:string;sourceId:string;locale:"fr"|"en"|"ar";options:ReuseFile[];onFile:(file:File)=>boolean}){
 const t=hubCopy[locale],controller=useRef<AbortController|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function load(d:ReuseFile){if(controller.current||!window.confirm(t.confirmReuse+(d.tripSpecific?"\n"+t.tripConfirm:"")))return;const c=new AbortController();controller.current=c;setBusy(true);setMessage("");try{
 const file=await fetchTravellerFile(sourceId,programmeId,d,c.signal);if(!c.signal.aborted&&onFile(file))setMessage(t.reuseDone);
 }catch{if(!c.signal.aborted)setMessage(t.reuseFail)}finally{if(!c.signal.aborted)setBusy(false);controller.current=null}}
 if(!options.length)return null;
 return <div className="th-reuse"><strong>{t.reuse}</strong><small>{t.reuseNote}</small>{options.map(d=><div className="th-reuse-row" key={d.id}><span><bdi>{d.name}</bdi><small><bdi>{d.sourceReference} · {new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:"UTC"}).format(new Date(d.createdAt))}</bdi></small></span><button className="btn-secondary" type="button" disabled={busy} onClick={()=>void load(d)}>{busy?t.reuseBusy:t.choose}</button></div>)}{message?<p role="status">{message}</p>:null}</div>
}
