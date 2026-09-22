"use client";

/**
 * Phase 2-Final — the 3-step visa request wizard (final UX):
 *   1. CHOOSE VISA  — country-first: destination countries (only active
 *      destinations with active visa types), then that country's visa types
 *      as selectable CARDS (name/category/price/currency/processing time).
 *      The single applicant is collected inline: Full Name + Nationality
 *      (country selector, default Algeria) — nothing else.
 *   2. UPLOAD DOCUMENTS (checklist loaded from the visa configuration)
 *   3. PREVIEW, CONFIRM & SUBMIT (one atomic server transaction)
 * Nothing is persisted before the final confirm: no draft, no reference.
 */

import { useMemo, useRef, useState } from "react";
import { submitRequestAction } from "@/app/actions/applications";

export interface WizardVisaOption {
  id: string;
  countryId: string;
  name: string;
  categoryName: string;
  fee: string;
  currency: string;
  minDays: number;
  maxDays: number;
}

export interface WizardCountry {
  id: string;
  name: string;
  visaTypes: WizardVisaOption[];
}

export interface WizardNationality {
  code: string;
  label: string;
}

export interface WizardRequirement {
  documentTypeId: string;
  name: string;
  code: string;
  required: boolean;
  notes: string | null;
}

export interface WizardLabels {
  stepChoose: string;
  stepUpload: string;
  stepPreview: string;
  chooseCountry: string;
  selectCountry: string;
  chooseVisa: string;
  selectVisa: string;
  fee: string;
  processing: string;
  days: string;
  priority: string;
  notes: string;
  notesPlaceholder: string;
  applicant: string;
  fullName: string;
  nationality: string;
  next: string;
  back: string;
  required: string;
  optional: string;
  uploadHint: string;
  fileTooLarge: string;
  chooseFile: string;
  documents: string;
  reviewTitle: string;
  reviewSubtitle: string;
  walletBalance: string;
  chargeNote: string;
  confirmSubmit: string;
  submitting: string;
  missingPrefix: string;
  summaryApplicant: string;
  summaryDocuments: string;
  noDocumentsRequired: string;
  validationChooseCountry: string;
  validationChooseVisa: string;
  validationApplicant: string;
  searchNationality: string;
}

interface Props {
  countries: WizardCountry[];
  nationalities: WizardNationality[];
  defaultNationality: string;
  priorities: { code: string; name: string }[];
  requirementsByVisaType: Record<string, WizardRequirement[]>;
  walletBalance: string;
  walletCurrency: string;
  locale: "en" | "fr" | "ar";
  labels: WizardLabels;
  serverError: string | null;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function RequestWizard(props: Props) {
  const { labels: t } = props;
  const [step, setStep] = useState(1);
  const [countryId, setCountryId] = useState("");
  const [visaTypeId, setVisaTypeId] = useState("");
  const [fileError, setFileError] = useState<string>("");
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [pending, setPending] = useState(false);
  const [clientError, setClientError] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);

  const country = useMemo(() => props.countries.find((c) => c.id === countryId) ?? null, [props.countries, countryId]);
  const visa = useMemo(() => country?.visaTypes.find((v) => v.id === visaTypeId) ?? null, [country, visaTypeId]);
  const requirements = useMemo(() => (visaTypeId ? (props.requirementsByVisaType[visaTypeId] ?? []) : []), [props.requirementsByVisaType, visaTypeId]);

  function validateStep(n: number): boolean {
    setClientError("");
    if (n === 1) {
      if (!countryId) { setClientError(t.validationChooseCountry); return false; }
      if (!visaTypeId) { setClientError(t.validationChooseVisa); return false; }
      const fullName = formRef.current?.querySelector<HTMLInputElement>(`input[name="t0_fullName"]`)?.value.trim() ?? "";
      const nationality = formRef.current?.querySelector<HTMLSelectElement>(`select[name="t0_nationality"]`)?.value.trim() ?? "";
      if (!fullName || !nationality) { setClientError(t.validationApplicant); return false; }
    }
    if (n === 2) {
      const missing = requirements.filter((r) => r.required && (files[r.documentTypeId]?.length ?? 0) === 0);
      if (missing.length > 0) {
        setClientError(`${t.missingPrefix}: ${missing.map((m) => m.name).join(", ")}`);
        return false;
      }
    }
    return true;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setStep(Math.min(3, step + 1));
  }

  function onFileChange(documentTypeId: string, list: FileList | null) {
    setFileError("");
    if (!list) return;
    const picked = Array.from(list);
    if (picked.some((f) => f.size > MAX_FILE_BYTES)) {
      setFileError(t.fileTooLarge);
      return;
    }
    setFiles((prev) => ({ ...prev, [documentTypeId]: picked }));
  }

  function applicantSummary(): string {
    const fd = formRef.current ? new FormData(formRef.current) : null;
    if (!fd) return "—";
    const full = String(fd.get("t0_fullName") ?? "").trim();
    const nat = String(fd.get("t0_nationality") ?? "").trim();
    const label = props.nationalities.find((n) => n.code === nat)?.label ?? nat;
    return full ? `${full} — ${label}` : "—";
  }

  return (
    <form
      ref={formRef}
      // The DIRECT server-action reference is what lets Next emit the
      // progressive-enhancement descriptor (no-JS / hosted form posts).
      action={submitRequestAction}
      onSubmit={() => { setPending(true); setClientError(""); }}
      className="space-y-4"
    >
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="countryId" value={countryId} />

      {/* Step rail — exactly THREE steps */}
      <ol className="flex flex-wrap items-center gap-2 text-sm" data-testid="wizard-steps">
        {[
          { n: 1, label: t.stepChoose },
          { n: 2, label: t.stepUpload },
          { n: 3, label: t.stepPreview },
        ].map((s) => (
          <li key={s.n} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                step === s.n ? "bg-iris-600 text-white" : step > s.n ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {s.n}
            </span>
            <span className={step === s.n ? "font-semibold text-navy-900" : "text-slate-500"}>{s.label}</span>
            {s.n < 3 ? <span className="mx-1 text-slate-300">→</span> : null}
          </li>
        ))}
      </ol>

      {(clientError || fileError || props.serverError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {clientError || fileError || props.serverError}
        </div>
      )}

      {/* ------------------ STEP 1: COUNTRY → VISA TYPE → APPLICANT ------------------ */}
      <section data-wizard-section="1" hidden={step !== 1}>
        <div className="card p-5 space-y-5">
          <div>
            <h2 className="font-serif text-lg text-navy-900">{t.chooseCountry}</h2>
            {!country ? <p className="mt-1 text-xs text-slate-500">{t.selectCountry}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="group" aria-label={t.chooseCountry}>
            {props.countries.map((c) => (
              <button
                type="button"
                key={c.id}
                data-testid="wizard-country"
                onClick={() => { setCountryId(c.id); setVisaTypeId(""); }}
                className={`rounded-2xl border p-4 text-start transition ${
                  countryId === c.id ? "border-iris-500 bg-iris-50/60 ring-2 ring-iris-200" : "border-slate-200 hover:border-iris-300"
                }`}
              >
                <span className="block font-semibold text-navy-900">{c.name}</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {c.visaTypes.length} {c.visaTypes.length === 1 ? "visa" : "visas"}
                </span>
              </button>
            ))}
          </div>

          {/* All countries' visa-type cards are always in the DOM (SSR),
              visually narrowed by selection — required for no-JS/submission
              robustness and hosted verification. */}
          <div>
            <h3 className="mb-2 font-serif text-base text-navy-900">{t.chooseVisa}</h3>
            {props.countries.map((c) => (
              <div key={c.id} hidden={country ? country.id !== c.id : false} className={country && country.id === c.id ? "" : country ? "" : "mb-3"}>
                {!country ? <p className="mb-1 text-xs font-semibold text-slate-400">{c.name}</p> : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label={c.name}>
                  {(country ? country.visaTypes : c.visaTypes).map((v) => (
                  <label
                    key={v.id}
                    data-testid="wizard-visa-type"
                    className={`cursor-pointer rounded-2xl border p-4 transition ${
                      visaTypeId === v.id ? "border-iris-500 bg-iris-50/60 ring-2 ring-iris-200" : "border-slate-200 hover:border-iris-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="visaTypeId"
                      value={v.id}
                      data-country-id={v.countryId}
                      className="sr-only"
                      checked={visaTypeId === v.id}
                      onChange={() => { setCountryId(v.countryId); setVisaTypeId(v.id); }}
                    />
                    <span className="block font-semibold text-navy-900">{v.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{v.categoryName}</span>
                    <span className="mt-2 block text-sm font-medium text-iris-700">
                      {v.fee} {v.currency} <span className="text-xs text-slate-400">· {t.processing} {v.minDays}–{v.maxDays} {t.days}</span>
                    </span>
                  </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <h3 className="font-semibold text-navy-900">{t.applicant}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="t0_fullName">{t.fullName} *</label>
                <input id="t0_fullName" name="t0_fullName" required autoComplete="name" className="input" data-testid="wizard-full-name" />
              </div>
              <div>
                <label className="label" htmlFor="t0_nationality">{t.nationality} *</label>
                <select
                  id="t0_nationality"
                  name="t0_nationality"
                  required
                  defaultValue={props.defaultNationality}
                  className="input"
                  data-testid="wizard-nationality"
                  aria-label={t.searchNationality}
                >
                  {props.nationalities.map((n) => (
                    <option key={n.code} value={n.code}>{n.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="priorityCode">{t.priority}</label>
                <select id="priorityCode" name="priorityCode" className="input" defaultValue="STANDARD">
                  {props.priorities.map((p) => (
                    <option key={p.code} value={p.code}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="agencyNotes">{t.notes}</label>
                <textarea id="agencyNotes" name="agencyNotes" rows={2} className="input" placeholder={t.notesPlaceholder} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------- STEP 2: UPLOAD DOCUMENTS ---------------------------- */}
      <section data-wizard-section="2" hidden={step !== 2}>
        <div className="card p-5 space-y-4">
          <h2 className="font-serif text-lg text-navy-900">{t.documents}</h2>
          {requirements.length === 0 ? (
            <p className="text-sm text-slate-500">{t.noDocumentsRequired}</p>
          ) : (
            <ul className="space-y-3">
              {requirements.map((r) => {
                const picked = files[r.documentTypeId] ?? [];
                return (
                  <li key={r.documentTypeId} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-navy-900">
                          {r.name}{" "}
                          <span className={`ms-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.required ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"}`}>
                            {r.required ? t.required : t.optional}
                          </span>
                        </p>
                        {r.notes ? <p className="mt-0.5 text-xs text-slate-500">{r.notes}</p> : null}
                        <p className="mt-1 text-[11px] text-slate-400">{t.uploadHint}</p>
                      </div>
                      <label className="btn-secondary btn-sm cursor-pointer">
                        {t.chooseFile}
                        <input
                          type="file"
                          name={`file_${r.documentTypeId}`}
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                          className="sr-only"
                          data-required={r.required ? "1" : "0"}
                          onChange={(e) => onFileChange(r.documentTypeId, e.currentTarget.files)}
                        />
                      </label>
                    </div>
                    {picked.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs text-slate-600">
                        {picked.map((f, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {f.name} · {(f.size / 1024).toFixed(0)} KB
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ---------------------------- STEP 3: PREVIEW & SUBMIT ---------------------------- */}
      <section data-wizard-section="3" hidden={step !== 3}>
        <div className="card p-5 space-y-4">
          <div>
            <h2 className="font-serif text-lg text-navy-900">{t.reviewTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{t.reviewSubtitle}</p>
          </div>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
              <dt className="text-slate-500">{t.chooseCountry}</dt>
              <dd className="font-medium text-navy-900">{country?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
              <dt className="text-slate-500">{t.chooseVisa}</dt>
              <dd className="font-medium text-navy-900">{visa?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
              <dt className="text-slate-500">{t.fee}</dt>
              <dd className="font-medium text-navy-900">{visa ? `${visa.fee} ${visa.currency}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
              <dt className="text-slate-500">{t.processing}</dt>
              <dd className="font-medium text-navy-900">{visa ? `${visa.minDays}–${visa.maxDays} ${t.days}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2 sm:col-span-2">
              <dt className="text-slate-500">{t.summaryApplicant}</dt>
              <dd className="font-medium text-navy-900">{step === 3 ? applicantSummary() : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2 sm:col-span-2">
              <dt className="text-slate-500">{t.walletBalance}</dt>
              <dd className="font-medium text-navy-900">{props.walletBalance} {props.walletCurrency}</dd>
            </div>
          </dl>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-navy-900">{t.summaryDocuments}</h3>
            <ul className="list-inside list-disc text-sm text-slate-600">
              {requirements.map((r) => (
                <li key={r.documentTypeId}>
                  {r.name}: {(files[r.documentTypeId] ?? []).length}
                </li>
              ))}
            </ul>
          </div>
          <p className="rounded-xl bg-iris-50 px-3 py-2 text-xs text-iris-800">{t.chargeNote}</p>
          <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
            {pending ? t.submitting : t.confirmSubmit}
          </button>
        </div>
      </section>

      {/* nav */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || pending} className="btn-secondary">
          ← {t.back}
        </button>
        {step < 3 ? (
          <button type="button" onClick={goNext} className="btn-primary">
            {t.next} →
          </button>
        ) : null}
      </div>
    </form>
  );
}
