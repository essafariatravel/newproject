"use client";
import { useActionState } from "react";
import Link from "next/link";
import { submitRegistrationAction, type RegistrationFormState } from "@/app/actions/registrations";
import type { RegistrationCopy, RegistrationLocale } from "@/lib/i18n";
import { FieldError, Spinner } from "@/components/forms";
export default function RegistrationForm(props: {locale: RegistrationLocale; copy: RegistrationCopy; renderedAt: number; legalVersions:{terms:number;privacy:number}}) {
  const {copy,locale} = props;
  const [state,formAction,pending] = useActionState<RegistrationFormState,FormData>(submitRegistrationAction,{});
  const fields = [ ["legalName", "text", true, "organization"], ["contactFirstName","text",true,"name"], ["email","email",true,"email"], ["phone","tel",true,"tel"], ["city","text",false,"address-level2"], ["addressLine","text",false,"street-address"] ] as const;
  return <form action={formAction} className="space-y-6">
    <input type="hidden" name="locale" value={locale}/><input type="hidden" name="renderedAt" value={props.renderedAt}/>
    <input type="hidden" name="termsVersion" value={props.legalVersions.terms}/><input type="hidden" name="privacyVersion" value={props.legalVersions.privacy}/>
    <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden"><label>Fax<input name="fax" tabIndex={-1} autoComplete="off"/></label></div>
    {state.error ? <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</p> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map(([name,type,required,autoComplete]) => <div key={name} className={name === "addressLine" ? "sm:col-span-2" : ""}><label htmlFor={`reg-${name}`} className="label">{copy.fields[name]?.label}{required ? <span className="ms-1 text-red-600">*</span> : <span className="ms-2 font-normal text-slate-500">{copy.fields[name]?.optional}</span>}</label><input id={`reg-${name}`} name={name} type={type} required={required} autoComplete={autoComplete} dir={type === "email" || type === "tel" ? "ltr" : undefined} maxLength={name === "addressLine" ? 300 : name === "phone" ? 40 : 160} className="input" aria-invalid={Boolean(state.fieldErrors?.[name])}/><FieldError message={state.fieldErrors?.[name]}/></div>)}
    </div>
    <div className="space-y-3 border-t border-line pt-5">
      {([ ["terms",copy.consent.terms,copy.termsLink,"/terms"], ["privacy",copy.consent.privacy,copy.privacyLink,"/privacy"], ["accuracy",copy.consent.accuracy,null,null] ] as const).map(([name,label,link,href]) => <div key={name}><label className="flex items-start gap-3 text-sm leading-relaxed text-slate-600"><input type="checkbox" name={name} value="true" required className="mt-1 size-4 shrink-0 accent-navy-900"/><span>{link && href && label.includes(link) ? <>{label.split(link)[0]}<Link href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-navy-900 underline">{link}</Link>{label.split(link)[1]}</> : label}</span></label><FieldError message={state.fieldErrors?.[name]}/></div>)}
    </div>
    <button type="submit" disabled={pending} className="btn-primary min-h-11 w-full sm:w-auto">{pending ? <><Spinner/>{copy.submitPending}</> : copy.submitLabel}</button>
    <p className="text-xs leading-relaxed text-slate-500">{copy.reviewNote}</p>
  </form>;
}
