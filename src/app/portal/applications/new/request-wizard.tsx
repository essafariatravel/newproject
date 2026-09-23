"use client";

/**
 * 3-step wizard: Choose Visa -> Applicant&Docs -> Review&Submit
 * Step1: searchable countries, collapsible visa lists, auto-select single visa,
 *        full name + nationality (Algeria default).
 * Step2: documents from visa config with 2MB client guard.
 * Step3: review with DZD balance before/after.
 */

import { useMemo, useRef, useState, useEffect } from "react";
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
  const [countrySearch, setCountrySearch] = useState("");
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [natSearch, setNatSearch] = useState("");
  const [fileError, setFileError] = useState("");
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [pending, setPending] = useState(false);
  const [clientError, setClientError] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);

  const country = useMemo(() => props.countries.find((c) => c.id === countryId) ?? null, [props.countries, countryId]);
  const visa = useMemo(() => country?.visaTypes.find((v) => v.id === visaTypeId) ?? null, [country, visaTypeId]);
  const requirements = useMemo(() => (visaTypeId ? (props.requirementsByVisaType[visaTypeId] ?? []) : []), [props.requirementsByVisaType, visaTypeId]);

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return props.countries;
    const q = countrySearch.trim().toLowerCase();
    return props.countries.filter((c) => c.name.toLowerCase().includes(q) || c.visaTypes.some((v) => v.name.toLowerCase().includes(q)));
  }, [props.countries, countrySearch]);

  const filteredNationalities = useMemo(() => {
    if (!natSearch.trim()) return props.nationalities;
    const q = natSearch.trim().toLowerCase();
    return props.nationalities.filter((n) => n.label.toLowerCase().includes(q) || n.code.toLowerCase().includes(q));
  }, [props.nationalities, natSearch]);

  // Auto-expand selected country
  useEffect(() => {
    if (countryId) {
      setExpandedCountries((prev) => {
        const next = new Set(prev);
        next.add(countryId);
        return next;
      });
    }
  }, [countryId]);

  // Auto-select when single visa type
  useEffect(() => {
    if (country && country.visaTypes.length === 1 && !visaTypeId) {
      const only = country.visaTypes[0];
      if (only) setVisaTypeId(only.id);
    }
  }, [country, visaTypeId]);

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

  const balanceNum = parseFloat(props.walletBalance || "0");
  const feeNum = visa ? parseFloat(visa.fee || "0") : 0;
  const afterNum = balanceNum - feeNum;
  const canAfford = afterNum >= 0;

  return (
    <form
      ref={formRef}
      action={submitRequestAction}
      onSubmit={() => { setPending(true); setClientError(""); }}
      className="space-y-4"
    >
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="countryId" value={countryId} />

      <ol className="flex flex-wrap items-center gap-2 text-sm" data-testid="wizard-steps">
        {[
          { n: 1, label: t.stepChoose },
          { n: 2, label: t.stepUpload },
          { n: 3, label: t.stepPreview },
        ].map((s) => (
          <li key={s.n} className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step === s.n ? "bg-iris-600 text-white" : step > s.n ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
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

      {/* STEP 1 */}
      <section data-wizard-section="1" hidden={step !== 1}>
        <div className="card p-5 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg text-navy-900">{t.chooseCountry}</h2>
              <p className="mt-1 text-xs text-slate-500">{t.selectCountry}</p>
            </div>
            <div className="w-full sm:w-64">
              <input
                type="search"
                placeholder="Search country or visa…"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                className="input text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredCountries.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No countries match “{countrySearch}”.</p>
            ) : (
              filteredCountries.map((c) => {
                const isExpanded = expandedCountries.has(c.id) || countryId === c.id;
                const isSelected = countryId === c.id;
                return (
                  <div key={c.id} className={`rounded-2xl border ${isSelected ? "border-iris-300 bg-iris-50/40" : "border-slate-200 bg-white"}`}>
                    <button
                      type="button"
                      data-testid="wizard-country"
                      onClick={() => {
                        const wasSelected = countryId === c.id;
                        if (wasSelected) {
                          // collapse toggle
                          setExpandedCountries((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          });
                        } else {
                          setCountryId(c.id);
                          if (c.visaTypes.length === 1) {
                            const only = c.visaTypes[0];
                            if (only) setVisaTypeId(only.id);
                          }
                          else if (c.visaTypes.length > 1 && !c.visaTypes.some((v) => v.id === visaTypeId)) {
                            // keep previous visa if same country, otherwise clear
                            const sameCountry = props.countries.find((cc) => cc.id === countryId)?.visaTypes.some((v) => v.id === visaTypeId);
                            if (!sameCountry) setVisaTypeId("");
                          }
                          setExpandedCountries((prev) => { const n = new Set(prev); n.add(c.id); return n; });
                        }
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
                    >
                      <span className="flex items-center gap-2">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${isSelected ? "bg-iris-600 text-white" : "bg-slate-100 text-slate-500"}`}>{c.name.slice(0,1)}</span>
                        <span className="font-semibold text-navy-900">{c.name}</span>
                        <span className="text-xs text-slate-400">{c.visaTypes.length} visa{c.visaTypes.length !== 1 ? "s" : ""}</span>
                      </span>
                      <span className="text-slate-400">{isExpanded ? "▾" : "▸"}</span>
                    </button>

                    {isExpanded ? (
                      <div className="grid grid-cols-1 gap-2 border-t border-slate-100 p-3 sm:grid-cols-2">
                        {c.visaTypes.map((v) => (
                          <label
                            key={v.id}
                            data-testid="wizard-visa-type"
                            className={`cursor-pointer rounded-xl border p-3 transition ${visaTypeId === v.id ? "border-iris-500 bg-iris-50 ring-2 ring-iris-200" : "border-slate-200 hover:border-iris-300"}`}
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
                            <span className="mt-1.5 block text-sm font-medium text-navy-800 tabular-nums">{v.fee} DZD <span className="text-xs text-slate-400">· {t.processing} {v.minDays}–{v.maxDays} {t.days}</span></span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <h3 className="font-semibold text-navy-900">{t.applicant}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="t0_fullName">{t.fullName} *</label>
                <input id="t0_fullName" name="t0_fullName" required autoComplete="name" className="input" data-testid="wizard-full-name" placeholder="Full name as in passport" />
              </div>
              <div>
                <label className="label" htmlFor="t0_nationality">{t.nationality} *</label>
                <div className="space-y-1.5">
                  <input
                    type="search"
                    placeholder="Search nationality…"
                    value={natSearch}
                    onChange={(e) => setNatSearch(e.target.value)}
                    className="input text-xs"
                  />
                  <select
                    id="t0_nationality"
                    name="t0_nationality"
                    required
                    defaultValue={props.defaultNationality}
                    className="input"
                    data-testid="wizard-nationality"
                    aria-label={t.searchNationality}
                  >
                    {filteredNationalities.map((n) => (
                      <option key={n.code} value={n.code}>{n.label}</option>
                    ))}
                  </select>
                </div>
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

      {/* STEP 2 */}
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

      {/* STEP 3 */}
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
              <dd className="font-medium text-navy-900 tabular-nums">{visa ? `${visa.fee} DZD` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
              <dt className="text-slate-500">{t.processing}</dt>
              <dd className="font-medium text-navy-900">{visa ? `${visa.minDays}–${visa.maxDays} ${t.days}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2 sm:col-span-2">
              <dt className="text-slate-500">{t.summaryApplicant}</dt>
              <dd className="font-medium text-navy-900">{step === 3 ? applicantSummary() : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
              <dt className="text-slate-500">{t.walletBalance}</dt>
              <dd className="font-medium text-navy-900 tabular-nums">{props.walletBalance} DZD</dd>
            </div>
            <div className={`flex justify-between gap-3 rounded-xl px-3 py-2 ${canAfford ? "bg-emerald-50" : "bg-rose-50"}`}>
              <dt className={canAfford ? "text-emerald-700" : "text-rose-700"}>Balance after</dt>
              <dd className={`font-medium tabular-nums ${canAfford ? "text-emerald-800" : "text-rose-700"}`}>{visa ? `${afterNum.toFixed(2)} DZD` : "—"} {canAfford ? "" : "— insufficient"}</dd>
            </div>
          </dl>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-navy-900">{t.summaryDocuments}</h3>
            <ul className="list-inside list-disc text-sm text-slate-600">
              {requirements.map((r) => (
                <li key={r.documentTypeId}>{r.name}: {(files[r.documentTypeId] ?? []).length}</li>
              ))}
            </ul>
          </div>
          <p className="rounded-xl bg-iris-50 px-3 py-2 text-xs text-iris-800">{t.chargeNote}</p>
          {!canAfford ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">Wallet balance too low — request top-up before submitting.</p>
          ) : null}
          <button type="submit" disabled={pending || !canAfford} className="btn-primary w-full sm:w-auto disabled:opacity-50">
            {pending ? t.submitting : `${t.confirmSubmit} — ${visa?.fee ?? ""} DZD`}
          </button>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || pending} className="btn-secondary">← {t.back}</button>
        {step < 3 ? (
          <button type="button" onClick={goNext} className="btn-primary">{t.next} →</button>
        ) : null}
      </div>
    </form>
  );
}
