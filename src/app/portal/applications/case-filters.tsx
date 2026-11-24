"use client";
import { useEffect,useId,useMemo,useRef,useState,useTransition,type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DatePicker } from "@/components/date-picker";
import { useAgencyPopover } from "@/components/agency-popover-controller";
import { caseLink, detailLink, casePeriod, caseSearch, caseFocus } from "./case-workspace";
type Item={id:string;title:string;detail:string;href:string;aliases?:string[]};
type Labels={search:string;placeholder:string;filters:string;status:string;all:string;from:string;to:string;apply:string;reset:string;suggestions:string;searching:string;unavailable:string;noSuggestions:string;loading:string};
function fold(s:string){return s.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().replace(/[أإآٱ]/g,"ا").trim()}
export function CaseFilters({locale,labels:t,query,currentPage,recent,statuses,countries,resetHref}:{locale:"fr"|"en"|"ar";labels:Labels;query:Record<string,string|undefined>;currentPage:number;recent:Item[];statuses:{value:string;label:string}[];countries:{value:string;label:string}[];resetHref:string}){
 const router=useRouter(),uid=useId(),root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const [value,setValue]=useState(query.q??""),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[advanced,setAdvanced]=useState(false),[remote,setRemote]=useState<{q:string;items:Item[];error:boolean}|null>(null);
 const [pending,startTransition]=useTransition();
 const cache=useRef(new Map<string,Item[]>());
 useAgencyPopover(root,open,setOpen,input);
 const q=value.trim(),searchable=q.length>=3&&q.length<=80;
 useEffect(()=>{
  if(!open||!searchable)return;
  const hit=cache.current.get(q);if(hit){setRemote({q,items:hit,error:false});return}
  const abort=new AbortController();
  const timer=window.setTimeout(async()=>{
   try{
    const res=await fetch("/api/agency/cases/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({q,filters:query}),cache:"no-store",signal:abort.signal});
    if(!res.ok)throw Error("search");
    const data=await res.json() as {items:Item[]};
    if(!abort.signal.aborted){if(cache.current.size>=12)cache.current.clear();cache.current.set(q,data.items);setActive(-1);setRemote({q,items:data.items,error:false})}
   }catch{if(!abort.signal.aborted)setRemote({q,items:[],error:true})}
  },q.length>=8?250:350);
  return()=>{window.clearTimeout(timer);abort.abort()};
 },[q,open,searchable]);
 useEffect(()=>{function key(e:KeyboardEvent){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();input.current?.focus();setOpen(true)}}document.addEventListener("keydown",key);return()=>document.removeEventListener("keydown",key)},[]);
 const items=useMemo(()=>{
  const local=recent.filter(i=>[i.title,i.detail,...(i.aliases??[])].some(s=>fold(s).includes(fold(q))));
  const server=remote?.q===q&&!remote.error?remote.items:[];
  return [...new Map([...server,...local].map(i=>[i.id,i])).values()].slice(0,5);
 },[recent,q,remote]);
 useEffect(()=>{if(open&&active>=0)document.getElementById(uid+"-"+active)?.scrollIntoView({block:"nearest"})},[open,active,uid]);
 function choose(item:Item){setOpen(false);setActive(-1);startTransition(()=>router.push(detailLink(item.id,caseLink({...query,page:String(currentPage)}))))}
 function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setOpen(false);setActive(-1);
  const params:Record<string,string>={};
  for(const [k,v] of new FormData(e.currentTarget))if(typeof v==="string"&&v.trim())params[k]=v.trim();
  startTransition(()=>router.push(caseLink(params)));
 }
 const busy=open&&searchable&&remote?.q!==q;
 const interpretedPeriod=casePeriod(query.q),interpreted=caseSearch(interpretedPeriod.text);
 const count=Number(Boolean(query.focus))+Number(Boolean(query.status))+Number(Boolean(query.from||query.to))+Number(Boolean(query.country))+Number(query.missing==="1");
 const extra={fr:{country:"Destination",sort:"Trier par",recent:"Dernière activité",submitted:"Soumission récente",oldest:"Plus anciens",priority:"Action prioritaire",missing:"Pièces manquantes",date:"JJ/MM/AAAA",allCases:"Suggestions dans tous vos dossiers"},en:{country:"Destination",sort:"Sort by",recent:"Last activity",submitted:"Recently submitted",oldest:"Oldest first",priority:"Action priority",missing:"Missing documents",date:"DD/MM/YYYY",allCases:"Suggestions across all your cases"},ar:{country:"الوجهة",sort:"الترتيب",recent:"آخر نشاط",submitted:"أحدث تقديم",oldest:"الأقدم",priority:"أولوية الإجراء",missing:"وثائق ناقصة",date:"يوم/شهر/سنة",allCases:"اقتراحات من جميع طلباتكم"}}[locale];
 const viewLabels={fr:{unread:"Messages non lus",cancellation:"Annulations en attente",stale:"Sans activité depuis 7 jours",decision:"Dossiers avec décision",missing:"Pièces manquantes",views:"Vues rapides",clear:"Retirer"},en:{unread:"Unread messages",cancellation:"Pending cancellations",stale:"Inactive for 7 days",decision:"Cases with a decision",missing:"Missing documents",views:"Quick views",clear:"Remove"},ar:{unread:"رسائل غير مقروءة",cancellation:"إلغاءات معلقة",stale:"دون نشاط منذ 7 أيام",decision:"طلبات بقرار",missing:"وثائق ناقصة",views:"عروض سريعة",clear:"إزالة"}}[locale];
 const chips=[{key:"status",label:statuses.find(s=>s.value===query.status)?.label},{key:"country",label:countries.find(s=>s.value===query.country)?.label},{key:"from",label:query.from?t.from+" "+query.from:undefined},{key:"to",label:query.to?t.to+" "+query.to:undefined},{key:"missing",label:query.missing==="1"?viewLabels.missing:undefined},{key:"focus",label:caseFocus(query.focus)?viewLabels[caseFocus(query.focus)!]:undefined}].filter(c=>c.label);
 return <form className="case-filters" action="/portal/applications" method="get" onSubmit={submit} aria-busy={pending} role="search">
  {["queue","documents","per","focus"].map(k=>query[k]?<input key={k} type="hidden" name={k} value={query[k]}/>:null)}
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
     <p className="case-search-scope">{({fr:"Suggestions dans la vue actuelle",en:"Suggestions in current view",ar:"اقتراحات في العرض الحالي"}[locale])}</p><div id={uid+"-list"} role="listbox" aria-label={t.suggestions}>
      {items.map((item,i)=><div key={item.id} id={uid+"-"+i} role="option" aria-selected={i===active} onMouseDown={e=>e.preventDefault()} onMouseMove={()=>setActive(i)} onClick={()=>choose(item)}><div><strong><bdi>{item.title}</bdi></strong><small><bdi>{item.detail}</bdi></small></div><span aria-hidden="true">›</span></div>)}
     </div>
     <p role="status" aria-live="polite">{busy?t.searching:remote?.q===q&&remote.error?t.unavailable:!items.length?t.noSuggestions:""}</p>
    </div>
   </div>
   <button type="submit" className="btn-secondary" disabled={pending}>{t.search}</button>
   <button className="btn-secondary case-filter-toggle" type="button" aria-expanded={advanced} aria-controls={uid+"-filters"} onClick={()=>{setOpen(false);setAdvanced(v=>!v)}}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 5h14M6 10h8m-5 5h2"/></svg>{t.filters}{count?" ("+count+")":""}<span aria-hidden="true">{advanced?"⌃":"⌄"}</span></button>
  <div className="case-sort-line"><label htmlFor={uid+"-sort"}>{extra.sort}</label><select id={uid+"-sort"} name="sort" className="case-sort" value={query.sort??"recent"} onChange={e=>{setOpen(false);const form=e.currentTarget.form;const params:Record<string,string>={};if(form)for(const [k,v] of new FormData(form))if(typeof v==="string"&&v.trim())params[k]=v.trim();startTransition(()=>router.push(caseLink({...params,sort:e.target.value})))}}><option value="recent">{extra.recent}</option><option value="submitted">{extra.submitted}</option><option value="oldest">{extra.oldest}</option><option value="priority">{extra.priority}</option></select></div></div>
  <div id={uid+"-filters"} className="case-advanced case-advanced-v4" hidden={!advanced}>
   <div><label htmlFor={uid+"-status"}>{t.status}</label><select name="status" id={uid+"-status"} defaultValue={query.status??""} className="input"><option value="">{t.all}</option>{statuses.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
   <div><label htmlFor={uid+"-from"}>{t.from}</label><DatePicker id={uid+"-from"} ariaLabel={t.from} name="from" defaultValue={query.from??""} locale={locale} displayDayFirst placeholder={extra.date}/></div>
   <div><label htmlFor={uid+"-to"}>{t.to}</label><DatePicker id={uid+"-to"} ariaLabel={t.to} name="to" defaultValue={query.to??""} locale={locale} displayDayFirst placeholder={extra.date}/></div>
   <div><label htmlFor={uid+"-country"}>{extra.country}</label><select id={uid+"-country"} name="country" defaultValue={query.country??""} className="input"><option value="">{t.all}</option>{countries.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
   <label className="case-missing"><input type="checkbox" name="missing" value="1" defaultChecked={query.missing==="1"}/>{extra.missing}</label><div className="case-filter-actions"><button type="submit" className="btn-primary" disabled={pending}>{t.apply}</button><Link href={resetHref} className="case-reset">{t.reset}</Link></div>
  </div>
  {(interpreted.statusCode||interpreted.missing||interpretedPeriod.period)&&query.q?<p className="case-interpreted" role="status">{({fr:"Recherche interprétée :",en:"Interpreted search:",ar:"تفسير البحث:"}[locale])} {[(interpreted.q??""),statuses.find(s=>s.value===interpreted.statusCode)?.label,interpreted.missing?extra.missing:null,interpretedPeriod.period?({fr:{today:"Aujourd’hui",week:"Cette semaine",month:"Ce mois-ci"},en:{today:"Today",week:"This week",month:"This month"},ar:{today:"اليوم",week:"هذا الأسبوع",month:"هذا الشهر"}}[locale][interpretedPeriod.period]):null].filter(Boolean).join(" · ")}</p>:null}
  {chips.length>0?<div className="case-filter-chips">{chips.map(c=><Link key={c.key} href={caseLink({...query,[c.key]:undefined})} aria-label={viewLabels.clear+" "+c.label}>{c.label} <span aria-hidden="true">×</span></Link>)}</div>:null}
  <details className="case-quick-views"><summary>{viewLabels.views}</summary><div>{(["unread","cancellation","stale","decision"] as const).map(v=><Link key={v} href={caseLink({...query,focus:query.focus===v?undefined:v})} aria-current={query.focus===v?"true":undefined}>{viewLabels[v]}</Link>)}<Link href={caseLink({...query,missing:query.missing==="1"?undefined:"1"})}>{viewLabels.missing}</Link></div></details>
  {!advanced&&(query.q||count)?<Link href={resetHref} className="case-reset">{t.reset}</Link>:null}
  {pending?<p className="case-loading" role="status" aria-live="polite">{t.loading}</p>:null}
 </form>;
}
