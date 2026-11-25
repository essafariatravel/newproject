"use client";
import { useEffect, useRef, useState } from "react";
import { TurnstileField, useProtectedAction } from "@/components/turnstile-field";
import type { TurnstilePublicConfig } from "@/lib/turnstile-config";
import Link from "next/link";
import { submitRegistrationAction, type RegistrationFormState } from "@/app/actions/registrations";
import type { RegistrationCopy, RegistrationLocale } from "@/lib/i18n";
import { FieldError, Spinner } from "@/components/forms";
import { registrationUi } from "./registration-ui";
export default function RegistrationForm(props: {locale: RegistrationLocale; copy: RegistrationCopy; renderedAt: number; botConfig: TurnstilePublicConfig; legalVersions:{terms:{id:string;version:number};privacy:{id:string;version:number}}}) {
  const {copy,locale} = props;
  const text = registrationUi[locale];
  const { state, formAction, pending, verified, setVerified, challenge } = useProtectedAction<RegistrationFormState>(submitRegistrationAction, {}, props.botConfig, locale);
  const summary = useRef<HTMLParagraphElement>(null);
  const [invalidFields, setInvalidFields] = useState<Record<string, "required" | "invalidEmail" | "consentRequired">>({});
  useEffect(() => { if (state.error) summary.current?.focus(); }, [state]);
  const fieldGroups = [
    { section: "company", fields: [["legalName","text",true,"organization"],["city","text",false,"address-level2"]] },
    { section: "contact", fields: [["contactFirstName","text",true,"name"],["email","email",true,"email"],["phone","tel",true,"tel"]] },
  ] as const;
  const fieldError = (name: string) => invalidFields[name] ? copy.errors[invalidFields[name]] : state.fieldErrors?.[name];
  // Successful submissions redirect. Keep entered details available for correction on errors.
  return <form action={formAction} onReset={event => event.preventDefault()} className="registration-form"
    aria-labelledby="register-title" aria-busy={pending}
    onInvalid={event => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement)) return;
      const issue = field.validity.valueMissing ? (field.type === "checkbox" ? "consentRequired" : "required") :
        field.validity.typeMismatch ? "invalidEmail" : null;
      if (issue) setInvalidFields(previous => ({ ...previous, [field.name]: issue }));
    }}
    onInput={event => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement) || !invalidFields[field.name]) return;
      if (field.validity.valid) {
        setInvalidFields(previous => {
          const updated = { ...previous };
          delete updated[field.name];
          return updated;
        });
      }
    }}>
    <input type="hidden" name="locale" value={locale}/>
    <input type="hidden" name="renderedAt" value={props.renderedAt}/>
    <input type="hidden" name="termsVersionId" value={props.legalVersions.terms.id}/>
    <input type="hidden" name="termsVersion" value={props.legalVersions.terms.version}/>
    <input type="hidden" name="privacyVersionId" value={props.legalVersions.privacy.id}/>
    <input type="hidden" name="privacyVersion" value={props.legalVersions.privacy.version}/>
    <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden"><label>Fax<input name="fax" tabIndex={-1} autoComplete="off"/></label></div>
    {state.error ? <p ref={summary} tabIndex={-1} role="alert" className="registration-error-summary">{state.error}</p> : null}
    <p className="registration-required"><span aria-hidden="true">*</span> {text.required}</p>
    {fieldGroups.map(({section, fields}) => (
      <fieldset key={section} data-section={section} id={`registration-${section}`} tabIndex={-1}
        className="registration-fieldset" aria-describedby={`registration-${section}-hint`}>
        <legend>{copy.sections[section].title}</legend>
        <p id={`registration-${section}-hint`} className="registration-hint">{copy.sections[section].hint}</p>
        <div className="registration-fields">
          {fields.map(([name,type,required,autoComplete]) => {
            const error = fieldError(name);
            return (
              <div key={name} className={name === "contactFirstName" ? "registration-field-wide" : undefined}>
                <label htmlFor={`reg-${name}`}>
                  {copy.fields[name]?.label}
                  {required ? <span aria-hidden="true" className="registration-mark"> *</span> :
                    <span className="registration-optional">{copy.fields[name]?.optional}</span>}
                </label>
                <input id={`reg-${name}`} name={name} type={type} required={required} autoComplete={autoComplete}
                  dir={type === "email" || type === "tel" ? "ltr" : undefined} maxLength={name === "phone" ? 40 : 160}
                  className="registration-input" aria-invalid={Boolean(error)} aria-describedby={error ? `error-${name}` : undefined} />
                <FieldError id={`error-${name}`} message={error} />
              </div>
            );
          })}
        </div>
      </fieldset>
    ))}
    <fieldset className="registration-fieldset" id="registration-consent" data-section="consent"
      tabIndex={-1} aria-describedby="registration-consent-hint">
      <legend>{copy.sections.consent.title}</legend>
      <p className="registration-hint" id="registration-consent-hint">{copy.sections.consent.hint}</p>
      {([
        ["terms", copy.consent.terms, copy.termsLink, "/terms"],
        ["privacy", copy.consent.privacy, copy.privacyLink, "/privacy"],
        ["accuracy", copy.consent.accuracy, null, null],
      ] as const).map(([name, label, link, href]) => {
        const error = fieldError(name);
        const documentId = name === "accuracy" ? name : props.legalVersions[name].id;
        const words = link ? label.split(link) : null;
        return (
          <div key={documentId}>
            <label className="registration-check">
              <input type="checkbox" name={name} value="true" required aria-invalid={Boolean(error)}
                aria-describedby={error ? `error-${name}` : undefined} />
              <span>{href && words && words.length > 1 ?
                <>{words[0]}<Link href={`${href}?lang=${locale}`} target="_blank" rel="noopener noreferrer">{link}</Link>{words[1]}</> :
                label}</span>
            </label>
            <FieldError id={`error-${name}`} message={error} />
          </div>
        );
      })}
    </fieldset>
    <div className="registration-submit">
      <TurnstileField ref={challenge} config={props.botConfig} action="agency_registration" locale={locale} onVerified={setVerified} />
      <button type="submit" disabled={pending || !verified} aria-busy={pending} className="btn-primary registration-action">
        {pending ? <><Spinner/>{copy.submitPending}</> : copy.submitLabel}
      </button>
      <p>{copy.reviewNote}</p>
    </div>
  </form>;
}
