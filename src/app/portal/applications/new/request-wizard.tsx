"use client";

/**
 * Phase 2.3 §5–§12 — the 3-step visa request wizard.
 *
 * ONE mounted form, three sections shown one at a time:
 *   1. CHOOSE VISA (+ traveller info inline)
 *   2. UPLOAD DOCUMENTS (checklist loaded from the visa configuration)
 *   3. PREVIEW, CONFIRM & SUBMIT (atomic server transaction)
 * Nothing is persisted before the final confirm: no draft, no reference.
 */

import { useMemo, useRef, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { submitRequestAction } from "@/app/actions/applications";

export interface WizardVisaOption {
  id: string;
  label: string;
  countryName: string;
  categoryName: string;
  name: string;
  fee: string;
  currency: string;
  minDays: number;
  maxDays: number;
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
  visaProgramme: string;
  selectVisa: string;
  noVisaSelected: string;
  fee: string;
  processing: string;
  days: string;
  priority: string;
  notes: string;
  notesPlaceholder: string;
  travellers: string;
  traveller: string;
  addTraveller: string;
  removeTraveller: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  passportNumber: string;
  passportIssueDate: string;
  passportExpiryDate: string;
  email: string;
  phone: string;
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
  summaryTravellers: string;
  summaryDocuments: string;
  noDocumentsRequired: string;
  validationChooseVisa: string;
  validationTraveller: string;
}

interface Props {
  visaOptions: WizardVisaOption[];
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
  const [visaTypeId, setVisaTypeId] = useState("");
  const [travellerCount, setTravellerCount] = useState(1);
  const [fileError, setFileError] = useState<string>("");
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [pending, setPending] = useState(false);
  const [clientError, setClientError] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);

  const visa = useMemo(() => props.visaOptions.find((v) => v.id === visaTypeId) ?? null, [props.visaOptions, visaTypeId]);
  const requirements = useMemo(() => (visaTypeId ? (props.requirementsByVisaType[visaTypeId] ?? []) : []), [props.requirementsByVisaType, visaTypeId]);

  function sectionEl(n: number): HTMLElement | null {
    return formRef.current?.querySelector<HTMLElement>(`[data-wizard-section="${n}"]`) ?? null;
  }

  function validateStep(n: number): boolean {
    setClientError("");
    if (n === 1) {
      if (!visaTypeId) {
        setClientError(t.validationChooseVisa);
        return false;
      }
      const section = sectionEl(1);
      if (section) {
        const inputs = Array.from(section.querySelectorAll<HTMLInputElement>("input[required]"));
        for (const input of inputs) {
          if (!input.value.trim()) {
            setClientError(t.validationTraveller);
            input.focus();
            return false;
          }
        }
      }
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

  function travellerSummary(): string[] {
    const fd = formRef.current ? new FormData(formRef.current) : null;
    if (!fd) return [];
    const out: string[] = [];
    for (let i = 0; i < travellerCount; i++) {
      const first = String(fd.get(`t${i}_firstName`) ?? "").trim();
      const last = String(fd.get(`t${i}_lastName`) ?? "").trim();
      const pp = String(fd.get(`t${i}_passportNumber`) ?? "").trim();
      if (first || last) out.push(`${first} ${last} — ${pp}`);
    }
    return out;
  }

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        setPending(true);
        setClientError("");
        try {
          await submitRequestAction(fd);
        } finally {
          setPending(false);
        }
      }}
      className="space-y-4"
    >
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {/* Step rail */}
      <ol className="flex flex-wrap items-center gap-2 text-sm">
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

      {/* ---------------------------- STEP 1: CHOOSE VISA ---------------------------- */}
      <section data-wizard-section="1" hidden={step !== 1}>
        <div className="card p-5 space-y-5">
          <div>
            <h2 className="font-serif text-lg text-navy-900">{t.visaProgramme}</h2>
            {!visa ? <p className="mt-1 text-xs text-slate-500">{t.selectVisa}</p> : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {props.visaOptions.map((v) => (
              <label
                key={v.id}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  visaTypeId === v.id ? "border-iris-500 bg-iris-50/60 ring-2 ring-iris-200" : "border-slate-200 hover:border-iris-300"
                }`}
              >
                <input
                  type="radio"
                  name="visaTypeId"
                  value={v.id}
                  className="sr-only"
                  checked={visaTypeId === v.id}
                  onChange={() => setVisaTypeId(v.id)}
                />
                <span className="block font-semibold text-navy-900">{v.name}</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {v.countryName} · {v.categoryName}
                </span>
                <span className="mt-2 block text-sm font-medium text-iris-700">
                  {v.fee} {v.currency} <span className="text-xs text-slate-400">· {v.minDays}–{v.maxDays} {t.days}</span>
                </span>
              </label>
            ))}
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

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-navy-900">{t.travellers}</h3>
              <button
                type="button"
                onClick={() => setTravellerCount((c) => Math.min(25, c + 1))}
                className="btn-secondary btn-sm"
              >
                + {t.addTraveller}
              </button>
            </div>
            {Array.from({ length: travellerCount }, (_, i) => (
              <fieldset key={i} className="rounded-2xl border border-slate-200 p-4">
                <legend className="px-1 text-xs font-semibold text-slate-500">
                  {t.traveller} {i + 1}
                  {i > 0 ? (
                    <button type="button" onClick={() => setTravellerCount((c) => Math.max(1, c - 1))} className="ms-2 text-rose-500 hover:underline">
                      {t.removeTraveller}
                    </button>
                  ) : null}
                </legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`t${i}_firstName`}>{t.firstName} *</label>
                    <input id={`t${i}_firstName`} name={`t${i}_firstName`} required className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`t${i}_lastName`}>{t.lastName} *</label>
                    <input id={`t${i}_lastName`} name={`t${i}_lastName`} required className="input" />
                  </div>
                  <div>
                    <label className="label">{t.dateOfBirth} *</label>
                    <DatePicker name={`t${i}_dateOfBirth`} required locale={props.locale} max={new Date().toISOString().slice(0, 10)} placeholder={t.dateOfBirth} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`t${i}_nationality`}>{t.nationality} *</label>
                    <input id={`t${i}_nationality`} name={`t${i}_nationality`} required className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`t${i}_passportNumber`}>{t.passportNumber} *</label>
                    <input id={`t${i}_passportNumber`} name={`t${i}_passportNumber`} required className="input" />
                  </div>
                  <div>
                    <label className="label">{t.passportExpiryDate} *</label>
                    <DatePicker name={`t${i}_passportExpiryDate`} required locale={props.locale} min={new Date().toISOString().slice(0, 10)} placeholder={t.passportExpiryDate} />
                  </div>
                  <div>
                    <label className="label">{t.passportIssueDate}</label>
                    <DatePicker name={`t${i}_passportIssueDate`} locale={props.locale} placeholder={t.passportIssueDate} />
                  </div>
                  <div>
                    <label className="label" htmlFor={`t${i}_email`}>{t.email}</label>
                    <input id={`t${i}_email`} name={`t${i}_email`} type="email" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor={`t${i}_phone`}>{t.phone}</label>
                    <input id={`t${i}_phone`} name={`t${i}_phone`} className="input" />
                  </div>
                </div>
              </fieldset>
            ))}
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
              <dt className="text-slate-500">{t.visaProgramme}</dt>
              <dd className="font-medium text-navy-900">{visa ? `${visa.name} (${visa.countryName})` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
              <dt className="text-slate-500">{t.fee}</dt>
              <dd className="font-medium text-navy-900">{visa ? `${visa.fee} ${visa.currency}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
              <dt className="text-slate-500">{t.processing}</dt>
              <dd className="font-medium text-navy-900">{visa ? `${visa.minDays}–${visa.maxDays} ${t.days}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
              <dt className="text-slate-500">{t.walletBalance}</dt>
              <dd className="font-medium text-navy-900">{props.walletBalance} {props.walletCurrency}</dd>
            </div>
          </dl>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-navy-900">{t.summaryTravellers}</h3>
            <ul className="list-inside list-disc text-sm text-slate-600">
              {step === 3 ? travellerSummary().map((line, idx) => <li key={idx}>{line}</li>) : null}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-navy-900">{t.summaryDocuments}</h3>
            <ul className="list-inside list-disc text-sm text-slate-600">
              {requirements.map((r) => (
                <li key={r.documentTypeId}>
                  {r.name}: {(files[r.documentTypeId] ?? []).length} {(files[r.documentTypeId] ?? []).length === 1 ? "file" : "files"}
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
