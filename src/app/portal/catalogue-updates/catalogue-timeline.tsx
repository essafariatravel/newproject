"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {CountryFlag} from "@/components/country-flag";
import type {ChangeKind} from "@/lib/catalogue-change-model";
import {operationalCopy} from "@/lib/operational-copy";
export type TimelineRow={id:string;kind:ChangeKind;country:string;iso:string;programme:string;day:string;dayLabel:string;before:string;after:string;href:string};
const kinds=["all","published","price","duration","requirements","details"] as const;
type Filter=typeof kinds[number];
const labels={
 fr:{all:"Toutes",published:"Programmes",price:"Tarifs",duration:"Délais",requirements:"Documents",details:"Informations",search:"Rechercher une destination ou un visa",count:"évolutions affichées",old:"Avant",next:"Après",open:"Voir le programme",empty:"Aucun résultat pour ces critères.",reset:"Réinitialiser",period:"30 derniers jours",filter:"Type de modification",lower:"Baisse de tarif",higher:"Hausse de tarif"},
 en:{all:"All",published:"Programmes",price:"Prices",duration:"Processing",requirements:"Documents",details:"Information",search:"Search a destination or visa",count:"updates displayed",old:"Before",next:"After",open:"View programme",empty:"No matching updates.",reset:"Reset",period:"Last 30 days",filter:"Change type",lower:"Price decreased",higher:"Price increased"},
 ar:{all:"الكل",published:"البرامج",price:"الأسعار",duration:"المدد",requirements:"الوثائق",details:"المعلومات",search:"ابحثوا عن وجهة أو تأشيرة",count:"تحديثات معروضة",old:"قبل",next:"بعد",open:"عرض البرنامج",empty:"لا توجد نتائج مطابقة.",reset:"إعادة ضبط",period:"آخر 30 يوماً",filter:"نوع التغيير",lower:"انخفاض السعر",higher:"ارتفاع السعر"}
} as const;
function normalize(s:string){return s.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().trim()}
function ChangeIcon({kind}:{kind:ChangeKind}){
 return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
 {kind==="published"?<><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></>:kind==="price"?<><path d="M3 5h9l9 9-7 7-9-9V5Z"/><circle cx="8.5" cy="8.5" r="1"/></>:kind==="duration"?<><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>:kind==="requirements"?<><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 13h6M9 17h6"/></>:<><circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/></>}
 </svg>
}
export function CatalogueTimeline({rows,locale}:{rows:TimelineRow[];locale:"fr"|"en"|"ar"}){
 const t=labels[locale],copy=operationalCopy[locale];
 const [filter,setFilter]=useState<Filter>("all"),[search,setSearch]=useState("");
 const filtered=useMemo(()=>{const q=normalize(search);return rows.filter(r=>(filter==="all"||r.kind===filter)&&(!q||normalize(r.country+" "+r.iso+" "+r.programme+" "+copy[r.kind]).includes(q)))},[rows,filter,search,copy]);
 const groups=useMemo(()=>{const result:{day:string;label:string;items:TimelineRow[]}[]=[];for(const row of filtered){const group=result.at(-1);if(group?.day===row.day)group.items.push(row);else result.push({day:row.day,label:row.dayLabel,items:[row]})}return result},[filtered]);
 return <div className="ops-timeline">
 <div className="ops-feed-controls"><div className="ops-feed-search"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input className="input" type="search" value={search} onChange={e=>setSearch(e.target.value)} aria-label={t.search} placeholder={t.search}/></div><span className="ops-feed-period">{t.period}</span></div>
 <div className="ops-feed-tabs" role="group" aria-label={t.filter}>{kinds.map(k=><button type="button" key={k} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{t[k]}</button>)}</div>
 <div className="ops-feed-count" aria-live="polite"><span><bdi>{filtered.length}</bdi> {t.count}</span>{search||filter!=="all"?<button type="button" onClick={()=>{setSearch("");setFilter("all")}}>{t.reset}</button>:null}</div>
 {!groups.length?<p className="ops-feed-empty" role="status">{rows.length?t.empty:copy.noUpdates}</p>:groups.map(group=><section key={group.day} className="ops-feed-group" aria-label={group.label}>
 <h2><time dateTime={group.day}>{group.label}</time></h2>
 <ol>{group.items.map(r=><li key={r.id} className="ops-feed-row" data-kind={r.kind}>
 <div className="ops-feed-destination"><CountryFlag iso={r.iso}/><div><strong>{r.country}</strong><span>{r.programme}</span></div></div>
 <div className="ops-feed-change"><div className="ops-feed-event"><ChangeIcon kind={r.kind}/><strong>{copy[r.kind]}</strong></div>
 {r.kind==="price"||r.kind==="duration"?<div className="ops-feed-values"><div><small>{t.old}</small><bdi>{r.before}</bdi></div><span className="ops-direction" aria-hidden="true">→</span><div><small>{t.next}</small><strong><bdi>{r.after}</bdi></strong></div></div>:null}</div>
 <Link className="ops-feed-action" href={r.href} aria-label={t.open+" · "+r.country+" · "+r.programme}>{t.open}<span aria-hidden="true" className="ops-direction">→</span></Link>
 </li>)}</ol></section>)}
 </div>
}
