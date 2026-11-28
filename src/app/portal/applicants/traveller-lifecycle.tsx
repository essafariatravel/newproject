"use client";
import {useRouter} from "next/navigation";
import {useState} from "react";
import {lifeCopy} from "@/lib/traveller-lifecycle-copy";
type Compare={id:string;name:string;passport:string;expiry:string|null;dob:string|null;version:number;eligible:boolean};
export function TravellerLifecycle({locale,id,version,archived,mergedInto,anchor,candidates}:{locale:"fr"|"en"|"ar";id:string;version:number;archived:boolean;mergedInto:string|null;anchor:Compare;candidates:Compare[]}){
 const t=lifeCopy[locale],router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function act(action:"archive"|"restore"|"merge",source?:Compare){if(busy||!window.confirm(action==="archive"?t.confirmArchive:action==="restore"?t.confirmRestore:t.confirmMerge))return;setBusy(true);setMessage("");try{const r=await fetch("/api/agency/travellers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,id,version,sourceId:source?.id,sourceVersion:source?.version})});if(!r.ok)throw Error("Failed");router.refresh()}catch{setMessage(t.error)}finally{setBusy(false)}}
 if(mergedInto)return <p className="th-note">{t.archived} · <a className="booking-link" href={"/portal/applicants/"+mergedInto}>{t.merged}</a></p>;
 return <section className="th-lifecycle"><button type="button" disabled={busy} className="btn-secondary" onClick={()=>void act(archived?"restore":"archive")}>{archived?t.restore:t.archive}</button>{archived?<p className="th-note">{t.archived}</p>:null}{!archived&&candidates.length?<details className="th-version-history"><summary>{t.comparison}</summary>{candidates.map(c=><div key={c.id} className="th-merge-compare"><div>{[anchor,c].map(a=><div key={a.id}><strong>{a.name}</strong><small>{t.passport}: <bdi>{a.passport}</bdi></small><small>{t.dob}: <bdi>{a.dob??"—"}</bdi></small><small>{t.expiry}: <bdi>{a.expiry??"—"}</bdi></small></div>)}</div>{c.eligible?<button type="button" className="btn-secondary" disabled={busy} onClick={()=>void act("merge",c)}>{t.merge}</button>:<p className="th-note">{t.blocked}</p>}</div>)}</details>:null}{message?<p role="alert" className="th-note">{message}</p>:null}</section>
}
