"use client";
import {useRouter} from "next/navigation";
import {useState,type FormEvent} from "react";
import {DatePicker} from "@/components/date-picker";
import {hubCopy} from "@/lib/traveller-hub-copy";
import {NATIONALITIES,nationalityLabel} from "@/lib/nationalities";
type Initial={id:string;version:number;name:string;nationality:string;passport:string;expiry:string|null;dob:string|null};
export function TravellerProfileForm({locale,initial}:{locale:"fr"|"en"|"ar";initial?:Initial}){
 const t=hubCopy[locale],router=useRouter(),[open,setOpen]=useState(false),[name,setName]=useState(initial?.name??""),[nationality,setNationality]=useState(initial?.nationality??"DZ"),[passport,setPassport]=useState(initial?.passport??""),[expiry,setExpiry]=useState(initial?.expiry??""),[dob,setDob]=useState(initial?.dob??""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError("");try{
 const r=await fetch("/api/agency/travellers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:initial?"update":"create",id:initial?.id,version:initial?.version,name,nationality,passport,expiry,dob}),cache:"no-store"});const d=await r.json();
 if(!r.ok){setError(d.code==="TRAVELLER_DUPLICATE"?t.duplicateProfile:d.code==="TRAVELLER_CHANGED"?t.changedProfile:t.badPassport);return}
 router.push("/portal/applicants/"+d.id);router.refresh();setOpen(false);
 }catch{setError(t.unavailable)}finally{setBusy(false)}}
 return <section className="th-profile-editor"><button type="button" className="btn-secondary" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{initial?t.editProfile:t.createProfile}</button>{open?<form onSubmit={save} className="th-profile-form"><label>{t.name}<input className="input" required maxLength={200} value={name} onChange={e=>setName(e.currentTarget.value)}/></label><label>{t.nationality}<select className="input" value={nationality} required onChange={e=>setNationality(e.currentTarget.value)}><option value="">—</option>{NATIONALITIES.map(n=><option key={n.code} value={n.code}>{nationalityLabel(n.code,locale)}</option>)}</select></label><label>{t.number}<input className="input" autoComplete="off" maxLength={20} value={passport} onChange={e=>setPassport(e.currentTarget.value)}/></label><div><label className="label" htmlFor="th-profile-expiry">{t.profileExpiry}</label><DatePicker id="th-profile-expiry" name="profileExpiry" locale={locale} defaultValue={expiry} min="1900-01-01" max="2100-12-31" displayDayFirst onValueChange={setExpiry}/></div><div><label className="label" htmlFor="th-profile-dob">{t.dob}</label><DatePicker id="th-profile-dob" name="profileDob" locale={locale} defaultValue={dob} min="1900-01-01" max={new Date().toISOString().slice(0,10)} displayDayFirst onValueChange={setDob}/></div><p className="th-note">{t.profileNote}</p>{error?<p role="alert" className="booking-warning">{error}</p>:null}<button className="btn-primary" disabled={busy}>{busy?t.searchBusy:t.saveProfile}</button></form>:null}</section>
}
