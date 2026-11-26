"use client";
import { useEffect, useRef, useState } from "react";
import {useProfileDirty} from "./use-profile-dirty";
import { SubmitButton } from "@/components/forms";
import { updateOwnAgencyContactAction } from "@/app/actions/admin";
import { uploadOwnAgencyLogoAction, removeOwnAgencyLogoAction } from "@/app/actions/branding";
import { contactChanged, firstMissingContactField, validLogoFile, type ProfileCopy } from "./profile-copy";
type Contact = {phone:string;city:string;addressLine:string};
const CONTACT_EDIT_EVENT="essafaria-profile-edit-contact";
export function ContactCompletion({c,missing}:{c:ProfileCopy;missing:string[]}){
 return <div className="profile-attention"><div><strong>{c.missingDetails}</strong><span className="profile-muted"> · {missing.join(" · ")}</span></div><button type="button" className="profile-text-action" aria-controls="profile-contact" onClick={()=>window.dispatchEvent(new Event(CONTACT_EDIT_EVENT))}>{c.editContact} <span aria-hidden="true">→</span></button></div>
}
export function ContactEditor({initial,labels,c,canEdit}:{initial:Contact;labels:{phone:string;city:string;addressLine:string};c:ProfileCopy;canEdit:boolean}) {
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(initial);
  const edit=useRef<HTMLButtonElement>(null);
  const formRef=useRef<HTMLFormElement>(null);
  const sectionRef=useRef<HTMLElement>(null);
  const keys=["phone","city","addressLine"] as const;
  const dirty=editing&&contactChanged(initial,draft);
  useProfileDirty(dirty,c.unsaved,"profile-contact-form");
  useEffect(()=>{
    if(!canEdit)return;
    function open(){
      setEditing(true);
      if(formRef.current){
        sectionRef.current?.scrollIntoView({block:"start"});
        formRef.current.querySelector<HTMLInputElement>('input[name="'+firstMissingContactField(draft)+'"]')?.focus({preventScroll:true});
      }
    }
    window.addEventListener(CONTACT_EDIT_EVENT,open);
    return()=>window.removeEventListener(CONTACT_EDIT_EVENT,open);
  },[canEdit,draft]);
  useEffect(()=>{
    if(!editing||!canEdit)return;
    sectionRef.current?.scrollIntoView({block:"start"});
    formRef.current?.querySelector<HTMLInputElement>('input[name="'+firstMissingContactField(initial)+'"]')?.focus({preventScroll:true});
  },[editing,canEdit,initial.phone,initial.city,initial.addressLine]);
  return <section ref={sectionRef} className="profile-section" id="profile-contact" data-editing={editing}>
    <header><h2>{c.contact}</h2>{canEdit&&!editing?<button ref={edit} type="button" className="profile-text-action" onClick={()=>{setDraft(initial);setEditing(true)}}>{c.edit} <span aria-hidden="true">↗</span></button>:null}</header>
    {editing&&canEdit?<form id="profile-contact-form" ref={formRef} action={updateOwnAgencyContactAction} className="profile-editor">
      <div className="profile-fields">{keys.map(k=><label key={k}><span>{labels[k]}</span><input className="input" name={k} value={draft[k]} onChange={e=>setDraft(d=>({...d,[k]:e.target.value}))} maxLength={k==="phone"?40:k==="city"?80:300} type={k==="phone"?"tel":"text"} dir={k==="phone"?"ltr":undefined} autoComplete={k==="phone"?"tel":k==="city"?"address-level2":"street-address"}/></label>)}</div>
      <div className="profile-actions"><button type="button" className="btn-secondary" onClick={()=>{if(dirty&&!window.confirm(c.unsaved))return;setDraft(initial);setEditing(false);requestAnimationFrame(()=>edit.current?.focus())}}>{c.cancel}</button><SubmitButton className="btn-primary" disabled={!contactChanged(initial,draft)} pendingLabel="…">{c.save}</SubmitButton></div>
    </form>:<dl className="profile-fields">{keys.map(k=><div key={k}><dt>{labels[k]}</dt><dd dir={k==="phone"?"ltr":undefined} className={!initial[k].trim()?"profile-muted":undefined}>{initial[k].trim()||c.missing}</dd></div>)}</dl>}
    
  </section>
}
export function LogoEditor({src,name,initials,canEdit,c,partnerSince}:{src:string|null;name:string;initials:string;canEdit:boolean;c:ProfileCopy;partnerSince:string}) {
  const input=useRef<HTMLInputElement>(null);
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState<string|null>(null);
  const [error,setError]=useState(false);
  useProfileDirty(Boolean(file),c.unsaved,"profile-logo-upload");
  useEffect(()=>{if(!file){setPreview(null);return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file]);
  function clear(){if(input.current)input.current.value="";setFile(null);setError(false)}
  return <div className="profile-logo-editor">
    <div className="profile-logo-mark">{preview||src?<img src={preview||src||undefined} alt={preview?c.preview:name}/>:<span aria-hidden="true">{initials}</span>}</div>
    <div className="profile-name"><h2>{name}</h2><p>{partnerSince}</p>
    {canEdit?<div className="profile-logo-controls"><form id="profile-logo-upload" action={uploadOwnAgencyLogoAction} encType="multipart/form-data">
      <input ref={input} type="file" name="logo" accept="image/png,image/jpeg,image/webp" aria-label={c.logo} hidden onChange={e=>{const selected=e.target.files?.[0];if(!selected){clear();return;}if(!validLogoFile(selected)){clear();setError(true);return;}setError(false);setFile(selected)}}/>
      <div className="profile-logo-actions"><button type="button" className="profile-text-action" onClick={()=>input.current?.click()}>{src?c.replace:c.choose}</button>{file?<><SubmitButton className="btn-primary" pendingLabel="…">{c.save}</SubmitButton><button type="button" className="profile-text-action" onClick={clear}>{c.cancel}</button></>:null}</div>
      {file?<p className="profile-muted">{file.name} · {c.logoHint}</p>:null}{error?<p role="alert" className="profile-error">{c.logoError}</p>:null}
    </form>{src&&!file?<form action={removeOwnAgencyLogoAction} onSubmit={e=>{if(!window.confirm(c.removeConfirm))e.preventDefault()}}><SubmitButton className="profile-text-action profile-remove" pendingLabel="…">{c.remove}</SubmitButton></form>:null}</div>:null}</div>
  </div>
}
