"use client";
import {useEffect,useRef,useState,useId} from "react";
import Link from "next/link";
type Locale="fr"|"en"|"ar";
const recent=new Map<string,{id:string;tab:string;at:number}>();
const TTL=30*60*1000;
export function HomeCaseVisit({scope,id,tab}:{scope:string;id:string;tab:string}){
 useEffect(()=>{if(!scope||!id)return;recent.clear();recent.set(scope,{id,tab,at:Date.now()})},[scope,id,tab]);return null;
}
export function HomeResume({scope,locale,exclude,knownCases=[]}:{scope:string;locale:Locale;exclude?:string;knownCases?:{id:string;name:string}[]}){
 const [visit,setVisit]=useState<{id:string;tab:string}|null>(null);
 useEffect(()=>{const value=recent.get(scope);setVisit(value&&Date.now()-value.at<TTL&&value.id!==exclude?value:null)},[scope,exclude]);
 const t={fr:"Reprendre le dernier dossier consulté",en:"Resume last viewed case",ar:"متابعة آخر طلب تمت معاينته"}[locale];
 return visit?<Link className="home-action-row" href={"/portal/applications/"+encodeURIComponent(visit.id)+"?tab="+encodeURIComponent(visit.tab)}><span className="home-message-dot"/><span><strong>{t}</strong>{knownCases.find(c=>c.id===visit.id)?.name?<small><bdi>{knownCases.find(c=>c.id===visit.id)?.name}</bdi></small>:null}</span><span className="home-action-cta" aria-hidden="true">→</span></Link>:null;
}
const labels={fr:{preview:"Aperçu du dossier",close:"Fermer",destination:"Destination",status:"Statut",activity:"Dernière activité",reference:"Référence",open:"Ouvrir le dossier",document:"Compléter les documents",decision:"Consulter la décision"},en:{preview:"Case preview",close:"Close",destination:"Destination",status:"Status",activity:"Last activity",reference:"Reference",open:"Open case",document:"Complete documents",decision:"View decision"},ar:{preview:"معاينة الطلب",close:"إغلاق",destination:"الوجهة",status:"الحالة",activity:"آخر نشاط",reference:"المرجع",open:"فتح الطلب",document:"استكمال الوثائق",decision:"عرض القرار"}};
export function HomeCasePreview({locale,name,reference,destination,status,activity,href,action}:{locale:Locale;name:string;reference:string;destination:string;status:string;activity:string;href:string;action:"documents"|"decision"|"view"}){
 const t=labels[locale],uid=useId(),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 return <><button ref={trigger} className="home-case-preview-trigger" type="button" aria-label={t.preview+" — "+name} title={t.preview} onClick={()=>dialog.current?.showModal()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg></button><dialog ref={dialog} className="home-case-preview" aria-labelledby={uid} onClose={()=>trigger.current?.focus({preventScroll:true})} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close()}}><header><div><p>{t.preview}</p><h2 id={uid}><bdi>{name}</bdi></h2></div><button type="button" aria-label={t.close} onClick={()=>dialog.current?.close()}>×</button></header><dl>{[[t.reference,reference],[t.destination,destination],[t.status,status],[t.activity,activity]].map(([key,value])=><div key={key}><dt>{key}</dt><dd><bdi>{value}</bdi></dd></div>)}</dl><Link className="btn-primary" href={href} onClick={()=>dialog.current?.close()}>{action==="documents"?t.document:action==="decision"?t.decision:t.open} →</Link></dialog></>
}
