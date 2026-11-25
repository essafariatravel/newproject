"use client";
import {useState} from "react";
import Link from "next/link";
type Locale="fr"|"en"|"ar";
type Event={key:string;at:string;kind:"status"|"request"|"received"|"message";title:string;code:string;reason:string|null;href:string|null};
const copy={fr:{all:"Tout",documents:"Documents",status:"Statuts",message:"Messages",details:"Détail de l’événement",open:"Consulter",events:"événements",none:"Aucun événement dans cette vue."},en:{all:"All",documents:"Documents",status:"Statuses",message:"Messages",details:"Event details",open:"View",events:"events",none:"No events in this view."},ar:{all:"الكل",documents:"الوثائق",status:"الحالات",message:"الرسائل",details:"تفاصيل الحدث",open:"عرض",events:"أحداث",none:"لا توجد أحداث في هذا العرض."}};
function tone(e:Event){return e.kind==="request"?"warning":e.kind==="received"?"received":e.kind==="status"&&["APPROVED","COMPLETED"].includes(e.code)?"received":e.kind==="status"&&["REJECTED","REFUSED","CANCELLED"].includes(e.code)?"danger":e.kind==="status"&&["IN_PROCESS","EMBASSY_SENT"].includes(e.code)?"warning":"neutral"}
export function SmartTimeline({locale,events,empty,initialEvent}:{locale:Locale;events:Event[];empty:string;initialEvent?:string}){
 const t=copy[locale],fmt=locale==="fr"?"fr-DZ":locale==="ar"?"ar-DZ":"en-GB";
 const day=(at:string)=>new Intl.DateTimeFormat(fmt,{dateStyle:"long",timeZone:"Africa/Algiers"}).format(new Date(at));
 const hour=(at:string)=>new Intl.DateTimeFormat(fmt,{hour:"2-digit",minute:"2-digit",timeZone:"Africa/Algiers"}).format(new Date(at));
 const [filter,setFilter]=useState<"all"|"documents"|"status"|"message">("all"),[selected,setSelected]=useState(events.find(e=>e.key===initialEvent)?.key??events[0]?.key??""),[expanded,setExpanded]=useState<string[]>([]);
 const visible=events.filter(e=>filter==="all"||(filter==="documents"?e.kind==="request"||e.kind==="received":e.kind===filter));
 const active=visible.find(e=>e.key===selected)??visible[0];
 const groups=Array.from(new Set(visible.map(e=>day(e.at))));
 if(!events.length)return <p>{empty}</p>;
 return <div className="smart-timeline"><nav className="smart-timeline-filters" aria-label={t.details}>{(["all","documents","status","message"] as const).map(f=><button key={f} type="button" aria-pressed={filter===f} onClick={()=>{setFilter(f);setExpanded([])}}>{t[f]}</button>)}</nav>
 <div className="smart-timeline-grid"><div className="smart-timeline-list">{groups.length?groups.map((g,i)=>{const rows=visible.filter(e=>day(e.at)===g),open=i===0||expanded.includes(g)||rows.some(e=>e.key===active?.key);return <section key={g}><button className="smart-timeline-day" type="button" aria-expanded={open} disabled={i===0||rows.some(e=>e.key===active?.key)} onClick={()=>setExpanded(v=>v.includes(g)?v.filter(x=>x!==g):[...v,g])}><strong>{g}</strong><span>{rows.length} {t.events} {open?"−":"+"}</span></button>{open?<div className="smart-timeline-rail">{rows.map(e=><button key={e.key} type="button" className="smart-timeline-row" aria-pressed={active?.key===e.key} onClick={()=>setSelected(e.key)}><span className="smart-timeline-dot" data-tone={tone(e)}/><span><strong>{e.title}</strong>{e.reason?<small>{e.reason.split(" · ")[0]}</small>:null}</span><time dateTime={e.at}>{hour(e.at)}</time></button>)}</div>:null}</section>}):<p>{t.none}</p>}</div>
 {active?<section className="smart-timeline-detail" key={active.key} aria-label={t.details}><p className="smart-timeline-caption">{t.details}</p><h3>{active.title}</h3><time dateTime={active.at}>{day(active.at)} · {hour(active.at)}</time>{active.reason?<p className="smart-timeline-reason">{active.reason}</p>:null}{active.href?<Link className="btn-primary btn-sm" href={active.href}>{t.open} <span className="directional" aria-hidden="true">→</span></Link>:null}</section>:null}</div></div>
}
