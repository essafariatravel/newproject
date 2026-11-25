"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";

export function WalletDrawer({id,title,trigger,close,children,className="btn-primary",openFromHash=false}:{id:string;title:string;trigger:ReactNode;close:string;children:ReactNode;className?:string;openFromHash?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null);
 const button=useRef<HTMLButtonElement>(null);
 const open=()=>{if(dialog.current&&!dialog.current.open)dialog.current.showModal()};
 useEffect(()=>{
   if(!openFromHash)return;
   const check=()=>{if(window.location.hash==="#"+id&&dialog.current&&!dialog.current.open)dialog.current.showModal()};
   check();window.addEventListener("hashchange",check);return()=>window.removeEventListener("hashchange",check);
 },[id,openFromHash]);
 return <><button ref={button} type="button" className={className} onClick={open}>{trigger}</button>
 <dialog id={id+"-dialog"} ref={dialog} className="wallet-drawer" aria-labelledby={id+"-title"} onClose={()=>{if(openFromHash&&window.location.hash==="#"+id)window.history.replaceState(null,"",window.location.pathname+window.location.search);button.current?.focus()}}>
 <div className="wallet-drawer-head"><h2 id={id+"-title"}>{title}</h2><button type="button" className="wallet-close" onClick={()=>dialog.current?.close()} aria-label={close}>×</button></div>
 <div className="wallet-drawer-body">{children}</div></dialog></>
}
type Option={value:string;label:string};
export function WalletFilters({q,type,period,from,to,types,periods,locale,labels,exportControl}:{q:string;type:string;period:string;from:string;to:string;types:Option[];periods:Option[];locale:string;labels:{search:string;type:string;period:string;reset:string;from:string;to:string;apply:string;loading:string;all:string;more:string};exportControl:ReactNode}){
 const router=useRouter();
 const [busy,startTransition]=useTransition();
 const [search,setSearch]=useState(q);
 const [draftFrom,setFrom]=useState(from),[draftTo,setTo]=useState(to);
 const [menu,setMenu]=useState<"type"|"period"|null>(null);
 const [custom,setCustom]=useState(period==="custom");
 const root=useRef<HTMLDivElement>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const leaveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const cancelLeave=()=>{if(leaveTimer.current)clearTimeout(leaveTimer.current);leaveTimer.current=null};
 const leave=(e:ReactPointerEvent)=>{if(e.pointerType!=="mouse")return;cancelLeave();leaveTimer.current=setTimeout(()=>setMenu(null),180)};
 const clearTimer=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null}};
 useEffect(()=>{setSearch(q);setFrom(from);setTo(to);setCustom(period==="custom");setMenu(null)},[q,type,period,from,to]);
 useEffect(()=>{function outside(e:PointerEvent){if(!root.current?.contains(e.target as Node))setMenu(null)}function escape(e:KeyboardEvent){if(e.key==="Escape")setMenu(null)}document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);if(timer.current)clearTimeout(timer.current);if(leaveTimer.current)clearTimeout(leaveTimer.current)}},[]);
 function apply(next:{q?:string;type?:string;period?:string;from?:string;to?:string}={}){
  clearTimer();const v={q:search.trim(),type,period,from,to,...next};const p=new URLSearchParams({lang:locale});const per=new URLSearchParams(window.location.search).get("per");if(per)p.set("per",per);if(v.q)p.set("q",v.q);if(v.type)p.set("type",v.type);if(v.period&&v.period!=="all")p.set("period",v.period);if(v.period==="custom"){if(v.from)p.set("from",v.from);if(v.to)p.set("to",v.to)}setMenu(null);startTransition(()=>router.replace("/portal/wallet?"+p.toString(),{scroll:false}));
 }
 const quick=types.filter(x=>["","MONEY_IN","MONEY_OUT","APPLICATION_CHARGE"].includes(x.value));
 const extra=types.filter(x=>!quick.some(y=>y.value===x.value));
 const currentPeriod=periods.find(x=>x.value===period)?.label??labels.all;
 return <div className="wallet-smart-controls" ref={root} aria-busy={busy}>
 <div className="wallet-control-top"><form className="wallet-smart-search" onSubmit={e=>{e.preventDefault();apply()}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input aria-label={labels.search} placeholder={labels.search} value={search} type="search" onChange={e=>{const value=e.target.value;setSearch(value);clearTimer();timer.current=setTimeout(()=>apply({q:value.trim()}),450)}}/><button type="submit" className="sr-only">{labels.apply}</button></form><div className="wallet-control-actions"><div className="wallet-menu-anchor" onPointerEnter={cancelLeave} onPointerLeave={leave} onFocus={cancelLeave}><button className="wallet-control" type="button" aria-expanded={menu==="period"} onClick={()=>{clearTimer();setMenu(menu==="period"?null:"period")}}>{currentPeriod}<span aria-hidden="true">⌄</span></button>{menu==="period"?<div className="wallet-menu" aria-label={labels.period}>{periods.map(o=><button type="button" key={o.value} aria-pressed={period===o.value} onClick={()=>{if(o.value==="custom"){setCustom(true);setMenu(null)}else{setCustom(false);apply({period:o.value})}}}>{o.label}{period===o.value?<span aria-hidden="true">✓</span>:null}</button>)}</div>:null}</div>{exportControl}</div></div>
 <div className="wallet-control-bottom"><div className="wallet-chips" aria-label={labels.type}>{quick.map(o=><button key={o.value} type="button" aria-pressed={type===o.value} onClick={()=>apply({type:o.value})}>{o.label}</button>)}<div className="wallet-menu-anchor" onPointerEnter={cancelLeave} onPointerLeave={leave} onFocus={cancelLeave}><button type="button" className="wallet-more" aria-expanded={menu==="type"} aria-pressed={extra.some(x=>x.value===type)} onClick={()=>{clearTimer();setMenu(menu==="type"?null:"type")}}>{extra.find(x=>x.value===type)?.label??labels.more} <span aria-hidden="true">⌄</span></button>{menu==="type"?<div className="wallet-menu" aria-label={labels.type}>{extra.map(o=><button key={o.value} type="button" aria-pressed={type===o.value} onClick={()=>apply({type:o.value})}>{o.label}{type===o.value?<span aria-hidden="true">✓</span>:null}</button>)}</div>:null}</div></div>{q||type||period!=="all"?<button className="wallet-clear" type="button" onClick={()=>{setSearch("");setCustom(false);apply({q:"",type:"",period:"all",from:"",to:""})}}>{labels.reset}</button>:null}{busy?<small role="status">{labels.loading}</small>:null}</div>
 {custom?<form className="wallet-custom-range" onSubmit={e=>{e.preventDefault();if(draftFrom&&draftTo&&draftFrom<=draftTo)apply({period:"custom",from:draftFrom,to:draftTo})}}><label>{labels.from}<input className="input" type="date" required max={draftTo||undefined} value={draftFrom} onChange={e=>setFrom(e.target.value)}/></label><label>{labels.to}<input className="input" type="date" required min={draftFrom||undefined} value={draftTo} onChange={e=>setTo(e.target.value)}/></label><button type="submit" className="btn-secondary">{labels.apply}</button></form>:null}
 </div>;
}
export function WalletCopy({value,label,done,failed}:{value:string;label:string;done:string;failed:string}){
 const [status,setStatus]=useState("");
 return <><button className="btn-secondary" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(value);setStatus(done)}catch{setStatus(failed)}}}>{label}</button>{status?<small role="status">{status}</small>:null}</>;
}

/** Server pagination follows available space, without fetching or hiding ledger rows client-side. */
export function WalletViewport({per,page}:{per:number;page:number}){
 const router=useRouter();
 const anchor=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const measure=()=>{
   if(!anchor.current||window.matchMedia("(max-width:760px)").matches&&document.activeElement instanceof HTMLInputElement)return;
   const top=anchor.current.getBoundingClientRect().top+window.scrollY;
   const available=window.innerHeight-top-85;
   const rowHeight=window.matchMedia("(max-width:760px)").matches?84:72;
   const next=Math.max(3,Math.min(12,Math.floor(available/rowHeight)));
   if(next===per)return;
   // Changing viewport must not lose the first transaction on the current page.
   const nextPage=Math.floor((page-1)*per/next)+1;
   const p=new URLSearchParams(window.location.search);p.set("per",String(next));if(nextPage>1)p.set("page",String(nextPage));else p.delete("page");
   p.delete("success");p.delete("error");router.replace("/portal/wallet?"+p.toString()+window.location.hash,{scroll:false});
  };
  const schedule=()=>{if(timer)clearTimeout(timer);timer=setTimeout(measure,250)};
  schedule();window.addEventListener("resize",schedule);
  return()=>{if(timer)clearTimeout(timer);window.removeEventListener("resize",schedule)};
 },[per,page,router]);
 return <div ref={anchor} className="wallet-viewport-anchor" aria-hidden="true"/>;
}
export function WalletReceipt({href,preview,download,loading,error,close}:{href:string;preview:string;download:string;loading:string;error:string;close:string}){
 const [asset,setAsset]=useState<{url:string;type:string}|null>(null);
 const [status,setStatus]=useState("");
 const request=useRef<AbortController|null>(null);
 const object=useRef<string|null>(null);
 const root=useRef<HTMLDivElement>(null);
 const clear=()=>{request.current?.abort();request.current=null;if(object.current)URL.revokeObjectURL(object.current);object.current=null;setAsset(null);setStatus("")};
 useEffect(()=>{const dialog=root.current?.closest("dialog");const closed=()=>clear();dialog?.addEventListener("close",closed);return()=>{dialog?.removeEventListener("close",closed);request.current?.abort();if(object.current)URL.revokeObjectURL(object.current)}},[]);
 async function open(){
  clear();const controller=new AbortController();request.current=controller;setStatus(loading);
  try{const response=await fetch(href,{credentials:"same-origin",cache:"no-store",signal:controller.signal});if(!response.ok)throw Error("Receipt unavailable");const blob=await response.blob();if(!["application/pdf","image/jpeg","image/png"].includes(blob.type))throw Error("Unsupported");if(controller.signal.aborted)return;const url=URL.createObjectURL(blob);object.current=url;setAsset({url,type:blob.type});setStatus("")}catch{if(!controller.signal.aborted)setStatus(error)}
 }
 return <div ref={root} className="wallet-receipt"><div className="wallet-export-links"><button type="button" className="btn-secondary" onClick={asset?clear:open}>{asset?close:preview}</button><a className="btn-secondary" href={href}>{download}</a></div>{status?<small role="status">{status}</small>:null}{asset?asset.type==="application/pdf"?<iframe title={preview} src={asset.url} className="wallet-receipt-frame" sandbox=""/>:<img src={asset.url} alt={preview} className="wallet-receipt-image"/>:null}</div>;
}
