"use client";
import { useEffect,useState } from "react";
import { SubmitButton } from "@/components/forms";
import { saveAgencyPrefs,revokeOwnOtherSessions } from "./profile-actions";
import type { AgencyPrefs } from "@/lib/agency-preference-values";
import type { ProfileCopy } from "./profile-copy";
export function UsernameReveal({username,c}:{username:string;c:ProfileCopy}){
 const [open,setOpen]=useState(false),[copied,setCopied]=useState(false);
 return <div className="profile-username"><button type="button" className="profile-text-action" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setCopied(false)}}>{open?c.hideId:c.showId}</button>{open?<div><bdi>{username}</bdi><button type="button" className="profile-text-action" onClick={async()=>{try{await navigator.clipboard.writeText(username);setCopied(true)}catch{setCopied(false)}}}>{copied?c.copied:c.copyId}</button></div>:null}</div>
}
export function PreferencesForm({prefs,nationalities,destinations,c}:{prefs:AgencyPrefs;nationalities:{code:string;label:string}[];destinations:{id:string;name:string}[];c:ProfileCopy}){
 const [favorites,setFavorites]=useState(prefs.favorites.filter(id=>destinations.some(d=>d.id===id)));
 const [sound,setSound]=useState(false);
 useEffect(()=>{const sync=()=>{try{setSound(localStorage.getItem("essafaria.notification-sound")==="on")}catch{}};sync();window.addEventListener("essafaria-sound-changed",sync);return()=>window.removeEventListener("essafaria-sound-changed",sync)},[]);
 return <><form action={saveAgencyPrefs} className="profile-pref-form"><p className="profile-note">{c.browser}</p>
 <div className="profile-fields"><label><span>{c.nationality}</span><select name="nationality" className="input" defaultValue={prefs.nationality}>{nationalities.map(n=><option key={n.code} value={n.code}>{n.label}</option>)}</select><small>{c.nationalityHint}</small></label><label><span>{c.sort}</span><select className="input" name="sort" defaultValue={prefs.sort}>{(["recent","submitted","oldest","priority"] as const).map(k=><option key={k} value={k}>{c[k]}</option>)}</select></label><label><span>{c.density}</span><select className="input" name="density" defaultValue={prefs.density}><option value="standard">{c.standard}</option><option value="compact">{c.compact}</option></select></label></div>
 <fieldset className="profile-favorites"><legend>{c.favorites} · {favorites.length}/4</legend><p>{c.favoritesHint}</p><div className="profile-favorite-list">{destinations.map(d=><label key={d.id}><input type="checkbox" checked={favorites.includes(d.id)} disabled={favorites.length>=4&&!favorites.includes(d.id)} onChange={e=>setFavorites(old=>e.target.checked?[...old,d.id].slice(0,4):old.filter(id=>id!==d.id))}/><span>{d.name}</span></label>)}</div>{favorites.map(id=><input key={id} type="hidden" name="favorites" value={id}/>)}</fieldset><div className="profile-actions"><SubmitButton className="btn-primary" pendingLabel="…">{c.save}</SubmitButton></div></form>
 <div className="profile-setting-row"><div><strong>{c.sound}</strong><p>{c.soundHint}</p></div><button type="button" className="btn-secondary" aria-pressed={sound} onClick={()=>window.dispatchEvent(new CustomEvent("essafaria-sound-request",{detail:!sound}))}>{sound?c.on:c.off}</button></div></>
}
export function SessionDisconnect({target,c,all=false}:{target:string;c:ProfileCopy;all?:boolean}){
 return <form action={revokeOwnOtherSessions} onSubmit={e=>{if(!window.confirm(c.confirmSession))e.preventDefault()}}><input type="hidden" name="session" value={target}/><SubmitButton className="profile-text-action profile-revoke" pendingLabel="…">{all?c.disconnectAll:c.disconnect}</SubmitButton></form>
}
