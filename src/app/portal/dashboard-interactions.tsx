"use client";
import {useEffect,useId,useMemo,useRef,useState,useTransition} from "react";
import {rankDestinations,type SearchDestination} from "./dashboard-search";
import {useRouter} from "next/navigation";
import Link from "next/link";
import { useAgencyPopover } from "@/components/agency-popover-controller";

export type Campaign={id:string;title:string;body:string;cta:string;href:string;image:string;smallImage:string};
type CampaignLabels={campaigns:string;previous:string;next:string;show:string;pause:string;play:string};
export function DashboardCampaigns({items,labels}:{items:Campaign[];labels:CampaignLabels}){
 const [index,setIndex]=useState(0),[hover,setHover]=useState(false),[focused,setFocused]=useState(false),[reduced,setReduced]=useState(true),[visible,setVisible]=useState(true),[stopped,setStopped]=useState(false);
 useEffect(()=>{const media=window.matchMedia("(prefers-reduced-motion: reduce)");const change=()=>setReduced(media.matches);change();media.addEventListener("change",change);const visibility=()=>setVisible(!document.hidden);visibility();document.addEventListener("visibilitychange",visibility);return()=>{media.removeEventListener("change",change);document.removeEventListener("visibilitychange",visibility)}},[]);
 useEffect(()=>{if(items.length<2||stopped||hover||focused||reduced||!visible)return;const timer=window.setTimeout(()=>setIndex(i=>(i+1)%items.length),7000);return()=>window.clearTimeout(timer)},[items.length,stopped,hover,focused,reduced,visible,index]);
 if(!items.length)return null;
 const current=index%items.length;
 const go=(delta:number)=>{setStopped(true);setIndex(i=>(i+delta+items.length)%items.length)};
 return <section className="dash-campaign" aria-label={labels.campaigns} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setFocused(false)}}>
  <div className="dash-campaign-slides" aria-live={stopped||reduced?"polite":"off"}>
   {items.map((item,i)=><div key={item.id} className="dash-campaign-content" data-campaign={item.id} data-current={i===current} aria-hidden={i!==current}>
    <picture className="dash-campaign-photo" aria-hidden="true"><source media="(max-width: 767px)" srcSet={item.smallImage}/>{/* Local pre-encoded images: no new image service or third-party request. */}{/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.image} alt="" loading={i===0?"eager":"lazy"} fetchPriority={i===0?"high":"low"} decoding="async"/></picture>
    <div className="dash-campaign-copy"><h2>{item.title}</h2><p>{item.body}</p><Link href={item.href} tabIndex={i===current?0:-1}>{item.cta} <span className="dash-arrow" aria-hidden="true">→</span></Link></div>
   </div>)}
  </div>
  {items.length>1?<div className="dash-campaign-controls" role="group" aria-label={labels.campaigns}>
   {!reduced?<button className="dash-rotation-toggle" type="button" onClick={()=>setStopped(v=>!v)} aria-label={stopped?labels.play:labels.pause} title={stopped?labels.play:labels.pause}>{stopped?labels.play:labels.pause}</button>:null}
   <button type="button" aria-label={labels.previous} onClick={()=>go(-1)}><svg className="dash-campaign-chevron dash-campaign-prev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14.5 5.5-6 6.5 6 6.5"/></svg></button>
   <span className="dash-campaign-dots"><span className="sr-only">{labels.show} {current+1} / {items.length}</span>{items.map((s,i)=><span key={s.id} className="dash-slide-dot" data-current={current===i?"true":"false"} aria-hidden="true"/>)}</span>
   <button type="button" aria-label={labels.next} onClick={()=>go(1)}><svg className="dash-campaign-chevron dash-campaign-next" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9.5 5.5 6 6.5-6 6.5"/></svg></button>
  </div>:null}
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
type Destination=SearchDestination;
type DestinationLabels={title:string;choose:string;search:string;none:string;noMatch:string;all:string;shortcuts:string;opening:string};
export function DashboardDestination({options,shortcutIds,locale,labels:t}:{options:Destination[];shortcutIds:string[];locale:string;labels:DestinationLabels}){
 const uid=useId(),root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null);
 const router=useRouter();
 const [query,setQuery]=useState(""),[open,setOpen]=useState(false),[active,setActive]=useState(0),[pending,startTransition]=useTransition();
 useAgencyPopover(root,open,setOpen);
 const matches=useMemo(()=>rankDestinations(options,query),[options,query]);
 const shortcuts=useMemo(()=>shortcutIds.flatMap(id=>options.filter(o=>o.id===id)),[options,shortcutIds]);
 const navigating=useRef(false);
 const choose=(o:Destination)=>{if(navigating.current||pending)return;navigating.current=true;setQuery(o.name);setOpen(false);startTransition(()=>router.push("/portal/applications/new?destination="+encodeURIComponent(o.id)));};
 useEffect(()=>{if(!pending)navigating.current=false;},[pending]);
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside)},[]);
 useEffect(()=>{const box=list.current,option=document.getElementById(uid+"-"+active);if(!open||!box||!option)return;const b=box.getBoundingClientRect(),o=option.getBoundingClientRect();if(o.bottom>b.bottom)box.scrollTop+=o.bottom-b.bottom;else if(o.top<b.top)box.scrollTop-=b.top-o.top;},[active,open,uid]);
 return <div className="dash-create" lang={locale} aria-busy={pending}>
  <label htmlFor={uid}>{t.title}</label><div className="dash-field-row"><div ref={root} className="dash-destination-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}}>
   <div className="dash-search-wrap"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18"/></svg>
    <input ref={input} id={uid} className="input" type="text" autoComplete="off" dir="auto" role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={uid+"-options"} aria-activedescendant={open&&matches[active]?uid+"-"+active:undefined} placeholder={t.search} value={query} readOnly={pending} onClick={()=>{if(!pending){setOpen(true);setActive(0)}}} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(0)}} onKeyDown={e=>{if(pending||e.nativeEvent.isComposing)return;if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setOpen(true);setActive(i=>!open?0:Math.max(0,Math.min(Math.max(0,matches.length-1),i+(e.key==="ArrowDown"?1:-1))))}else if(e.key==="Escape"){setOpen(false)}else if(e.key==="Enter"){e.preventDefault();if(open&&matches[active])choose(matches[active]!);else{setOpen(true);setActive(0)}}}}/>
    <button className="dash-picker-toggle" type="button" aria-label={t.all} disabled={pending} onClick={()=>{if(open){setOpen(false);return}setQuery("");setActive(0);setOpen(true);input.current?.focus()}}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 8 5 5 5-5"/></svg></button>
   </div>
   <div ref={list} id={uid+"-options"} role="listbox" aria-label={t.all} className="dash-destination-options" hidden={!open}>{matches.length?matches.map((o,i)=><div id={uid+"-"+i} key={o.id} role="option" aria-selected={i===active} className="dash-destination-option" data-active={i===active} onMouseDown={e=>e.preventDefault()} onMouseMove={()=>setActive(i)} onClick={()=>choose(o)}><CountryFlag iso={o.iso}/><span>{o.name}</span></div>):<p role="presentation">{options.length?t.noMatch:t.none}</p>}</div>
   <span className="sr-only" role="status" aria-live="polite">{open&&!matches.length?(options.length?t.noMatch:t.none):""}</span>
  </div></div>
  <div className="dash-destination-shortcuts" role="group" aria-label={t.shortcuts}>{pending?<span role="status" className="dash-opening">{t.opening}</span>:shortcuts.map(o=><button type="button" key={o.id} onClick={()=>choose(o)} disabled={pending}><CountryFlag iso={o.iso}/><span>{o.name}</span></button>)}</div>
 </div>;
}
