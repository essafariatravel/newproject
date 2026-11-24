"use client";
import { useEffect,useId,useMemo,useRef,useState,useTransition,type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DatePicker } from "@/components/date-picker";
import { useAgencyPopover } from "@/components/agency-popover-controller";
import { caseLink } from "./case-workspace";
type Item={id:string;title:string;detail:string;href:string;aliases?:string[]};
type Labels={search:string;placeholder:string;filters:string;status:string;all:string;from:string;to:string;apply:string;reset:string;suggestions:string;searching:string;unavailable:string;noSuggestions:string;loading:string};
function fold(s:string){return s.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().replace(/[أإآٱ]/g,"ا").trim()}
export function CaseFilters({locale,labels:t,query,recent,statuses,resetHref}:{locale:"fr"|"en"|"ar";labels:Labels;query:Record<string,string|undefined>;recent:Item[];statuses:{value:string;label:string}[];resetHref:string}){
 const router=useRouter(),uid=useId(),root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const [value,setValue]=useState(query.q??""),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[advanced,setAdvanced]=useState(false),[remote,setRemote]=useState<{q:string;items:Item[];error:boolean}|null>(null);
 const [pending,startTransition]=useTransition();
 useAgencyPopover(root,open,setOpen,input);
 const q=value.trim(),searchable=q.length>=3&&q.length<=80;
 useEffect(()=>{
  if(!open||!searchable)return;
  const abort=new AbortController();
  const timer=window.setTimeout(async()=>{
   try{
    const res=await fetch("/api/agency/dashboard-search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({q}),cache:"no-store",signal:abort.signal});
    if(!res.ok)throw Error("search");
    const data=await res.json() as {items:Item[]};
    if(!abort.signal.aborted){setActive(-1);setRemote({q,items:data.items,error:false})}
   }catch{if(!abort.signal.aborted)setRemote({q,items:[],error:true})}
  },400);
  return()=>{window.clearTimeout(timer);abort.abort()};
 },[q,open,searchable]);
 useEffect(()=>{function key(e:KeyboardEvent){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();input.current?.focus();setOpen(true)}}document.addEventListener("keydown",key);return()=>document.removeEventListener("keydown",key)},[]);
 const items=useMemo(()=>{
  const local=recent.filter(i=>[i.title,i.detail,...(i.aliases??[])].some(s=>fold(s).includes(fold(q))));
  const server=remote?.q===q&&!remote.error?remote.items:[];
  return [...new Map([...server,...local].map(i=>[i.id,i])).values()].slice(0,5);
 },[recent,q,remote]);
 useEffect(()=>{if(open&&active>=0)document.getElementById(uid+"-"+active)?.scrollIntoView({block:"nearest"})},[open,active,uid]);
 function choose(item:Item){setOpen(false);setActive(-1);startTransition(()=>router.push(item.href))}
 function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setOpen(false);setActive(-1);
  const params:Record<string,string>={};
  for(const [k,v] of new FormData(e.currentTarget))if(typeof v==="string"&&v.trim())params[k]=v.trim();
  startTransition(()=>router.push(caseLink(params)));
 }
 const busy=open&&searchable&&remote?.q!==q;
 const count=Number(Boolean(query.status))+Number(Boolean(query.from||query.to));
 return <form className="case-filters" action="/portal/applications" method="get" onSubmit={submit} aria-busy={pending} role="search">
  {["queue","documents","per"].map(k=>query[k]?<input key={k} type="hidden" name={k} value={query[k]}/>:null)}
  <div className="case-search-line">
   <div ref={root} className="case-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false)}}>
    <div className="case-search-input"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
     <label className="sr-only" htmlFor={uid}>{t.search}</label>
     <input ref={input} id={uid} name="q" type="search" dir="auto" className="input" value={value} placeholder={t.placeholder} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={uid+"-list"} aria-activedescendant={open&&items[active]?uid+"-"+active:undefined}
      onFocus={()=>setOpen(true)} onClick={()=>setOpen(true)} onChange={e=>{setValue(e.target.value);setRemote(null);setActive(-1);setOpen(true)}} onKeyDown={e=>{
       if(e.nativeEvent.isComposing)return;
       if(e.key==="Enter"&&open&&items[active]){e.preventDefault();choose(items[active]!)}
       else if(e.key==="Escape"&&open){e.preventDefault();setOpen(false);setActive(-1)}
       else if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setOpen(true);setActive(i=>items.length?Math.max(0,Math.min(items.length-1,i+(e.key==="ArrowDown"?1:-1))):-1)}
      }}/>
     <kbd aria-hidden="true">Ctrl K</kbd>
    </div>
    <div className="case-search-popup" hidden={!open}>
     <div id={uid+"-list"} role="listbox" aria-label={t.suggestions}>
      {items.map((item,i)=><div key={item.id} id={uid+"-"+i} role="option" aria-selected={i===active} onMouseDown={e=>e.preventDefault()} onMouseMove={()=>setActive(i)} onClick={()=>choose(item)}><div><strong><bdi>{item.title}</bdi></strong><small><bdi>{item.detail}</bdi></small></div><span aria-hidden="true">›</span></div>)}
     </div>
     <p role="status" aria-live="polite">{busy?t.searching:remote?.q===q&&remote.error?t.unavailable:!items.length?t.noSuggestions:""}</p>
    </div>
   </div>
   <button type="submit" className="btn-secondary" disabled={pending}>{t.search}</button>
   <button className="btn-secondary case-filter-toggle" type="button" aria-expanded={advanced} aria-controls={uid+"-filters"} onClick={()=>{setOpen(false);setAdvanced(v=>!v)}}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 5h14M6 10h8m-5 5h2"/></svg>{t.filters}{count?" ("+count+")":""}<span aria-hidden="true">{advanced?"⌃":"⌄"}</span></button>
  </div>
  <div id={uid+"-filters"} className="case-advanced" hidden={!advanced}>
   <div><label htmlFor={uid+"-status"}>{t.status}</label><select name="status" id={uid+"-status"} defaultValue={query.status??""} className="input"><option value="">{t.all}</option>{statuses.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
   <div><label htmlFor={uid+"-from"}>{t.from}</label><DatePicker id={uid+"-from"} ariaLabel={t.from} name="from" defaultValue={query.from??""} locale={locale}/></div>
   <div><label htmlFor={uid+"-to"}>{t.to}</label><DatePicker id={uid+"-to"} ariaLabel={t.to} name="to" defaultValue={query.to??""} locale={locale}/></div>
   <button type="submit" className="btn-primary" disabled={pending}>{t.apply}</button><Link href={resetHref} className="case-reset">{t.reset}</Link>
  </div>
  {!advanced&&(query.q||count)?<Link href={resetHref} className="case-reset">{t.reset}</Link>:null}
  {pending?<p className="case-loading" role="status" aria-live="polite">{t.loading}</p>:null}
 </form>;
}
