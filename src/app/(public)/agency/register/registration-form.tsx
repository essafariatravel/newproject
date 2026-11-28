"use client";
import { useEffect, useRef, useState } from "react";
import { TurnstileField, useProtectedAction } from "@/components/turnstile-field";
import type { TurnstilePublicConfig } from "@/lib/turnstile-config";
import Link from "next/link";
import { submitRegistrationAction, type RegistrationFormState } from "@/app/actions/registrations";
import type { RegistrationCopy, RegistrationLocale } from "@/lib/i18n";
import { FieldError, Spinner } from "@/components/forms";
import {
  assessRegistrationPhone, contactFields, DEFAULT_PHONE_COUNTRY, hasInvalidRegistrationNameCharacters, normalizeRegistrationName,
  registrationContactError, registrationContactProblems, registrationContactText, registrationPhoneEntry,
  type ContactDraft, type ContactField, type registrationPhoneOptions,
} from "@/lib/registration-contact";

const emptyContact = { contactFirstName: "", contactLastName: "", phoneCountry: DEFAULT_PHONE_COUNTRY, phone: "" };

function readContact(form: HTMLFormElement): ContactDraft {
  return Object.fromEntries(contactFields.map(name => {
    const field = form.elements.namedItem(name);
    return [name, field instanceof HTMLInputElement || field instanceof HTMLSelectElement ? field.value : ""];
  })) as ContactDraft;
}

function isContactField(name: string): name is ContactField {
  return contactFields.some(field => field === name);
}

function isPersonalName(name: string) {
  return name === "contactFirstName" || name === "contactLastName";
}

function acceptPhoneEdit(input: HTMLInputElement, country: HTMLSelectElement, previous: string, pasted?: string) {
  let value = input.value;
  let cursor = input.selectionStart ?? value.length;
  if (pasted !== undefined) {
    const complete = assessRegistrationPhone(pasted, country.value);
    if (complete.status === "valid") {
      value = complete.national;
      country.value = complete.country;
      cursor = value.length;
    } else {
      value = value.slice(0, cursor) + pasted + value.slice(input.selectionEnd ?? cursor);
      cursor += pasted.length;
    }
  }
  const entry = registrationPhoneEntry(value, country.value);
  const displayed = entry?.national ?? previous;
  if (input.value !== displayed) {
    input.value = displayed;
    const position = Math.min(displayed.length, Math.max(0, cursor - (value.length - displayed.length)));
    input.setSelectionRange(position, position);
  }
  if (!entry) return false;
  country.value = entry.country;
  return true;
}

export default function RegistrationForm(props: {
  locale: RegistrationLocale;
  copy: RegistrationCopy;
  renderedAt: number;
  botConfig: TurnstilePublicConfig;
  phoneOptions: ReturnType<typeof registrationPhoneOptions>;
  legalVersions: { terms: { id: string; version: number }; privacy: { id: string; version: number } };
}) {
  const {copy,locale} = props;
  const text = registrationContactText[locale];
  const { state, formAction, pending, verified, setVerified, challenge } = useProtectedAction<RegistrationFormState>(submitRegistrationAction, {}, props.botConfig, locale);
  const summary = useRef<HTMLParagraphElement>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyContact);
  const [touched, setTouched] = useState<ReadonlySet<ContactField>>(() => new Set());
  const [edited, setEdited] = useState<ReadonlySet<ContactField>>(() => new Set());
  const problems = registrationContactProblems(draft);

  useEffect(() => {
    if (state.error) {
      setEdited(new Set());
      summary.current?.focus();
    }
  }, [state]);

  function updatePhone(form: HTMLFormElement, input: HTMLInputElement, pasted?: string) {
    const code = form.elements.namedItem("phoneCountry");
    if (!(code instanceof HTMLSelectElement) || !acceptPhoneEdit(input, code, draft.phone, pasted)) return;
    setDraft(readContact(form));
    setEdited(previous => new Set([...previous, "phoneCountry", "phone"]));
  }

  function fieldError(name: string) {
    if (!isContactField(name)) return state.fieldErrors?.[name];
    const problem = problems[name];
    const invalidCharacters = problem === "invalidName" && hasInvalidRegistrationNameCharacters(draft[name]);
    if (problem && (invalidCharacters || touched.has(name))) return registrationContactError(locale, copy.errors, problem);
    return edited.has(name) ? undefined : state.fieldErrors?.[name];
  }
  const fieldGroups = [
    { title: copy.sections.company.title, fields: [["legalName","text",true,"organization"],["city","text",false,"address-level2"]] },
    { title: copy.sections.contact.title, fields: [
      ["contactFirstName","text",true,"given-name"], ["contactLastName","text",true,"family-name"],
      ["email","email",true,"email"], ["phoneCountry","select",true,"tel-country-code"], ["phone","tel",true,"tel-national"],
    ] },
  ] as const;
  // Successful submissions redirect. Keep entered details available for correction on errors.
  return <form action={formAction} onReset={event => event.preventDefault()} className="space-y-6"
    onChange={event => {
      const control = event.target;
      const form = event.currentTarget;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
      const name = control.name;
      if (!isContactField(name)) return;
      if (name === "phone" && control instanceof HTMLInputElement) {
        updatePhone(form, control);
      } else {
        setDraft(readContact(form));
        setEdited(previous => name === "phoneCountry"
          ? new Set([...previous, name, "phone"]) : new Set([...previous, name]));
      }
    }}
    onBlur={event => {
      const control = event.target;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
      const name = control.name;
      if (!isContactField(name)) return;
      if (isPersonalName(name)) control.value = normalizeRegistrationName(control.value);
      setTouched(previous => new Set([...previous, name]));
      setDraft(readContact(event.currentTarget));
    }}
    onSubmit={event => {
      const form = event.currentTarget;
      const contact = readContact(form);
      const invalid = registrationContactProblems(contact);
      const first = contactFields.find(name => invalid[name]);
      if (!first) return;
      event.preventDefault();
      setDraft(contact);
      setTouched(new Set(contactFields));
      const control = form.elements.namedItem(first);
      if (control instanceof HTMLElement) control.focus();
    }}>
    <input type="hidden" name="locale" value={locale}/><input type="hidden" name="renderedAt" value={props.renderedAt}/>
    <input type="hidden" name="termsVersionId" value={props.legalVersions.terms.id}/><input type="hidden" name="termsVersion" value={props.legalVersions.terms.version}/><input type="hidden" name="privacyVersionId" value={props.legalVersions.privacy.id}/><input type="hidden" name="privacyVersion" value={props.legalVersions.privacy.version}/>
    <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden"><label>Fax<input name="fax" tabIndex={-1} autoComplete="off"/></label></div>
    {state.error ? <p ref={summary} tabIndex={-1} role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-base text-red-700">{state.error}</p> : null}
    {fieldGroups.map(group => (
      <fieldset key={group.title} className="registration-group">
        <legend>{group.title}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {group.fields.map(([name,type,required,autoComplete]) => {
            const error = fieldError(name);
            const label = name === "phoneCountry" ? text.phoneCountryLabel : name === "contactFirstName" || name === "contactLastName"
              ? text[name] : copy.fields[name]?.label;
            const input = { id: `reg-${name}`, name, required, autoComplete, className: "input",
              "aria-invalid": Boolean(error), "aria-describedby": error ? `error-${name}` : undefined };
            return (
              <div key={name} className={name === "email" ? "sm:col-span-2" : undefined}>
                <label htmlFor={`reg-${name}`} className="label">
                  {label}
                  {required ? <span aria-hidden="true" className="ms-1 text-red-600">*</span> : <span className="ms-2 font-normal text-slate-500">{copy.fields.city?.optional}</span>}
                </label>
                {type === "select" ? (
                  <select {...input} defaultValue={DEFAULT_PHONE_COUNTRY}>
                    {props.phoneOptions.map(({country, code, name}) => <option key={country} value={country}>{`${name} (\u2066${code}\u2069)`}</option>)}
                  </select>
                ) : (
                  <input {...input} type={type} dir={type === "email" || type === "tel" ? "ltr" : isPersonalName(name) ? "auto" : undefined}
                    inputMode={type === "tel" ? "numeric" : undefined}
                    maxLength={type === "tel" ? undefined : name === "contactLastName" || name === "city" ? 80 : 160}
                    autoCapitalize={isPersonalName(name) ? "words" : undefined} spellCheck={isPersonalName(name) ? false : undefined}
                    onPaste={type === "tel" ? event => {
                      const field = event.currentTarget;
                      if (!field.form) return;
                      event.preventDefault();
                      updatePhone(field.form, field, event.clipboardData.getData("text"));
                    } : undefined} />
                )}
                <div aria-live="polite"><FieldError id={`error-${name}`} message={error} /></div>
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
