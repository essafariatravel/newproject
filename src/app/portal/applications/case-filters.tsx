"use client";
import { useEffect,useId,useMemo,useRef,useState,useTransition,type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DatePicker } from "@/components/date-picker";
import { CaseSelectField } from "./case-select-field";
import { useAgencyPopover } from "@/components/agency-popover-controller";
import { caseLink, detailLink, casePeriod, caseSearch, caseFocus } from "./case-workspace";
type Item={id:string;title:string;detail:string;href:string;aliases?:string[]};
type Labels={search:string;placeholder:string;filters:string;status:string;all:string;from:string;to:string;apply:string;reset:string;suggestions:string;searching:string;unavailable:string;noSuggestions:string;loading:string};
function fold(s:string){return s.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().replace(/[أإآٱ]/g,"ا").trim()}
export function CaseFilters({locale,labels:t,query,currentPage,recent,statuses,countries,resetHref}:{locale:"fr"|"en"|"ar";labels:Labels;query:Record<string,string|undefined>;currentPage:number;recent:Item[];statuses:{value:string;label:string}[];countries:{value:string;label:string}[];resetHref:string}){
 const router=useRouter(),uid=useId(),root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),filterDialog=useRef<HTMLDialogElement>(null),filterButton=useRef<HTMLButtonElement>(null);
 const [value,setValue]=useState(query.q??""),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[advanced,setAdvanced]=useState(false),[filterVersion,setFilterVersion]=useState(0),[remote,setRemote]=useState<{q:string;items:Item[];error:boolean}|null>(null);
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
  return (q.length>=3&&remote?.q===q&&!remote.error?server:[...new Map([...server,...local].map(i=>[i.id,i])).values()]).slice(0,5);
 },[recent,q,remote]);
 useEffect(()=>{if(open&&active>=0)document.getElementById(uid+"-"+active)?.scrollIntoView({block:"nearest"})},[open,active,uid]);
 function choose(item:Item){setOpen(false);setActive(-1);startTransition(()=>router.push(detailLink(item.id,caseLink({...query,page:String(currentPage)}))))}
 function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setOpen(false);setActive(-1);
  const params:Record<string,string>={};
  for(const [k,v] of new FormData(e.currentTarget))if(typeof v==="string"&&v.trim())params[k]=v.trim();
  if(filterDialog.current?.open)filterDialog.current.close();
  startTransition(()=>router.push(caseLink(params)));
 }
 const busy=open&&searchable&&remote?.q!==q;
 const interpretedPeriod=casePeriod(query.q),interpreted=caseSearch(interpretedPeriod.text);
 const count=Number(Boolean(query.focus))+Number(Boolean(query.status))+Number(Boolean(query.from||query.to))+Number(Boolean(query.country))+Number(query.missing==="1");
 const extra={fr:{country:"Destination",sort:"Trier par",recent:"Dernière activité",submitted:"Soumission récente",oldest:"Plus anciens",priority:"Action prioritaire",missing:"Pièces manquantes",date:"JJ/MM/AAAA",allCases:"Suggestions dans tous vos dossiers"},en:{country:"Destination",sort:"Sort by",recent:"Last activity",submitted:"Recently submitted",oldest:"Oldest first",priority:"Action priority",missing:"Missing documents",date:"DD/MM/YYYY",allCases:"Suggestions across all your cases"},ar:{country:"الوجهة",sort:"الترتيب",recent:"آخر نشاط",submitted:"أحدث تقديم",oldest:"الأقدم",priority:"أولوية الإجراء",missing:"وثائق ناقصة",date:"يوم/شهر/سنة",allCases:"اقتراحات من جميع طلباتكم"}}[locale];
 const viewLabels={fr:{unread:"Messages non lus",cancellation:"Annulations en attente",stale:"Sans activité depuis 7 jours",decision:"Dossiers avec décision",missing:"Pièces manquantes",views:"Vues rapides",clear:"Retirer"},en:{unread:"Unread messages",cancellation:"Pending cancellations",stale:"Inactive for 7 days",decision:"Cases with a decision",missing:"Missing documents",views:"Quick views",clear:"Remove"},ar:{unread:"رسائل غير مقروءة",cancellation:"إلغاءات معلقة",stale:"دون نشاط منذ 7 أيام",decision:"طلبات بقرار",missing:"وثائق ناقصة",views:"عروض سريعة",clear:"إزالة"}}[locale];
 const fluid={fr:{title:"Affiner les dossiers",close:"Fermer",today:"Aujourd’hui",week:"7 derniers jours",month:"30 derniers jours",date:"Période de soumission",shortcuts:"Accès rapides",clear:"Effacer"},en:{title:"Refine cases",close:"Close",today:"Today",week:"Last 7 days",month:"Last 30 days",date:"Submission period",shortcuts:"Quick access",clear:"Clear"},ar:{title:"تصفية الطلبات",close:"إغلاق",today:"اليوم",week:"آخر 7 أيام",month:"آخر 30 يومًا",date:"فترة التقديم",shortcuts:"وصول سريع",clear:"مسح"}}[locale];
 const chips=[{key:"status",label:statuses.find(s=>s.value===query.status)?.label},{key:"country",label:countries.find(s=>s.value===query.country)?.label},{key:"from",label:query.from?t.from+" "+query.from:undefined},{key:"to",label:query.to?t.to+" "+query.to:undefined},{key:"missing",label:query.missing==="1"?viewLabels.missing:undefined},{key:"focus",label:caseFocus(query.focus)?viewLabels[caseFocus(query.focus)!]:undefined}].filter(c=>c.label);
 return <form className="case-filters" action="/portal/applications" method="get" onSubmit={submit} aria-busy={pending} role="search">
  {["queue","documents","per","focus"].map(k=>query[k]?<input key={k} type="hidden" name={k} value={query[k]}/>:null)}
  <div className="case-search-line fluid-search-line"><div className="fluid-search-shell">
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
   <button type="submit" className="btn-primary fluid-search-submit" disabled={pending}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>{t.search}</button></div>
   <button ref={filterButton} className="btn-secondary case-filter-toggle" type="button" aria-haspopup="dialog" aria-expanded={advanced} aria-controls={uid+"-filters"} onClick={()=>{setOpen(false);filterDialog.current?.showModal();setAdvanced(true)}}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 5h14M6 10h8m-5 5h2"/></svg>{t.filters}{count?" ("+count+")":""}<span aria-hidden="true">{advanced?"⌃":"⌄"}</span></button>
  <div className="case-sort-line"><label htmlFor={uid+"-sort"}>{extra.sort}</label><CaseSelectField id={uid+"-sort"} name="sort" label={extra.sort} value={query.sort??"recent"} compact options={[{value:"recent",label:extra.recent},{value:"submitted",label:extra.submitted},{value:"oldest",label:extra.oldest},{value:"priority",label:extra.priority}]} onChange={(next,form)=>{setOpen(false);const params:Record<string,string>={};if(form)for(const [k,v] of new FormData(form))if(typeof v==="string"&&v.trim())params[k]=v.trim();startTransition(()=>router.push(caseLink({...params,sort:next})))}}/></div></div>
  <dialog ref={filterDialog} id={uid+"-filters"} className="fluid-filter-dialog" aria-labelledby={uid+"-filter-title"} onClose={()=>{setAdvanced(false);setFilterVersion(v=>v+1);filterButton.current?.focus({preventScroll:true})}} onClick={e=>{if(e.target===e.currentTarget)filterDialog.current?.close()}}>
   <div className="fluid-filter-inner"><header className="fluid-filter-header"><h2 id={uid+"-filter-title"}>{fluid.title}</h2><button className="fluid-close" type="button" aria-label={fluid.close} onClick={()=>filterDialog.current?.close()}>×</button></header>
   <div className="fluid-filter-shortcuts"><h3>{fluid.shortcuts}</h3><div>{(["unread","cancellation","stale","decision"] as const).map(v=><Link key={v} href={caseLink({...query,focus:query.focus===v?undefined:v})} aria-current={query.focus===v?"true":undefined} onClick={()=>filterDialog.current?.close()}>{viewLabels[v]}</Link>)}<Link href={caseLink({...query,missing:query.missing==="1"?undefined:"1"})} aria-current={query.missing==="1"?"true":undefined} onClick={()=>filterDialog.current?.close()}>{viewLabels.missing}</Link></div></div>
   <div key={filterVersion} className="case-advanced case-advanced-v4 fluid-filter-fields">
   <div><label htmlFor={uid+"-status"}>{t.status}</label><CaseSelectField key={query.status??""} name="status" id={uid+"-status"} label={t.status} defaultValue={query.status??""} options={[{value:"",label:t.all},...statuses]}/></div>
   <div><label htmlFor={uid+"-from"}>{t.from}</label><DatePicker id={uid+"-from"} ariaLabel={t.from} name="from" defaultValue={query.from??""} locale={locale} displayDayFirst placeholder={extra.date}/></div>
   <div><label htmlFor={uid+"-to"}>{t.to}</label><DatePicker id={uid+"-to"} ariaLabel={t.to} name="to" defaultValue={query.to??""} locale={locale} displayDayFirst placeholder={extra.date}/></div>
   <div><label htmlFor={uid+"-country"}>{extra.country}</label><CaseSelectField key={query.country??""} id={uid+"-country"} name="country" label={extra.country} defaultValue={query.country??""} options={[{value:"",label:t.all},...countries]}/></div>
   <label className="case-missing"><input type="checkbox" name="missing" value="1" defaultChecked={query.missing==="1"}/>{extra.missing}</label></div>
  <footer className="case-filter-actions fluid-filter-footer"><Link href={resetHref} className="case-reset" onClick={()=>filterDialog.current?.close()}>{t.reset}</Link><button type="submit" className="btn-primary" disabled={pending}>{t.apply}</button></footer></div></dialog>
  {(interpreted.statusCode||interpreted.missing||interpretedPeriod.period)&&query.q?<p className="case-interpreted" role="status">{({fr:"Recherche interprétée :",en:"Interpreted search:",ar:"تفسير البحث:"}[locale])} {[(interpreted.q??""),statuses.find(s=>s.value===interpreted.statusCode)?.label,interpreted.missing?extra.missing:null,interpretedPeriod.period?({fr:{today:"Aujourd’hui",week:"Cette semaine",month:"Ce mois-ci"},en:{today:"Today",week:"This week",month:"This month"},ar:{today:"اليوم",week:"هذا الأسبوع",month:"هذا الشهر"}}[locale][interpretedPeriod.period]):null].filter(Boolean).join(" · ")}</p>:null}
  {chips.length>0?<div className="case-filter-chips">{chips.map(c=><Link key={c.key} href={caseLink({...query,[c.key]:undefined})} aria-label={viewLabels.clear+" "+c.label}>{c.label} <span aria-hidden="true">×</span></Link>)}</div>:null}
  {!advanced&&(query.q||count)?<Link href={resetHref} className="case-reset">{t.reset}</Link>:null}
  {pending?<p className="case-loading" role="status" aria-live="polite">{t.loading}</p>:null}
 </form>;
}
