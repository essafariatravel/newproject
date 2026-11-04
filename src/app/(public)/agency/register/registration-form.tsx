"use client";
import { useEffect, useRef } from "react";
import { TurnstileField, useProtectedAction } from "@/components/turnstile-field";
import type { TurnstilePublicConfig } from "@/lib/turnstile-config";
import Link from "next/link";
import { submitRegistrationAction, type RegistrationFormState } from "@/app/actions/registrations";
import type { RegistrationCopy, RegistrationLocale } from "@/lib/i18n";
import { FieldError, Spinner } from "@/components/forms";
export default function RegistrationForm(props: {locale: RegistrationLocale; copy: RegistrationCopy; renderedAt: number; botConfig: TurnstilePublicConfig; legalVersions:{terms:{id:string;version:number};privacy:{id:string;version:number}}}) {
  const {copy,locale} = props;
  const { state, formAction, pending, verified, setVerified, challenge } = useProtectedAction<RegistrationFormState>(submitRegistrationAction, {}, props.botConfig, locale);
  const summary = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.error) summary.current?.focus(); }, [state]);
  const fieldGroups = [
    { title: copy.sections.company.title, fields: [["legalName","text",true,"organization"],["city","text",false,"address-level2"]] },
    { title: copy.sections.contact.title, fields: [["contactFirstName","text",true,"name"],["email","email",true,"email"],["phone","tel",true,"tel"]] },
  ] as const;
  // Successful submissions redirect. Keep entered details available for correction on errors.
  return <form action={formAction} onReset={event => event.preventDefault()} className="space-y-6">
    <input type="hidden" name="locale" value={locale}/><input type="hidden" name="renderedAt" value={props.renderedAt}/>
    <input type="hidden" name="termsVersionId" value={props.legalVersions.terms.id}/><input type="hidden" name="termsVersion" value={props.legalVersions.terms.version}/><input type="hidden" name="privacyVersionId" value={props.legalVersions.privacy.id}/><input type="hidden" name="privacyVersion" value={props.legalVersions.privacy.version}/>
    <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden"><label>Fax<input name="fax" tabIndex={-1} autoComplete="off"/></label></div>
    {state.error ? <p ref={summary} tabIndex={-1} role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-base text-red-700">{state.error}</p> : null}
    {fieldGroups.map(group => (
      <fieldset key={group.title} className="registration-group">
        <legend>{group.title}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {group.fields.map(([name,type,required,autoComplete]) => {
            const error = state.fieldErrors?.[name];
            return (
              <div key={name}>
                <label htmlFor={`reg-${name}`} className="label">
                  {copy.fields[name]?.label}
                  {required ? <span className="ms-1 text-red-600">*</span> : <span className="ms-2 font-normal text-slate-500">{copy.fields[name]?.optional}</span>}
                </label>
                <input id={`reg-${name}`} name={name} type={type} required={required} autoComplete={autoComplete}
                  dir={type === "email" || type === "tel" ? "ltr" : undefined} maxLength={name === "phone" ? 40 : 160}
                  className="input" aria-invalid={Boolean(error)} aria-describedby={error ? `error-${name}` : undefined} />
                <FieldError id={`error-${name}`} message={error} />
              </div>
            );
          })}
        </div>
      </fieldset>
    ))}
    <fieldset className="registration-group space-y-4">
      <legend>{copy.sections.consent.title}</legend>
      {([ ["terms",copy.consent.terms,copy.termsLink,"/terms"], ["privacy",copy.consent.privacy,copy.privacyLink,"/privacy"], ["accuracy",copy.consent.accuracy,null,null] ] as const).map(([name,label,link,href]) => <div key={name}><label className="flex min-h-11 items-start gap-4 text-base leading-relaxed text-slate-600"><input type="checkbox" name={name} value="true" required aria-invalid={Boolean(state.fieldErrors?.[name])} aria-describedby={state.fieldErrors?.[name] ? `error-${name}` : undefined} className="mt-1 h-5 w-5 shrink-0 accent-navy-900"/><span>{link && href && label.includes(link) ? <>{label.split(link)[0]}<Link href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-navy-900 underline">{link}</Link>{label.split(link)[1]}</> : label}</span></label><FieldError id={`error-${name}`} message={state.fieldErrors?.[name]}/></div>)}
    </fieldset>
    <TurnstileField ref={challenge} config={props.botConfig} action="agency_registration" locale={locale} onVerified={setVerified} />
    <button type="submit" disabled={pending || !verified} className="btn-primary min-h-11 w-full sm:w-auto">{pending ? <><Spinner/>{copy.submitPending}</> : copy.submitLabel}</button>
    <p className="text-xs leading-relaxed text-slate-500">{copy.reviewNote}</p>
  </form>;
}
