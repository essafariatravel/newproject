"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitRegistrationAction, type RegistrationFormState } from "@/app/actions/registrations";
import type { RegistrationCopy, RegistrationLocale } from "@/lib/i18n";
import {
  MONTHLY_VOLUMES,
  REGISTRATION_BUSINESS_TYPES,
  REGISTRATION_DOCUMENT_CATEGORIES,
} from "@/lib/registration-constants";
import { FieldError, Spinner } from "@/components/forms";

/**
 * Premium B2B agency registration form (EN / FR / AR + RTL aware).
 * Pure client shell — every rule is enforced again server-side.
 */
export default function RegistrationForm(props: {
  locale: RegistrationLocale;
  copy: RegistrationCopy;
  renderedAt: number;
}) {
  const { copy, locale } = props;
  const [state, formAction, pending] = useActionState<RegistrationFormState, FormData>(
    submitRegistrationAction,
    {},
  );
  const err = (key: string) => state.fieldErrors?.[key];

  const fieldLabel = (key: string, required = false) => {
    const f = copy.fields[key];
    if (!f) return key;
    return (
      <span className="flex items-baseline justify-between gap-2">
        <span>
          {f.label}
          {required ? <span className="ms-1 text-red-500">*</span> : null}
        </span>
        {!required && f.optional ? (
          <span className="text-[10px] font-medium normal-case tracking-normal text-slate-400">
            {f.optional}
          </span>
        ) : null}
      </span>
    );
  };

  const textField = (name: string, opts?: { required?: boolean; type?: string; span?: boolean }) => (
    <div key={name} className={opts?.span ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={`reg-${name}`}>
        {fieldLabel(name, opts?.required)}
      </label>
      <input
        id={`reg-${name}`}
        name={name}
        type={opts?.type ?? "text"}
        required={opts?.required}
        placeholder={copy.fields[name]?.placeholder}
        aria-invalid={Boolean(err(name))}
        className="input"
      />
      <FieldError message={err(name)} />
    </div>
  );

  const sectionTitle = (title: string, hint: string, index: number) => (
    <div className="flex items-start gap-3 border-b border-line/70 px-6 py-4 sm:px-8">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-100 font-serif text-[11px] italic text-gold-700">
        {String(index).padStart(2, "0")}
      </span>
      <div>
        <h2 className="font-serif text-base text-navy-900">{title}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{hint}</p>
      </div>
    </div>
  );

  return (
    <form action={formAction} className="card overflow-hidden">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="renderedAt" value={props.renderedAt} />

      {/* Honeypot — invisible to humans, irresistible to bots */}
      <div aria-hidden="true" className="absolute -start-[9999px] top-[-9999px] h-0 w-0 overflow-hidden opacity-0">
        <label>
          Fax
          <input type="text" name="fax" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state.error ? (
        <div role="alert" className="mx-6 mt-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-8">
          {state.error}
        </div>
      ) : null}

      {/* 01 — Company */}
      {sectionTitle(copy.sections.company.title, copy.sections.company.hint, 1)}
      <div className="grid grid-cols-1 gap-4 px-6 py-6 sm:grid-cols-2 sm:px-8">
        {textField("legalName", { required: true })}
        {textField("tradingName")}
        {textField("country", { required: true })}
        {textField("region")}
        {textField("city", { required: true })}
        {textField("phone", { required: true })}
        {textField("addressLine", { required: true, span: true })}
        {textField("email", { required: true, type: "email" })}
        {textField("website", { type: "url" })}
        {textField("commercialRegistrationNumber", { required: true })}
        {textField("taxId")}
        {textField("licenceNumber")}
      </div>

      {/* 02 — Primary contact */}
      {sectionTitle(copy.sections.contact.title, copy.sections.contact.hint, 2)}
      <div className="grid grid-cols-1 gap-4 px-6 py-6 sm:grid-cols-2 sm:px-8">
        {textField("contactFirstName", { required: true })}
        {textField("contactLastName", { required: true })}
        {textField("contactPosition", { required: true })}
        {textField("contactPhone", { required: true })}
        {textField("contactEmail", { required: true, type: "email", span: true })}
      </div>

      {/* 03 — Business profile */}
      {sectionTitle(copy.sections.business.title, copy.sections.business.hint, 3)}
      <div className="grid grid-cols-1 gap-4 px-6 py-6 sm:grid-cols-2 sm:px-8">
        <div>
          <label className="label" htmlFor="reg-businessType">
            {fieldLabel("businessType", true)}
          </label>
          <select id="reg-businessType" name="businessType" required className="input" defaultValue="">
            <option value="" disabled>
              —
            </option>
            {REGISTRATION_BUSINESS_TYPES.map((t) => (
              <option key={t} value={t}>
                {copy.businessTypes[t]}
              </option>
            ))}
          </select>
          <FieldError message={err("businessType")} />
        </div>
        <div>
          <label className="label" htmlFor="reg-monthlyVolume">
            {fieldLabel("monthlyVolume")}
          </label>
          <select id="reg-monthlyVolume" name="monthlyVolume" className="input" defaultValue="">
            <option value="">—</option>
            {MONTHLY_VOLUMES.map((v) => (
              <option key={v} value={v}>
                {copy.monthlyVolumes.find((o) => o.value === v)?.label ?? v}
              </option>
            ))}
          </select>
        </div>
        {textField("mainMarkets", { span: true })}
        <div className="sm:col-span-2">
          <label className="label" htmlFor="reg-message">
            {fieldLabel("message")}
          </label>
          <textarea
            id="reg-message"
            name="message"
            rows={4}
            placeholder={copy.fields.message?.placeholder}
            className="input"
          />
          <FieldError message={err("message")} />
        </div>
      </div>

      {/* 04 — Documents */}
      {sectionTitle(copy.sections.documents.title, copy.sections.documents.hint, 4)}
      <div className="grid grid-cols-1 gap-4 px-6 py-6 sm:grid-cols-2 sm:px-8">
        {REGISTRATION_DOCUMENT_CATEGORIES.map((category) => {
          const cat = copy.docCategories[category] ?? { label: category, hint: "" };
          return (
            <div key={category} className="rounded-2xl border border-dashed border-ivory-200 bg-ivory-50/50 p-4">
              <label className="label" htmlFor={`reg-doc-${category}`}>
                {cat.label}
              </label>
              <p className="mb-2 text-[11px] text-slate-400">{cat.hint}</p>
              <input
                id={`reg-doc-${category}`}
                name={`doc_${category}`}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="w-full text-xs text-slate-500 file:me-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-navy-900 file:px-3.5 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-800"
              />
              <FieldError message={err(`doc_${category}`)} />
            </div>
          );
        })}
        <p className="text-[11px] text-slate-400 sm:col-span-2">{copy.documentsRules}</p>
      </div>

      {/* 05 — Consent */}
      {sectionTitle(copy.sections.consent.title, copy.sections.consent.hint, 5)}
      <div className="space-y-3.5 px-6 py-6 sm:px-8">
        {(
          [
            ["terms", copy.consent.terms, copy.termsLink, "/terms"],
            ["privacy", copy.consent.privacy, copy.privacyLink, "/privacy"],
            ["accuracy", copy.consent.accuracy, null, null],
          ] as const
        ).map(([name, label, linkText, href]) => {
          const linked = linkText && label.includes(linkText);
          return (
            <div key={name}>
              <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-600">
                <input
                  type="checkbox"
                  name={name}
                  value="true"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-ivory-200 text-iris-600 accent-[#4a5bd0] focus:ring-iris-500/20"
                />
                <span>
                  {linked && href ? (
                    <>
                      {label.split(linkText)[0]}
                      <Link href={href} target="_blank" className="font-semibold text-navy-800 underline underline-offset-2 hover:text-navy-900">
                        {linkText}
                      </Link>
                      {label.split(linkText)[1]}
                    </>
                  ) : linkText && href ? (
                    <>
                      {label}{" "}
                      <Link href={href} target="_blank" className="font-semibold text-navy-800 underline underline-offset-2 hover:text-navy-900">
                        {linkText}
                      </Link>
                    </>
                  ) : (
                    label
                  )}
                  <span className="ms-1 text-red-500">*</span>
                </span>
              </label>
              <FieldError message={err(name)} />
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-line/70 bg-ivory-50/60 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="max-w-md text-[11px] leading-relaxed text-slate-400">{copy.noticeBody}</p>
        <button
          type="submit"
          disabled={pending}
          className="btn-gold shrink-0 px-6 py-3"
        >
          {pending ? (
            <>
              <Spinner /> {copy.submitPending}
            </>
          ) : (
            copy.submitLabel
          )}
        </button>
      </div>
    </form>
  );
}
