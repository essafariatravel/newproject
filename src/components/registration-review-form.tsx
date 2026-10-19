"use client";
import { useActionState, useState } from "react";
import { issueRegistrationDocumentLinkAction, type RegistrationLinkState } from "@/app/actions/registration-admin";
import { registrationCopy, registrationReviewCopy, type RegistrationLocale } from "@/lib/i18n";
import { REGISTRATION_DOCUMENT_CATEGORIES } from "@/lib/registration-constants";
export function RegistrationReviewForm({id,locale}: {id:string;locale:RegistrationLocale}) {
  const copy = registrationReviewCopy(locale);
  const [state,action,pending] = useActionState<RegistrationLinkState,FormData>(issueRegistrationDocumentLinkAction,{});
  const [selected,setSelected] = useState<string[]>([]);
  const [visible,setVisible] = useState(true);
  const [copied,setCopied] = useState(false);
  return <form action={action} onSubmit={()=>{setVisible(true);setCopied(false);}} className="space-y-4">
    <input type="hidden" name="id" value={id}/><input type="hidden" name="locale" value={locale}/>
    <label className="label" htmlFor="review-purpose">{copy.purpose}</label><textarea id="review-purpose" name="note" required minLength={10} maxLength={2000} rows={3} className="input"/>
    {REGISTRATION_DOCUMENT_CATEGORIES.map((category) => <div key={category}><label className="flex min-h-11 items-center gap-2 text-base text-slate-700"><input className="h-5 w-5" type="checkbox" name={`request_${category}`} value="true" onChange={(event)=>setSelected((previous)=>event.target.checked ? [...previous,category] : previous.filter((value)=>value!==category))}/>{registrationCopy(locale).docCategories[category]!.label}</label>{selected.includes(category) ? <div className="mt-2 ps-6"><label className="label" htmlFor={`label_${category}`}>{copy.label}</label><input id={`label_${category}`} name={`label_${category}`} required minLength={2} maxLength={160} defaultValue={registrationCopy(locale).docCategories[category]!.label} className="input"/></div> : null}</div>)}
    <button type="submit" disabled={pending || !selected.length || selected.length>4} className="btn-secondary w-full">{pending ? copy.saving : copy.issue}</button>
    {state.error ? <p role="alert" className="text-base text-red-700">{state.error}</p> : null}
    {visible && state.link ? <div role="status" className="space-y-2 border-t border-line pt-4"><p className="text-xs leading-relaxed text-slate-600">{copy.share}</p><code className="block break-all text-xs text-navy-900" dir="ltr">{state.link}</code><div className="flex gap-4"><button type="button" className="inline-flex min-h-11 items-center text-base font-semibold underline" onClick={async()=>{try{await navigator.clipboard.writeText(new URL(state.link!,window.location.origin).href);setCopied(true);}catch{setCopied(false);}}}>{copied?copy.copied:copy.copyLink}</button><button type="button" className="inline-flex min-h-11 items-center text-base text-slate-600 underline" onClick={()=>setVisible(false)}>{copy.hideLink}</button></div></div> : null}
  </form>;
}
