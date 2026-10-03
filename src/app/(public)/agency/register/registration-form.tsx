"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitRegistrationAction, type RegistrationFormState } from "@/app/actions/registrations";
import type { RegistrationCopy, RegistrationLocale } from "@/lib/i18n";
import { REGISTRATION_BUSINESS_TYPES } from "@/lib/registration-constants";
import { FieldError, Spinner } from "@/components/forms";

type LegalVersionRef = { id: string; version: string };

export default function RegistrationForm(props: {
  locale: RegistrationLocale;
  copy: RegistrationCopy;
  renderedAt: number;
  legalVersions: {
    terms: LegalVersionRef;
    privacy: LegalVersionRef;
  } | null;
}) {
  const { copy, locale, legalVersions } = props;
  const [state, formAction, pending] = useActionState<RegistrationFormState, FormData>(
    submitRegistrationAction,
    {},
  );
  const err = (key: string) => state.fieldErrors?.[key];

  if (!legalVersions) {
    const text = {
      en: {
        title: "Agency registration is temporarily unavailable",
        body: "Registration will open once the approved Terms of Service and Privacy Notice are published for this language.",
        links: "You can review the legal pages below when they become available.",
      },
      fr: {
        title: "L’inscription des agences est temporairement indisponible",
        body: "L’inscription sera ouverte lorsque les Conditions d’utilisation et l’Avis de confidentialité approuvés seront publiés dans cette langue.",
        links: "Vous pourrez consulter les pages juridiques ci-dessous dès leur publication.",
      },
      ar: {
        title: "تسجيل الوكالات غير متاح مؤقتاً",
        body: "سيتم فتح التسجيل بعد نشر شروط الخدمة وإشعار الخصوصية المعتمدين بهذه اللغة.",
        links: "يمكنكم مراجعة الصفحات القانونية أدناه بعد نشرها.",
      },
    }[locale];

    return (
      <div className="card p-7" role="status">
        <h2 className="font-serif text-xl text-navy-900">{text.title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{text.body}</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">{text.links}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/terms" className="btn-secondary btn-sm">
            {copy.termsLink}
          </Link>
          <Link href="/privacy" className="btn-secondary btn-sm">
            {copy.privacyLink}
          </Link>
        </div>
      </div>
    );
  }

  const fieldLabel = (key: string, required = false) => {
    const fieldCopy = copy.fields[key];
    if (!fieldCopy) return key;
    return (
      <span className="flex items-baseline justify-between gap-2">
        <span>
          {fieldCopy.label}
          {required ? <span className="ms-1 text-red-500">*</span> : null}
        </span>
        {!required && fieldCopy.optional ? (
          <span className="text-[10px] font-medium normal-case tracking-normal text-slate-400">
            {fieldCopy.optional}
          </span>
        ) : null}
      </span>
    );
  };

  const textField = (
    name: string,
    opts?: { required?: boolean; type?: string; span?: boolean; defaultValue?: string },
  ) => (
    <div key={name} className={opts?.span ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={`reg-${name}`}>
        {fieldLabel(name, opts?.required)}
      </label>
      <input
        id={`reg-${name}`}
        name={name}
        type={opts?.type ?? "text"}
        required={opts?.required}
        defaultValue={opts?.defaultValue}
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

  const minimizationNote = {
    en: "First contact is intentionally minimal. Do not upload company, tax, banking or identity documents here. ESSAFARIA will request specific administrative evidence later, securely, only if it is needed.",
    fr: "Le premier contact est volontairement minimal. N’envoyez ici aucun document d’entreprise, fiscal, bancaire ou d’identité. ESSAFARIA demandera ultérieurement, de manière sécurisée, uniquement les justificatifs administratifs réellement nécessaires.",
    ar: "تم تقليل بيانات الاتصال الأول إلى الحد الضروري. لا ترسلوا هنا وثائق الشركة أو الضرائب أو البنك أو الهوية. ستطلب ESSAFARIA لاحقاً وبطريقة آمنة فقط الوثائق الإدارية المطلوبة فعلياً.",
  }[locale];

  return (
    <form action={formAction} className="card overflow-hidden">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="renderedAt" value={props.renderedAt} />
      <input type="hidden" name="termsVersionId" value={legalVersions.terms.id} />
      <input type="hidden" name="privacyVersionId" value={legalVersions.privacy.id} />

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

      {sectionTitle(copy.sections.company.title, minimizationNote, 1)}
      <div className="grid grid-cols-1 gap-4 px-6 py-6 sm:grid-cols-2 sm:px-8">
        {textField("legalName", { required: true, span: true })}
        {textField("country", { required: true, defaultValue: "Algeria" })}
        {textField("region")}
        {textField("city", { required: true })}
        <div>
          <label className="label" htmlFor="reg-businessType">
            {fieldLabel("businessType", true)}
          </label>
          <select id="reg-businessType" name="businessType" required className="input" defaultValue="">
            <option value="" disabled>—</option>
            {REGISTRATION_BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>{copy.businessTypes[type]}</option>
            ))}
          </select>
          <FieldError message={err("businessType")} />
        </div>
      </div>

      {sectionTitle(copy.sections.contact.title, copy.sections.contact.hint, 2)}
      <div className="grid grid-cols-1 gap-4 px-6 py-6 sm:grid-cols-2 sm:px-8">
        {textField("contactFirstName", { required: true })}
        {textField("contactLastName", { required: true })}
        {textField("contactEmail", { required: true, type: "email" })}
        {textField("contactPhone", { required: true })}
      </div>

      {sectionTitle(copy.sections.business.title, copy.sections.business.hint, 3)}
      <div className="px-6 py-6 sm:px-8">
        <label className="label" htmlFor="reg-message">
          {fieldLabel("message")}
        </label>
        <textarea
          id="reg-message"
          name="message"
          rows={4}
          maxLength={1200}
          placeholder={copy.fields.message?.placeholder}
          className="input"
        />
        <FieldError message={err("message")} />
      </div>

      {sectionTitle(copy.sections.consent.title, copy.sections.consent.hint, 4)}
      <div className="space-y-4 px-6 py-6 sm:px-8">
        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-600">
            <input
              type="checkbox"
              name="terms"
              value="true"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-ivory-200 accent-[#4a5bd0]"
            />
            <span>
              {copy.consent.terms}{" "}
              <Link href="/terms" target="_blank" className="font-semibold text-navy-800 underline underline-offset-2">
                {copy.termsLink}
              </Link>{" "}
              <span className="text-xs text-slate-400">({legalVersions.terms.version})</span>
              <span className="ms-1 text-red-500">*</span>
            </span>
          </label>
          <FieldError message={err("terms")} />
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-600">
            <input
              type="checkbox"
              name="privacy"
              value="true"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-ivory-200 accent-[#4a5bd0]"
            />
            <span>
              {copy.consent.privacy}{" "}
              <Link href="/privacy" target="_blank" className="font-semibold text-navy-800 underline underline-offset-2">
                {copy.privacyLink}
              </Link>{" "}
              <span className="text-xs text-slate-400">({legalVersions.privacy.version})</span>
              <span className="ms-1 text-red-500">*</span>
            </span>
          </label>
          <FieldError message={err("privacy")} />
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-600">
            <input
              type="checkbox"
              name="accuracy"
              value="true"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-ivory-200 accent-[#4a5bd0]"
            />
            <span>
              {copy.consent.accuracy}
              <span className="ms-1 text-red-500">*</span>
            </span>
          </label>
          <FieldError message={err("accuracy")} />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line/70 bg-ivory-50/60 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="max-w-md text-[11px] leading-relaxed text-slate-400">{copy.noticeBody}</p>
        <button type="submit" disabled={pending} className="btn-gold shrink-0 px-6 py-3">
          {pending ? <><Spinner /> {copy.submitPending}</> : copy.submitLabel}
        </button>
      </div>
    </form>
  );
}
