"use client";
import {useEffect,useId,useRef,useState} from "react";
import Link from "next/link";

export type Campaign={id:string;eyebrow:string;title:string;body:string;cta:string;href:string;image:string};
type CampaignLabels={campaigns:string;pause:string;play:string;previous:string;next:string;show:string};
export function DashboardCampaigns({items,labels}:{items:Campaign[];labels:CampaignLabels}){
 const [index,setIndex]=useState(0),[paused,setPaused]=useState(false),[hover,setHover]=useState(false),[focused,setFocused]=useState(false),[reduced,setReduced]=useState(true),[visible,setVisible]=useState(true);
 useEffect(()=>{const media=window.matchMedia("(prefers-reduced-motion: reduce)");const change=()=>setReduced(media.matches);change();media.addEventListener("change",change);const visibility=()=>setVisible(!document.hidden);visibility();document.addEventListener("visibilitychange",visibility);return()=>{media.removeEventListener("change",change);document.removeEventListener("visibilitychange",visibility)}},[]);
 useEffect(()=>{if(items.length<2||paused||hover||focused||reduced||!visible)return;const timer=window.setInterval(()=>setIndex(i=>(i+1)%items.length),7000);return()=>window.clearInterval(timer)},[items.length,paused,hover,focused,reduced,visible,index]);
 const item=items[index%Math.max(1,items.length)];if(!item)return null;
 const go=(n:number)=>setIndex((n+items.length)%items.length);
 return <section className="dash-campaign" aria-label={labels.campaigns} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setFocused(false)}}>
  <div key={item.id} className="dash-campaign-content"><div className="dash-campaign-copy"><span>{item.eyebrow}</span><h2>{item.title}</h2><p>{item.body}</p><Link href={item.href}>{item.cta} <span className="dash-arrow" aria-hidden="true">→</span></Link></div><div className="dash-campaign-photo" aria-hidden="true" style={{backgroundImage:`url("${item.image}")`}}/></div>
  {items.length>1?<div className="dash-campaign-controls" aria-label={labels.campaigns}><button type="button" aria-label={labels.previous} onClick={()=>go(index-1)}><svg className="dash-chevron dash-prev" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m7 5 5 5-5 5"/></svg></button>{items.map((s,i)=><button key={s.id} className="dash-slide-dot" type="button" aria-label={`${labels.show} ${i+1}`} aria-current={index===i?"true":undefined} onClick={()=>go(i)}><span/></button>)}<button type="button" aria-label={labels.next} onClick={()=>go(index+1)}><svg className="dash-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m7 5 5 5-5 5"/></svg></button>{!reduced?<button type="button" aria-label={paused?labels.play:labels.pause} title={paused?labels.play:labels.pause} onClick={()=>setPaused(p=>!p)}>{paused?"▶":"Ⅱ"}</button>:null}</div>:null}
 </section>;
}

export function CountryFlag({iso}:{iso:string}){
 const code=iso.toUpperCase();
 // The four current preview destinations use scalable local inline flag artwork;
 // any additional country uses its Unicode flag with a visible country name.
 if(["CN","FR","TR","AE"].includes(code))return <svg className="dash-flag" aria-hidden="true" viewBox="0 0 30 20">
 {code==="FR"?<><path fill="#1b3988" d="M0 0h10v20H0z"/><path fill="#fff" d="M10 0h10v20H10z"/><path fill="#e33d42" d="M20 0h10v20H20z"/></>:code==="AE"?<><path fill="#19834b" d="M0 0h30v7H0z"/><path fill="#fff" d="M0 7h30v6H0z"/><path fill="#171717" d="M0 13h30v7H0z"/><path fill="#dc303b" d="M0 0h8v20H0z"/></>:code==="TR"?<><path fill="#df2435" d="M0 0h30v20H0z"/><circle cx="12" cy="10" r="5.6" fill="white"/><circle cx="13.8" cy="9.6" r="4.5" fill="#df2435"/><path fill="white" d="m18 6.7 1 2.3 2.6.2-2 1.7.7 2.4-2.3-1.4-2.1 1.4.6-2.4-2-1.7 2.6-.2z"/></>:<><path fill="#de292e" d="M0 0h30v20H0z"/><path fill="#ffdb36" d="m5.5 2 1 2.8 3 .1-2.4 1.8.9 2.8-2.5-1.7L3 9.5l.9-2.8-2.4-1.8 3-.1z"/>{[[11,2.8],[13,5],[13,8],[11,10]].map(([x,y],i)=><path key={i} fill="#ffdb36" transform={`translate(${x},${y}) scale(.34)`} d="m0 -4 1 2.8 3 .1-2.4 1.8.9 2.8L0 1.8l-2.5 1.7.9-2.8-2.4-1.8 3-.1z"/>)}</>}
 </svg>;
 return <span className="dash-flag-emoji" aria-hidden="true">{/^[A-Z]{2}$/.test(code)?String.fromCodePoint(...Array.from(code,c=>127397+c.charCodeAt(0))):"◌"}</span>;
}
type Destination={id:string;name:string;iso:string;aliases:string};
type DestinationLabels={title:string;choose:string;search:string;none:string;noMatch:string;all:string;continue:string};
const normalize=(s:string)=>s.normalize("NFD").replace(/\p{M}/gu,"").toLocaleLowerCase().trim();
export function DashboardDestination({options,locale,labels:t}:{options:Destination[];locale:string;labels:DestinationLabels}){
 const uid=useId(),root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const [query,setQuery]=useState(""),[selected,setSelected]=useState<Destination|null>(null),[open,setOpen]=useState(false),[active,setActive]=useState(0);
 const matches=options.filter(o=>normalize(o.name+" "+o.aliases+" "+o.iso).includes(normalize(query)));
 const choose=(o:Destination)=>{setSelected(o);setQuery(o.name);setOpen(false);input.current?.focus();};
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside)},[]);
 useEffect(()=>{if(open)document.getElementById(uid+"-"+active)?.scrollIntoView({block:"nearest"});},[active,open,uid]);
 return <form action="/portal/applications/new" method="get" className="dash-create" onSubmit={e=>{if(!selected)e.preventDefault()}}>
  <label htmlFor={uid}>{t.title}</label><div className="dash-field-row"><div ref={root} className="dash-destination-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}}>
   <input type="hidden" name="destination" value={selected?.id??""}/>
   <div className="dash-search-wrap">{selected?<CountryFlag iso={selected.iso}/>:<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18"/></svg>}
    <input ref={input} id={uid} className="input" type="text" autoComplete="off" dir="auto" role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={uid+"-options"} aria-activedescendant={open&&matches[active]?uid+"-"+active:undefined} placeholder={t.search} value={query} onClick={()=>{if(selected){setQuery("");setSelected(null)}setOpen(true);setActive(0)}} onChange={e=>{setSelected(null);setQuery(e.target.value);setOpen(true);setActive(0)}} onKeyDown={e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setOpen(true);setActive(i=>!open?0:Math.max(0,Math.min(matches.length-1,i+(e.key==="ArrowDown"?1:-1))))}else if(e.key==="Escape"){setOpen(false)}else if(e.key==="Enter"&&open){e.preventDefault();if(matches[active])choose(matches[active]!)}}}/>
    <button className="dash-picker-toggle" type="button" aria-label={t.all} onClick={()=>{if(open){setOpen(false);return}setQuery("");setSelected(null);setActive(0);setOpen(true);input.current?.focus()}}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 8 5 5 5-5"/></svg></button>
   </div>
   <div id={uid+"-options"} role="listbox" aria-label={t.all} className="dash-destination-options" hidden={!open}>{matches.length?matches.map((o,i)=><div id={uid+"-"+i} key={o.id} role="option" aria-selected={selected?.id===o.id} className="dash-destination-option" data-active={i===active} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(o)}><CountryFlag iso={o.iso}/><span>{o.name}</span>{selected?.id===o.id?<span aria-hidden="true">✓</span>:null}</div>):<p role="status">{options.length?t.noMatch:t.none}</p>}</div>
  </div><button className="btn-primary" type="submit" disabled={!selected}>{t.continue}<span className="dash-arrow" aria-hidden="true"> →</span></button></div>
 </form>;
}
