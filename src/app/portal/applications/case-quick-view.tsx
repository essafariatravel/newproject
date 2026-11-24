"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import Link from "next/link";
type Locale="fr"|"en"|"ar";
type Summary={id:string;href:string;traveller:string;reference:string;destination:string;status:string;elapsed:string|null;updated:string;fee:string;progress:string;actionHref:string;actionText:string|null;official:boolean};
type Verified={id:string;name:string};
const labels={fr:{preview:"Aperçu rapide",decision:"Décision",close:"Fermer",state:"Statut",time:"Durée",updated:"Dernière activité",fee:"Frais",docs:"Pièces requises",open:"Ouvrir le dossier",check:"Vérifier la décision officielle",busy:"Vérification…",none:"Aucun document officiel vérifié disponible.",error:"Vérification indisponible. Réessayez.",download:"Télécharger"},en:{preview:"Quick preview",decision:"Decision",close:"Close",state:"Status",time:"Duration",updated:"Last activity",fee:"Fee",docs:"Required documents",open:"Open case",check:"Verify official decision",busy:"Verifying…",none:"No verified official document available.",error:"Verification unavailable. Try again.",download:"Download"},ar:{preview:"معاينة سريعة",decision:"القرار",close:"إغلاق",state:"الحالة",time:"المدة",updated:"آخر نشاط",fee:"الرسوم",docs:"الوثائق المطلوبة",open:"فتح الطلب",check:"التحقق من القرار الرسمي",busy:"جارٍ التحقق…",none:"لا توجد وثيقة رسمية تم التحقق منها.",error:"التحقق غير متاح. أعد المحاولة.",download:"تنزيل"}};
const Context=createContext<(id:string,decision:boolean,trigger:HTMLElement)=>void>(()=>{});
export function CaseQuickView({id,reference,decisionTrigger,locale}:{id:string;reference:string;decisionTrigger:boolean;locale:Locale}){
 const open=useContext(Context),t=labels[locale];
 return <button type="button" className="case-preview-trigger" aria-label={(decisionTrigger?t.decision:t.preview)+" "+reference} title={decisionTrigger?t.decision:t.preview} onClick={e=>open(id,decisionTrigger,e.currentTarget)}>{decisionTrigger?t.decision:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>}</button>
}
export function CaseQuickViewProvider({rows,locale,children}:{rows:Summary[];locale:Locale;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLElement|null>(null),[selected,setSelected]=useState<string|null>(null),[files,setFiles]=useState<Verified[]>([]),[phase,setPhase]=useState<"idle"|"loading"|"ready"|"error">("idle"),abort=useRef<AbortController|null>(null);
 const p=rows.find(r=>r.id===selected),t=labels[locale];
 useEffect(()=>()=>abort.current?.abort(),[]);
 async function verify(id:string){
  abort.current?.abort();const a=new AbortController();abort.current=a;setPhase("loading");setFiles([]);
  try{const r=await fetch("/api/agency/cases/"+encodeURIComponent(id)+"/decision",{method:"POST",cache:"no-store",signal:a.signal});if(!r.ok)throw Error("decision");const data=await r.json() as {files:Verified[]};if(!a.signal.aborted){setFiles(data.files);setPhase("ready")}}catch{if(!a.signal.aborted)setPhase("error")}
 }
 function show(id:string,decision:boolean,source:HTMLElement){const row=rows.find(r=>r.id===id);if(!row)return;abort.current?.abort();trigger.current=source;setSelected(id);setFiles([]);setPhase("idle");ref.current?.showModal();if(decision&&row.official)void verify(id)}
 return <Context.Provider value={show}>{children}<dialog ref={ref} className="case-quick-dialog" aria-label={t.preview} onClose={()=>{abort.current?.abort();setSelected(null);setFiles([]);trigger.current?.focus({preventScroll:true})}}>
 {p?<><div className="case-dialog-header"><h2><bdi>{p.traveller}</bdi></h2><button type="button" className="case-dialog-close" aria-label={t.close} onClick={()=>ref.current?.close()}>×</button></div>
 <p><bdi>{p.reference}</bdi> · {p.destination}</p><dl>{[[t.state,p.status],[t.time,p.elapsed??"—"],[t.updated,p.updated],[t.docs,p.progress],[t.fee,p.fee]].map(([k,v])=><div key={k}><dt>{k}</dt><dd><bdi>{v}</bdi></dd></div>)}</dl>
 <div className="case-quick-actions"><Link className="btn-primary" href={p.href} onClick={()=>ref.current?.close()}>{t.open}</Link>{p.actionText&&!p.official?<Link className="btn-secondary" href={p.actionHref} onClick={()=>ref.current?.close()}>{p.actionText}</Link>:null}
 {p.official?<><button className="btn-secondary" type="button" disabled={phase==="loading"} onClick={()=>verify(p.id)}>{phase==="loading"?t.busy:t.check}</button><p role="status">{phase==="error"?t.error:phase==="ready"&&!files.length?t.none:""}</p>{files.map(f=><a className="btn-secondary" key={f.id} href={"/api/documents/"+encodeURIComponent(f.id)}>{t.download} · <bdi>{f.name}</bdi></a>)}</>:null}</div></>:null}
 </dialog></Context.Provider>
}
