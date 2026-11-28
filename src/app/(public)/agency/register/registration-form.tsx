"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { submitRegistrationAction, type RegistrationFormState } from "@/app/actions/registrations";
import { FieldError, Spinner } from "@/components/forms";
import { TurnstileField, useProtectedAction } from "@/components/turnstile-field";
import { botProtectionCopy } from "@/lib/bot-protection-copy";
import type { RegistrationCopy, RegistrationLocale } from "@/lib/i18n";
import {
  assessRegistrationPhone, hasInvalidRegistrationNameCharacters, normalizeRegistrationEmail, normalizeRegistrationName,
  registrationPhoneEntry, registrationProblems, suggestRegistrationEmail,
} from "@/lib/registration-contact";
import { DEFAULT_REGISTRATION_PHONE_COUNTRY, registrationFields, type RegistrationDraft, type RegistrationField } from "@/lib/registration-draft";
import type { TurnstilePublicConfig } from "@/lib/turnstile-config";
import { readRegistrationDraft, restoreRegistrationLanguage } from "./registration-language-link";
import { RegistrationSpread } from "./registration-spread";
import { registrationSections, registrationUi, registrationProblemText, type RegistrationSection } from "./registration-ui";

const consentNames = ["terms", "privacy", "accuracy"] as const;
type ConsentName = (typeof consentNames)[number];
type FieldName = RegistrationField | ConsentName;
const fieldsBySection: Record<RegistrationSection, readonly FieldName[]> = {
  company: ["legalName", "city"],
  contact: ["contactFirstName", "contactLastName", "email", "phoneCountry", "phone"],
  consent: consentNames,
};
const initialDraft: RegistrationDraft = {
  legalName: "", city: "", contactFirstName: "", contactLastName: "", email: "", phoneCountry: DEFAULT_REGISTRATION_PHONE_COUNTRY, phone: "",
};
const initialActionState: RegistrationFormState = {};

function TextField({ name, label, optional, error, note, autoComplete, maxLength, type = "text" }: {
  name: RegistrationField;
  label: string;
  optional?: string;
  error?: string;
  note?: string;
  autoComplete: string;
  maxLength: number;
  type?: "text" | "email";
}) {
  const feedback = "reg-" + name + "-feedback";
  const contactName = name === "contactFirstName" || name === "contactLastName";
  return <div>
    <label htmlFor={"reg-" + name}>{label}{optional
      ? <span className="registration-optional">{optional}</span>
      : <span aria-hidden="true" className="registration-mark"> *</span>}</label>
    <input id={"reg-" + name} name={name} type={type} autoComplete={autoComplete} maxLength={maxLength}
      dir={type === "email" ? "ltr" : contactName ? "auto" : undefined} className="registration-input"
      autoCapitalize={contactName ? "words" : undefined} spellCheck={contactName ? false : undefined}
      required={!optional} aria-invalid={Boolean(error)} aria-describedby={error || note ? feedback : undefined} />
    <FieldMessage id={feedback} error={error} note={note} />
  </div>;
}

function FieldMessage({ id, error, note }: { id: string; error?: string; note?: string }) {
  return <p id={id} className={"registration-field-message" + (error ? " has-error" : "")} aria-live="polite">
    {error ?? note}
  </p>;
}

function fieldSection(name: string) {
  return registrationSections.find(section => fieldsBySection[section].some(field => field === name));
}

export default function RegistrationForm({ locale, copy, phoneOptions, botConfig, renderedAt, legalVersions }: {
  locale: RegistrationLocale;
  copy: RegistrationCopy;
  phoneOptions: readonly { country: string; code: string; name: string }[];
  botConfig: TurnstilePublicConfig;
  renderedAt: number;
  legalVersions: { terms: { id: string; version: number }; privacy: { id: string; version: number } };
}) {
  const text = registrationUi[locale];
  const { state, formAction, pending, verified, setVerified, challenge } =
    useProtectedAction<RegistrationFormState>(submitRegistrationAction, initialActionState, botConfig, locale);
  const formRef = useRef<HTMLFormElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [section, setSection] = useState<RegistrationSection>("company");
  const [draft, setDraft] = useState(initialDraft);
  const [touched, setTouched] = useState<ReadonlySet<FieldName>>(() => new Set());
  const [invalidConsents, setInvalidConsents] = useState<ReadonlySet<ConsentName>>(() => new Set());
  const [edited, setEdited] = useState(false);
  const [focus, setFocus] = useState<{ id: string } | null>(null);

  const phone = assessRegistrationPhone(draft.phone, draft.phoneCountry);
  const problems = registrationProblems(draft, phone);
  const suggestion = touched.has("email") ? suggestRegistrationEmail(draft.email) : undefined;

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const sync = () => setDraft(readRegistrationDraft(form));
    const restored = restoreRegistrationLanguage(form, locale, document.documentElement.lang === locale);
    if (restored) {
      setSection(restored);
      setEdited(true);
      setInvalidConsents(new Set());
    }
    sync();
    setEnhanced(true);
    window.addEventListener("pageshow", sync);
    return () => window.removeEventListener("pageshow", sync);
  }, [locale]);

  useEffect(() => {
    if (!state.error) return;
    setEdited(false);
    const firstField = Object.keys(state.fieldErrors ?? {})[0];
    const next = firstField ? fieldSection(firstField) : undefined;
    if (next) setSection(next);
    setFocus({ id: next ? "reg-" + firstField : "registration-error" });
  }, [state]);

  useEffect(() => {
    if (!focus) return;
    const control = document.getElementById(focus.id);
    control?.focus({ preventScroll: true });
    control?.scrollIntoView({ block: "nearest" });
  }, [focus]);

  function markTouched(names: readonly FieldName[]) {
    setTouched(previous => new Set([...previous, ...names]));
  }

  function errorFor(name: FieldName) {
    const field = name as RegistrationField;
    const problem = problems[field];
    const invalidCharacters = problem === "invalidName" && hasInvalidRegistrationNameCharacters(draft[field]);
    if (problem && (invalidCharacters || touched.has(name))) return registrationProblemText(locale, copy.errors, problem);
    if (invalidConsents.has(name as ConsentName)) return copy.errors.consentRequired;
    return edited ? undefined : state.fieldErrors?.[name];
  }

  function goTo(next: RegistrationSection, field?: FieldName) {
    if (botConfig.enabled && next !== "consent") setVerified(false);
    setSection(next);
    setFocus({ id: field ? "reg-" + field : "registration-" + next });
  }

  function firstProblem(values: RegistrationDraft, sections: readonly RegistrationSection[]) {
    const result = registrationProblems(values);
    return sections.flatMap(item => fieldsBySection[item]).find(name => result[name as RegistrationField]);
  }

  function changeSection(next: RegistrationSection) {
    const form = formRef.current;
    if (!form || pending) return;
    const values = readRegistrationDraft(form);
    setDraft(values);
    const targetIndex = registrationSections.indexOf(next);
    if (targetIndex > registrationSections.indexOf(section)) {
      const previousSections = registrationSections.slice(0, targetIndex);
      const invalid = firstProblem(values, previousSections);
      if (invalid) {
        markTouched(previousSections.flatMap(item => fieldsBySection[item]));
        goTo(fieldSection(invalid) ?? section, invalid);
        return;
      }
    }
    goTo(next);
  }

  function clearAccuracy(form: HTMLFormElement) {
    const accuracy = form.elements.namedItem("accuracy");
    if (accuracy instanceof HTMLInputElement) accuracy.checked = false;
  }

  function acceptPhoneEdit(form: HTMLFormElement, input: HTMLInputElement, pasted?: string) {
    const country = form.elements.namedItem("phoneCountry");
    if (!(country instanceof HTMLSelectElement)) return false;
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
    const displayed = entry?.national ?? draft.phone;
    if (input.value !== displayed) {
      input.value = displayed;
      const position = Math.min(displayed.length, Math.max(0, cursor - (value.length - displayed.length)));
      input.setSelectionRange(position, position);
    }
    if (!entry) return false;
    country.value = entry.country;
    if (entry.country !== draft.phoneCountry) {
      markTouched(["phone", "phoneCountry"]);
    }
    return true;
  }

  function syncEditedDraft(form: HTMLFormElement) {
    clearAccuracy(form);
    setDraft(readRegistrationDraft(form));
    setEdited(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // The default form action runs only after each visible stage has been checked.
    if (enhanced && section !== "consent") {
      event.preventDefault();
      changeSection(section === "company" ? "contact" : "consent");
      return;
    }
    const form = event.currentTarget;
    const values = readRegistrationDraft(form);
    setDraft(values);
    setEdited(true);
    markTouched([...registrationFields, ...consentNames]);
    const invalid = firstProblem(values, registrationSections);
    const missing = consentNames.filter(name => {
      const control = form.elements.namedItem(name);
      return !(control instanceof HTMLInputElement && control.checked);
    });
    setInvalidConsents(new Set(missing));
    if (invalid || missing[0] || !verified || pending) {
      event.preventDefault();
      if (invalid) goTo(fieldSection(invalid) ?? section, invalid);
      else if (missing[0]) goTo("consent", missing[0]);
    }
  }

  function applySuggestion(address: string) {
    const form = formRef.current;
    const input = form?.elements.namedItem("email");
    if (!form || !(input instanceof HTMLInputElement)) return;
    input.value = address;
    syncEditedDraft(form);
    input.focus();
  }

  const consentLabels = [
    ["terms", copy.consent.terms, copy.termsLink, "/terms"],
    ["privacy", copy.consent.privacy, copy.privacyLink, "/privacy"],
    ["accuracy", copy.consent.accuracy, null, null],
  ] as const;

  return (
    <RegistrationSpread locale={locale} title={copy.title} introduction={copy.subtitle}
      alreadyPartner={copy.alreadyPartner} signIn={copy.signIn} agencyName={draft.legalName} section={section}>
      <nav className="registration-index" aria-label={text.navigation}>
        <ol>
          {registrationSections.map((item, index) => (
            <li key={item}><a href={"#registration-" + item} aria-current={section === item ? "step" : undefined}
              onClick={event => { if (!enhanced) return; event.preventDefault(); changeSection(item); }}>
              <span aria-hidden="true">{new Intl.NumberFormat(locale).format(index + 1)}</span>{text[item]}
            </a></li>
          ))}
        </ol>
      </nav>
      <form ref={formRef} action={formAction} onReset={event => event.preventDefault()} className="registration-form"
        data-step={section} data-enhanced={enhanced} aria-labelledby="register-title" aria-busy={pending} noValidate={enhanced}
        onSubmit={handleSubmit}
        onKeyDown={event => {
          if (!enhanced || section === "consent" || event.key !== "Enter" || event.nativeEvent.isComposing) return;
          if (!(event.target instanceof HTMLInputElement) || event.target.type === "checkbox") return;
          event.preventDefault();
          changeSection(section === "company" ? "contact" : "consent");
        }}
        onChange={event => {
          const control = event.target;
          if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
          const form = event.currentTarget;
          const name = control.name as FieldName;
          if (registrationFields.includes(name as RegistrationField)) {
            if (name === "phone" && control instanceof HTMLInputElement && !acceptPhoneEdit(form, control)) return;
            syncEditedDraft(form);
            return;
          } else if (consentNames.includes(name as ConsentName) && control instanceof HTMLInputElement && control.checked) {
            setInvalidConsents(previous => {
              const remaining = new Set(previous);
              remaining.delete(name as ConsentName);
              return remaining;
            });
          }
          setEdited(true);
        }}
        onBlur={event => {
          const control = event.target;
          if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
          const name = control.name as RegistrationField;
          if (!registrationFields.includes(name)) return;
          const form = event.currentTarget;
          if (name === "email") control.value = normalizeRegistrationEmail(control.value);
          if (name === "contactFirstName" || name === "contactLastName") control.value = normalizeRegistrationName(control.value);
          markTouched([name]);
          setDraft(readRegistrationDraft(form));
        }}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="renderedAt" value={renderedAt} />
        <input type="hidden" name="termsVersionId" value={legalVersions.terms.id} />
        <input type="hidden" name="termsVersion" value={legalVersions.terms.version} />
        <input type="hidden" name="privacyVersionId" value={legalVersions.privacy.id} />
        <input type="hidden" name="privacyVersion" value={legalVersions.privacy.version} />
        <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
          <label>Fax<input name="fax" tabIndex={-1} autoComplete="off" /></label>
        </div>
        <noscript><style>{".registration-form .registration-fieldset{display:block!important}.registration-step-control{display:none!important}"}</style></noscript>
        {state.error && !edited ? <p id="registration-error" tabIndex={-1} role="alert" className="registration-error-summary">{state.error}</p> : null}
        <p className="registration-required"><span aria-hidden="true">*</span> {text.required}</p>

        <fieldset id="registration-company" className="registration-fieldset" tabIndex={-1}
          hidden={enhanced && section !== "company"} aria-describedby="registration-company-hint">
          <legend>{copy.sections.company.title}</legend>
          <p id="registration-company-hint" className="registration-hint">{copy.sections.company.hint}</p>
          <div className="registration-fields">
            <TextField name="legalName" label={copy.fields.legalName!.label} autoComplete="organization" maxLength={160} error={errorFor("legalName")} />
            <TextField name="city" label={copy.fields.city!.label} optional={copy.fields.city!.optional} autoComplete="address-level2" maxLength={80} error={errorFor("city")} />
          </div>
          <div className="registration-stage-actions registration-step-control">
            <button type="button" className="registration-action" disabled={!enhanced} onClick={() => changeSection("contact")}>{text.next}</button>
          </div>
        </fieldset>

        <fieldset id="registration-contact" className="registration-fieldset" tabIndex={-1}
          hidden={enhanced && section !== "contact"} aria-describedby="registration-contact-hint">
          <legend>{copy.sections.contact.title}</legend>
          <p id="registration-contact-hint" className="registration-hint">{copy.sections.contact.hint}</p>
          <div className="registration-fields">
            <TextField name="contactFirstName" label={text.givenName} autoComplete="given-name" maxLength={160} error={errorFor("contactFirstName")} />
            <TextField name="contactLastName" label={text.familyName} autoComplete="family-name" maxLength={80} error={errorFor("contactLastName")} />
            <div className="registration-field-wide">
              <TextField name="email" label={copy.fields.email!.label} type="email" autoComplete="email" maxLength={160}
                error={errorFor("email")} note={touched.has("email") && !problems.email && !suggestion ? text.emailValid : text.emailHint} />
              {suggestion && <button type="button" className="registration-email-suggestion" onClick={() => applySuggestion(suggestion)}>
                {text.emailSuggestion} <bdi dir="ltr">{suggestion}</bdi>
              </button>}
            </div>
            <div className="registration-field-wide registration-phone">
              <div>
                <label htmlFor="reg-phoneCountry">{text.dialCode}<span aria-hidden="true" className="registration-mark"> *</span></label>
                <select id="reg-phoneCountry" name="phoneCountry" defaultValue={DEFAULT_REGISTRATION_PHONE_COUNTRY}
                  className="registration-input" required aria-invalid={Boolean(errorFor("phoneCountry"))}
                  aria-describedby="reg-phone-feedback">
                  {phoneOptions.map(({ country, code, name }) => (
                    <option key={country} value={country}>{`${name} (\u2066${code}\u2069)`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="reg-phone">{text.nationalNumber}<span aria-hidden="true" className="registration-mark"> *</span></label>
                <input id="reg-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" dir="ltr"
                  className="registration-input" required aria-invalid={Boolean(errorFor("phone"))}
                  aria-describedby="reg-phone-feedback"
                  onPaste={event => {
                    const input = event.currentTarget;
                    const form = input.form;
                    if (!form) return;
                    event.preventDefault();
                    if (acceptPhoneEdit(form, input, event.clipboardData.getData("text"))) syncEditedDraft(form);
                  }} />
              </div>
              <div className="registration-field-wide">
                <FieldMessage id="reg-phone-feedback" error={errorFor("phoneCountry") ?? errorFor("phone")} />
              </div>
            </div>
          </div>
          <div className="registration-stage-actions registration-step-control">
            <button type="button" className="registration-back" disabled={!enhanced} onClick={() => changeSection("company")}>{text.back}</button>
            <button type="button" className="registration-action" disabled={!enhanced} onClick={() => changeSection("consent")}>{text.next}</button>
          </div>
        </fieldset>

        <fieldset id="registration-consent" className="registration-fieldset" tabIndex={-1}
          hidden={enhanced && section !== "consent"} aria-describedby="registration-consent-hint">
          <legend>{text.review}</legend>
          <p id="registration-consent-hint" className="registration-hint">{text.reviewHint}</p>
          {enhanced && <div className="registration-review">
            <div className="registration-review-heading">
              <h2>{text.company}</h2>
              <button type="button" className="registration-back" onClick={() => changeSection("company")}>{text.edit}<span className="sr-only"> {text.company}</span></button>
            </div>
            <p dir="auto">{draft.legalName}</p>
            {draft.city.trim() && <p dir="auto">{draft.city}</p>}
            <div className="registration-review-heading">
              <h2>{text.contact}</h2>
              <button type="button" className="registration-back" onClick={() => changeSection("contact")}>{text.edit}<span className="sr-only"> {text.contact}</span></button>
            </div>
            <p dir="auto">{draft.contactFirstName} {draft.contactLastName}</p>
            <p><bdi dir="ltr">{normalizeRegistrationEmail(draft.email)}</bdi></p>
            <p><bdi dir="ltr">{phone.status === "valid" ? phone.e164 : draft.phone}</bdi></p>
          </div>}
          <div className="registration-consents">
            {consentLabels.map(([name, label, link, href]) => {
              const error = errorFor(name);
              const documentId = name === "accuracy" ? name : legalVersions[name].id;
              const words = link ? label.split(link) : null;
              return <div key={documentId}>
                <label className="registration-check">
                  <input id={"reg-" + name} type="checkbox" name={name} value="true" required aria-invalid={Boolean(error)}
                    aria-describedby={error ? "error-" + name : undefined} />
                  <span>{href && words && words.length > 1
                    ? <>{words[0]}<Link href={href + "?lang=" + locale} target="_blank" rel="noopener noreferrer">{link}</Link>{words[1]}</>
                    : label}</span>
                </label>
                <FieldError id={"error-" + name} message={error} />
              </div>;
            })}
          </div>
          <div className="registration-submit">
            {enhanced && section === "consent" &&
              <TurnstileField ref={challenge} config={botConfig} action="agency_registration" locale={locale} onVerified={setVerified} />}
            {botConfig.enabled && <noscript><p className="registration-field-message has-error">{botProtectionCopy(locale).noScript}</p></noscript>}
            <div className="registration-stage-actions">
              {enhanced && <button type="button" className="registration-back" onClick={() => changeSection("contact")}>{text.back}</button>}
              <button type="submit" disabled={pending || !verified} aria-busy={pending} className="btn-primary registration-action">
                {pending ? <><Spinner/>{copy.submitPending}</> : copy.submitLabel}
              </button>
            </div>
            <p>{copy.reviewNote}</p>
          </div>
        </fieldset>
      </form>
    </RegistrationSpread>
  );
}
