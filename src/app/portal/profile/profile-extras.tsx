"use client";
import { useEffect,useRef,useState } from "react";
import { SubmitButton } from "@/components/forms";
import { saveAgencyPrefs,revokeOwnOtherSessions } from "./profile-actions";
import {defaultPrefs,type AgencyPrefs} from "@/lib/agency-preference-values";
import {preferencesChanged,moveFavorite,profileSearch,visibleActivity} from "./profile-r03-utils";
import {useProfileDirty} from "./use-profile-dirty";
import type { ProfileCopy } from "./profile-copy";
export function UsernameReveal({username,c}:{username:string;c:ProfileCopy}){
 const [open,setOpen]=useState(false),[copied,setCopied]=useState(false),[copyFailed,setCopyFailed]=useState(false);
 return <div className="profile-username"><button type="button" className="profile-text-action" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setCopied(false);setCopyFailed(false)}}>{open?c.hideId:c.showId}</button>{open?<div><bdi>{username}</bdi><button type="button" className="profile-text-action" onClick={async()=>{try{await navigator.clipboard.writeText(username);setCopied(true);setCopyFailed(false)}catch{setCopied(false);setCopyFailed(true)}}}>{copied?c.copied:c.copyId}</button>{copyFailed?<p role="status" className="profile-muted">{c.copyFailed}</p>:null}</div>:null}</div>
}
type Destination={id:string;name:string;iso?:string|null};
export function ProfileTabScroll({tab}:{tab:string}){
 const previous=useRef(tab);
 useEffect(()=>{if(previous.current!==tab){previous.current=tab;document.querySelector(".agency-profile-r01")?.scrollIntoView({block:"start",behavior:"instant"})}},[tab]);
 return null
}
function DestinationFlag({iso}:{iso?:string|null}){if(!iso||! /^[A-Z]{2}$/i.test(iso))return null;return <span className="profile-country-flag" aria-hidden="true">{String.fromCodePoint(...Array.from(iso.toUpperCase(),c=>127397+c.charCodeAt(0)))}</span>}
export function ProfileIcon({kind}:{kind:string}){
 const paths:Record<string,string>={login:"M10 17l5-5-5-5m5 5H3m12-8h5v16h-5",account:"M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7z",image:"M3 4h18v16H3z m2 12 4-4 3 3 4-5 5 6",password:"M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3",device:"M3 4h18v12H3z M8 21h8m-4-5v5",mobile:"M7 2h10v20H7z M11 18h2",visa:"M5 3h14v18H5z M8 8h8m-8 4h8m-8 4h5",finance:"M3 6h18v14H3z M16 10h5v6h-5z",admin:"M3 21h18M5 21V5h14v16M9 9h1m4 0h1m-6 4h1m4 0h1",tech:"M3 4h18v13H3z M8 21h8m-4-4v4"};
 return <svg className="profile-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]??paths.account}/></svg>
}
export function ActivityTimeline({events,c}:{events:{id:string;label:string;date:string;iso:string;kind:"login"|"account";icon:string}[];c:ProfileCopy}){
 const [filter,setFilter]=useState<"all"|"login"|"account">("all"),[expanded,setExpanded]=useState(false);
 const filtered=events.filter(e=>filter==="all"||e.kind===filter);
 return <><div className="profile-filter" role="group" aria-label={c.activity}>{(["all","login","account"] as const).map(k=><button key={k} type="button" aria-pressed={filter===k} onClick={()=>{setFilter(k);setExpanded(false)}}>{k==="all"?c.allActivity:k==="login"?c.logins:c.modifications}</button>)}</div>
 <div>{visibleActivity(events,filter,expanded).map(e=><div className="profile-activity-row" key={e.id}><ProfileIcon kind={e.icon}/><strong>{e.label}</strong><time dateTime={e.iso}>{e.date}</time></div>)}{!filtered.length?<p className="profile-note">{c.noFilter}</p>:null}</div>{filtered.length>3?<button className="profile-text-action profile-more" type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?c.showLess:c.showMore} <span aria-hidden="true">{expanded?"−":"+"}</span></button>:null}</>
}
export function PreferencesForm({prefs,nationalities,destinations,c}:{prefs:AgencyPrefs;nationalities:{code:string;label:string}[];destinations:Destination[];c:ProfileCopy}){
 const initial={...prefs,favorites:prefs.favorites.filter(id=>destinations.some(d=>d.id===id))};
 const [draft,setDraft]=useState<AgencyPrefs>(initial),[nationalitySearch,setNationalitySearch]=useState(""),[destinationSearch,setDestinationSearch]=useState(""),[sound,setSound]=useState(false);
 const dirty=preferencesChanged(initial,draft);
 useProfileDirty(dirty,c.unsaved,"profile-preferences");
 useEffect(()=>{const sync=()=>{try{setSound(localStorage.getItem("essafaria.notification-sound")==="on")}catch{}};sync();window.addEventListener("essafaria-sound-changed",sync);return()=>window.removeEventListener("essafaria-sound-changed",sync)},[]);
 const choices=nationalities.filter(n=>n.code===draft.nationality||profileSearch(n.label+" "+n.code,nationalitySearch));
 const ordered=draft.favorites.flatMap(id=>destinations.filter(d=>d.id===id));
 const available=destinations.filter(d=>profileSearch(d.name,destinationSearch));
 return <><form id="profile-preferences" action={saveAgencyPrefs} className="profile-pref-form"><p className="profile-note">{c.browser}</p>
 <div className="profile-setting-row"><div><strong>{c.nationality}</strong><p>{c.nationalityHint}</p></div><div className="profile-pref-control"><input aria-label={c.searchNationality} placeholder={c.searchNationality} className="input profile-search" value={nationalitySearch} onKeyDown={e=>{if(e.key==="Enter")e.preventDefault()}} onChange={e=>setNationalitySearch(e.target.value)}/><select aria-label={c.nationality} name="nationality" className="input" value={draft.nationality} onChange={e=>{setDraft(v=>({...v,nationality:e.target.value}));setNationalitySearch("")}}>{choices.map(n=><option key={n.code} value={n.code}>{n.label}</option>)}</select></div></div>
 <div className="profile-setting-row"><strong>{c.sort}</strong><select aria-label={c.sort} className="input profile-pref-control" name="sort" value={draft.sort} onChange={e=>setDraft(v=>({...v,sort:e.target.value as AgencyPrefs["sort"]}))}>{(["recent","submitted","oldest","priority"] as const).map(k=><option key={k} value={k}>{c[k]}</option>)}</select></div>
 <fieldset className="profile-density"><legend>{c.density}</legend><p className="profile-muted">{c.densityHint}</p><div className="profile-density-options">{(["standard","compact"] as const).map(k=><label key={k} className="profile-density-option" data-selected={draft.density===k}><input type="radio" name="density" value={k} checked={draft.density===k} onChange={()=>setDraft(v=>({...v,density:k}))}/><span className="profile-density-preview" aria-hidden="true" data-density={k}>{Array.from({length:k==="standard"?3:5},(_,i)=><span key={i}><i/><b/></span>)}</span><strong>{k==="standard"?c.comfort:c.compact}</strong></label>)}</div></fieldset>
 <fieldset className="profile-favorites"><legend>{c.favorites} <span className="profile-muted">{draft.favorites.length}/4</span></legend><p>{c.favoritesHint}</p><input className="input profile-search" aria-label={c.searchDestination} placeholder={c.searchDestination} value={destinationSearch} onKeyDown={e=>{if(e.key==="Enter")e.preventDefault()}} onChange={e=>setDestinationSearch(e.target.value)}/>
 <div className="profile-favorite-list">{available.map(d=>{const selected=draft.favorites.includes(d.id);return <button type="button" key={d.id} aria-pressed={selected} disabled={!selected&&draft.favorites.length>=4} onClick={()=>setDraft(v=>({...v,favorites:selected?v.favorites.filter(id=>id!==d.id):[...v.favorites,d.id].slice(0,4)}))}><span><DestinationFlag iso={d.iso}/>{d.name}</span><span aria-hidden="true">{selected?"✓":"+"}</span></button>})}{!available.length?<p>{c.noResults}</p>:null}</div>
 {ordered.length>0?<div className="profile-order"><p className="profile-muted">{c.orderedFavorites}</p>{ordered.map((d,i)=><div key={d.id}><span className="profile-order-number">{i+1}</span><span>{d.name}</span><button type="button" aria-label={c.moveUp+" — "+d.name} disabled={i===0} onClick={()=>setDraft(v=>({...v,favorites:moveFavorite(v.favorites,d.id,-1)}))}>↑</button><button type="button" aria-label={c.moveDown+" — "+d.name} disabled={i===ordered.length-1} onClick={()=>setDraft(v=>({...v,favorites:moveFavorite(v.favorites,d.id,1)}))}>↓</button><input type="hidden" name="favorites" value={d.id}/></div>)}</div>:null}</fieldset>
 <div className="profile-actions profile-pref-actions"><button type="button" className="profile-text-action" onClick={()=>{setDraft({...defaultPrefs,favorites:[]});setNationalitySearch("");setDestinationSearch("")}}>{c.reset}</button><span role="status" className="profile-muted">{dirty?c.unsavedStatus:""}</span>{dirty?<button type="button" className="btn-secondary" onClick={()=>setDraft(initial)}>{c.cancel}</button>:null}<SubmitButton className="btn-primary" disabled={!dirty} pendingLabel="…">{c.save}</SubmitButton></div></form>
 <div className="profile-setting-row"><div><strong>{c.sound}</strong><p>{c.soundHint}</p></div><button type="button" className="profile-switch" role="switch" aria-label={c.sound} aria-checked={sound} onClick={()=>window.dispatchEvent(new CustomEvent("essafaria-sound-request",{detail:!sound}))}><span/></button></div></>
}
export function SessionDisconnect({target,c,all=false}:{target:string;c:ProfileCopy;all?:boolean}){
 return <form action={revokeOwnOtherSessions} onSubmit={e=>{if(!window.confirm(c.confirmSession))e.preventDefault()}}><input type="hidden" name="session" value={target}/><SubmitButton className="profile-text-action profile-revoke" pendingLabel="…">{all?c.disconnectAll:c.disconnect}</SubmitButton></form>
}
