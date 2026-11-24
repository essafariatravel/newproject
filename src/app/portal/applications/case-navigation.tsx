"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
type Row={id:string;href:string};
type Snapshot={scope:string;context:string;rows:Row[];windowY:number;mainY:number};
let snapshot:Snapshot|null=null;
// In-memory only, no localStorage/sessionStorage, scoped to the authenticated user.
export function CaseListMemory({scope,context,rows}:{scope:string;context:string;rows:Row[]}){
 useEffect(()=>{
  const current=snapshot?.scope===scope&&snapshot.context===context?snapshot:null;
  const main=document.getElementById("workspace-main");
  const record:Snapshot={scope,context,rows,windowY:current?.windowY??0,mainY:current?.mainY??0};
  snapshot=record;let restoring=Boolean(current);
  let first=0,second=0;
  if(current){first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{window.scrollTo(0,record.windowY);if(main)main.scrollTop=record.mainY;restoring=false})})}
  const update=()=>{if(!restoring&&snapshot===record){record.windowY=window.scrollY;record.mainY=main?.scrollTop??0}};
  window.addEventListener("scroll",update,{passive:true});main?.addEventListener("scroll",update,{passive:true});
  return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);window.removeEventListener("scroll",update);main?.removeEventListener("scroll",update)};
 },[scope,context,rows]);
 return null;
}
export function CaseNavigation({scope,context,id,tab,locale}:{scope:string;context:string;id:string;tab:string;locale:"fr"|"en"|"ar"}){
 const [links,setLinks]=useState<{previous?:Row;next?:Row}|null>(null);
 useEffect(()=>{if(snapshot?.scope!==scope||snapshot.context!==context){setLinks(null);return}const rows=snapshot.rows,i=rows.findIndex(x=>x.id===id);setLinks(i<0?null:{previous:rows[i-1],next:rows[i+1]})},[scope,context,id]);
 if(!links?.previous&&!links?.next)return null;
 const t={fr:{prev:"Dossier précédent",next:"Dossier suivant"},en:{prev:"Previous case",next:"Next case"},ar:{prev:"الطلب السابق",next:"الطلب التالي"}}[locale];
 const href=(r:Row)=>r.href+(r.href.includes("?")?"&":"?")+"tab="+encodeURIComponent(tab);
 return <nav className="dossier-neighbours" aria-label={locale==="fr"?"Navigation entre dossiers":locale==="ar"?"التنقل بين الطلبات":"Case navigation"}>{links.previous?<Link href={href(links.previous)} prefetch={false}><span aria-hidden="true" className="directional">←</span> {t.prev}</Link>:null}{links.next?<Link href={href(links.next)} prefetch={false}>{t.next} <span aria-hidden="true" className="directional">→</span></Link>:null}</nav>
}
