"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {directoryCopy} from "@/lib/traveller-directory-copy";
import {hubCopy} from "@/lib/traveller-hub-copy";
import {nationalityLabel} from "@/lib/nationalities";
import {useAgencyPopover} from "@/components/agency-popover-controller";
type Match={id:string;name:string;nationality:string;reference:string;passport:string};
export function TravellerDirectorySearch({locale,q,filter}:{locale:"fr"|"en"|"ar";q:string;filter:string}){
 const t=directoryCopy[locale],root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const [value,setValue]=useState(q),[open,setOpen]=useState(false),[remote,setRemote]=useState<{q:string;rows:Match[];error:boolean}|null>(null);
 const term=value.trim();useAgencyPopover(root,open,setOpen,input);
 useEffect(()=>{if(!open||term.length<2)return;const c=new AbortController();const timer=setTimeout(async()=>{try{const r=await fetch("/api/agency/travellers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"directorySearch",q:term,filter}),cache:"no-store",signal:c.signal});if(!r.ok)throw Error("Search");const d=await r.json();if(!c.signal.aborted)setRemote({q:term,rows:d.rows??[],error:false})}catch{if(!c.signal.aborted)setRemote({q:term,rows:[],error:true})}},320);return()=>{clearTimeout(timer);c.abort()}},[term,open,filter]);
 const result=remote?.q===term?remote:null;
 return <form className="td-search" action="/portal/applicants"><div ref={root} className="td-search-main" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><label className="sr-only" htmlFor="traveller-q">{t.search}</label><input ref={input} id="traveller-q" name="q" type="search" autoComplete="off" maxLength={100} value={value} placeholder={t.search} onFocus={()=>setOpen(true)} onChange={e=>{setValue(e.target.value);setRemote(null);setOpen(true)}} onKeyDown={e=>{if(e.key==="Escape")setOpen(false)}}/><input type="hidden" name="filter" value={filter}/>{open&&term.length>=2?<div className="td-suggestions"><p>{t.suggestions}</p>{!result?<small role="status">{t.searching}</small>:result.error?<small role="status">{t.searchFail}</small>:!result.rows.length?<small role="status">{t.noMatches}</small>:result.rows.map(r=><Link key={r.id} href={"/portal/applicants/"+r.id}><span><strong>{r.name}</strong><small>{nationalityLabel(r.nationality,locale)} · <bdi>{r.passport}</bdi></small></span><span aria-hidden="true" className="td-arrow">→</span></Link>)}</div>:null}</div><button className="btn-primary" type="submit">{hubCopy[locale].searchAction}</button></form>
}
