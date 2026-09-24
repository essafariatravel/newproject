"use client";

/**
 * The 3-step visa request wizard — §12/§13/§14/§15.
 *
 *   1. DESTINATION  — search-first. No giant country list: type a destination,
 *      pick it from suggestions (only destinations with a bookable DZD
 *      programme), and the selection collapses to a compact summary.
 *   2. DOCUMENTS    — requirement cards from the visa-type configuration,
 *      2 MB per file enforced here AND server-side.
 *   3. REVIEW       — VISA / APPLICANT / DOCUMENTS / PAYMENT SUMMARY, one
 *      explicit money action with the exact amount on the button.
 *
 * Nothing is persisted before the final confirmation, so abandoning the flow
 * can never leave a dossier behind.
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
  description?: string | null;
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
  destinationQuestion: string;
  destinationHint: string;
  searchDestination: string;
  noDestinationMatch: string;
  destinationsAvailable: string;
  popularDestinations: string;
  destination: string;
  change: string;
  chooseVisa: string;
  selectVisa: string;
  availableProgrammes: string;
  fee: string;
  processing: string;
  days: string;
  processingUnspecified: string;
  notes: string;
  notesPlaceholder: string;
  applicant: string;
  fullName: string;
  fullNamePlaceholder: string;
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
  balanceAfter: string;
  chargeNote: string;
  confirmSubmit: string;
  submitApplication: string;
  submitting: string;
  missingPrefix: string;
  summaryApplicant: string;
  summaryDocuments: string;
  noDocumentsRequired: string;
  validationChooseCountry: string;
  validationChooseVisa: string;
  validationApplicant: string;
  searchNationality: string;
  sectionVisa: string;
  programme: string;
  sectionApplicant: string;
  sectionPayment: string;
  insufficientTitle: string;
  requiredAmount: string;
  currentBalance: string;
  missingAmount: string;
  requestTopup: string;
  uploaded: string;
  remove: string;
}

interface Props {
  countries: WizardCountry[];
  nationalities: WizardNationality[];
  defaultNationality: string;
  requirementsByVisaType: Record<string, WizardRequirement[]>;
  walletBalance: string;
  walletCurrency: string;
  locale: "en" | "fr" | "ar";
  labels: WizardLabels;
  serverError: string | null;
  /** Destination preselected from the ?destination=<countryId> deep link. */
  initialCountryId?: string | null;
  /** Deep link used by the insufficient-balance state. */
  topupPath?: string;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SUGGESTIONS = 8;
const POPULAR_COUNT = 6;

/** Accent-insensitive, case-insensitive destination matching (§13). */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function RequestWizard(props: Props) {
  const { labels: t } = props;
  const [step, setStep] = useState(1);
  const [countryId, setCountryId] = useState(() => {
    const initial = props.initialCountryId;
    return initial && props.countries.some((c) => c.id === initial) ? initial : "";
  });
  const [visaTypeId, setVisaTypeId] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
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

  const suggestions = useMemo(() => {
    const q = normalize(countrySearch);
    const pool = props.countries.filter((c) => c.visaTypes.length > 0);
    if (!q) {
      // No query: a short, deliberate set of quick picks — never the full list.
      return [...pool].sort((a, b) => b.visaTypes.length - a.visaTypes.length || a.name.localeCompare(b.name)).slice(0, POPULAR_COUNT);
    }
    return pool
      .filter((c) => normalize(c.name).includes(q) || c.visaTypes.some((v) => normalize(v.name).includes(q)))
      .slice(0, MAX_SUGGESTIONS);
  }, [props.countries, countrySearch]);

  const filteredNationalities = useMemo(() => {
    if (!natSearch.trim()) return props.nationalities;
    const q = normalize(natSearch);
    return props.nationalities.filter((n) => normalize(n.label).includes(q) || normalize(n.code).includes(q));
  }, [props.nationalities, natSearch]);

  // Auto-select when the chosen destination has exactly one programme.
  useEffect(() => {
    if (country && country.visaTypes.length === 1) {
      const only = country.visaTypes[0];
      if (only && visaTypeId !== only.id) setVisaTypeId(only.id);
    }
  }, [country, visaTypeId]);

  function validateStep(n: number): boolean {
    setClientError("");
    if (n === 1) {
      if (!countryId) {
        setClientError(t.validationChooseCountry);
        return false;
      }
      if (!visaTypeId) {
        setClientError(t.validationChooseVisa);
        return false;
      }
      const form = formRef.current;
      if (form) {
        const fullName = (form.elements.namedItem("t0_fullName") as HTMLInputElement | null)?.value?.trim() ?? "";
        const nationality = (form.elements.namedItem("t0_nationality") as HTMLSelectElement | null)?.value?.trim() ?? "";
        if (!fullName || !nationality) {
          setClientError(t.validationApplicant);
          return false;
        }
      }
    }
    if (n === 2) {
      for (const r of requirements) {
        if (r.required && (files[r.documentTypeId] ?? []).length === 0) {
          setClientError(`${t.missingPrefix}: ${r.name}`);
          return false;
        }
      }
    }
    return true;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setStep(Math.min(3, step + 1));
  }

  function onFileChange(documentTypeId: string, list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setFileError(`${t.fileTooLarge} (${tooBig.name})`);
      return;
    }
    setFileError("");
    setFiles((prev) => ({ ...prev, [documentTypeId]: incoming }));
  }

  function removeFile(documentTypeId: string) {
    setFiles((prev) => ({ ...prev, [documentTypeId]: [] }));
  }

  function applicantSummary(): string {
    const form = formRef.current;
    if (!form) return "—";
    const fullName = (form.elements.namedItem("t0_fullName") as HTMLInputElement | null)?.value?.trim() ?? "";
    const natSelect = form.elements.namedItem("t0_nationality") as HTMLSelectElement | null;
    const nat = natSelect?.selectedOptions?.[0]?.textContent ?? natSelect?.value ?? "";
    return [fullName, nat].filter(Boolean).join(" · ") || "—";
  }

  const feeNumber = visa ? Number(visa.fee) : 0;
  const balanceNumber = Number(props.walletBalance);
  const afterNum = balanceNumber - feeNumber;
  const canAfford = visa ? afterNum >= 0 : false;
  const missing = canAfford ? 0 : Math.max(0, feeNumber - balanceNumber);
  const topupHref = `${props.topupPath ?? "/portal/wallet"}#topup`;

  function processingLabel(v: { minDays: number; maxDays: number }): string {
    if (v.minDays > 0 && v.maxDays > 0) return `${v.minDays}–${v.maxDays} ${t.days}`;
    if (v.minDays === 0 && v.maxDays === 0) return t.processingUnspecified;
    return t.processingUnspecified;
  }

  const totalDestinations = props.countries.filter((c) => c.visaTypes.length > 0).length;

  return (
    <form ref={formRef} action={submitRequestAction} className="space-y-5" onSubmit={() => setPending(true)}>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {countryId ? <input type="hidden" name="countryId" value={countryId} /> : null}
      <input type="hidden" name="locale" value={props.locale} />

      {/* Step rail */}
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
          </li>
        ))}
      </ol>

      {props.serverError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{props.serverError}</p>
      ) : null}
      {clientError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{clientError}</p>
      ) : null}

      {/* STEP 1 — destination search, then programmes, then applicant */}
      <section data-wizard-section="1" hidden={step !== 1} className="space-y-5">
        <div className="card space-y-4 p-5">
          <div>
            <h2 className="font-serif text-lg text-navy-900">{t.destinationQuestion}</h2>
            <p className="mt-1 text-xs text-slate-500">{t.destinationHint}</p>
          </div>

          {country ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-iris-200 bg-iris-50/50 px-4 py-3">
              <p className="text-sm">
                <span className="text-slate-500">{t.destination}: </span>
                <span className="font-semibold text-navy-900" data-testid="wizard-destination-selected">
                  {country.name}
                </span>
              </p>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  setCountryId("");
                  setVisaTypeId("");
                }}
              >
                {t.change}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="label sr-only" htmlFor="destination-search">
                {t.searchDestination}
              </label>
              <input
                id="destination-search"
                type="search"
                role="combobox"
                aria-expanded={searchFocused || countrySearch.length > 0}
                aria-controls="destination-suggestions"
                autoComplete="off"
                className="input text-base"
                placeholder={t.searchDestination}
                value={countrySearch}
                data-testid="wizard-destination-search"
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => setCountrySearch(e.target.value)}
              />
              <p className="text-xs text-slate-400">
                {t.destinationsAvailable.replace("{count}", String(totalDestinations))}
              </p>

              {suggestions.length === 0 ? (
                <p className="rounded-xl bg-ivory-50 px-3 py-2 text-sm text-slate-500">{t.noDestinationMatch}</p>
              ) : (
                <div id="destination-suggestions" role="listbox" aria-label={t.searchDestination}>
                  {!countrySearch ? (
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {t.popularDestinations}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((c) => (
                      /* Real links: a destination is deep-linkable and the step
                         still works without JavaScript (?destination=<id>). */
                      <a
                        key={c.id}
                        role="option"
                        aria-selected={countryId === c.id}
                        href={`?destination=${c.id}`}
                        data-testid="wizard-destination-option"
                        data-country-id={c.id}
                        onClick={(e) => {
                          e.preventDefault();
                          setCountryId(c.id);
                          setCountrySearch("");
                          if (c.visaTypes.length !== 1) setVisaTypeId("");
                        }}
                        className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-navy-900 transition-colors hover:border-iris-300 hover:bg-iris-50"
                      >
                        {c.name}
                        <span className="ms-2 text-[11px] text-slate-400">{c.visaTypes.length}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Programmes for the chosen destination only */}
          {country ? (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-navy-900">
                {t.availableProgrammes}
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {country.visaTypes.map((v) => (
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
                      onChange={() => setVisaTypeId(v.id)}
                    />
                    <span className="block font-semibold text-navy-900">{v.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{v.categoryName}</span>
                    <span className="mt-1.5 block text-sm font-medium text-navy-800 tabular-nums">
                      {v.fee} DZD <span className="text-xs text-slate-400">· {t.processing} {processingLabel(v)}</span>
                    </span>
                    {v.description ? <span className="mt-1 block text-xs text-slate-500">{v.description}</span> : null}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Applicant — one traveler, minimal data (§12) */}
        <div className="card space-y-4 p-5">
          <h3 className="font-semibold text-navy-900">{t.applicant}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="t0_fullName">{t.fullName} *</label>
              <input
                id="t0_fullName"
                name="t0_fullName"
                required
                autoComplete="name"
                className="input"
                data-testid="wizard-full-name"
                placeholder={t.fullNamePlaceholder}
              />
            </div>
            <div>
              <label className="label" htmlFor="t0_nationality">{t.nationality} *</label>
              <div className="space-y-1.5">
                <input
                  type="search"
                  placeholder={t.searchNationality}
                  value={natSearch}
                  onChange={(e) => setNatSearch(e.target.value)}
                  className="input text-xs"
                  aria-label={t.searchNationality}
                />
                <select
                  id="t0_nationality"
                  name="t0_nationality"
                  required
                  defaultValue={props.defaultNationality}
                  className="input"
                  data-testid="wizard-nationality"
                  aria-label={t.nationality}
                >
                  {filteredNationalities.map((n) => (
                    <option key={n.code} value={n.code}>{n.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="agencyNotes">{t.notes}</label>
            <textarea id="agencyNotes" name="agencyNotes" rows={2} className="input" placeholder={t.notesPlaceholder} />
          </div>
        </div>
      </section>

      {/* STEP 2 — documents */}
      <section data-wizard-section="2" hidden={step !== 2} className="space-y-4">
        <div className="card p-5">
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-4">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-slate-400">{t.destination}</dt>
              <dd className="font-medium text-navy-900">{country?.name ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-slate-400">{t.stepChoose}</dt>
              <dd className="font-medium text-navy-900">{visa?.name ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-slate-400">{t.fee}</dt>
              <dd className="font-medium tabular-nums text-navy-900">{visa ? `${visa.fee} DZD` : "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-slate-400">{t.processing}</dt>
              <dd className="font-medium text-navy-900">{visa ? processingLabel(visa) : "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="card space-y-4 p-5">
          <h2 className="font-serif text-lg text-navy-900">{t.documents}</h2>
          {fileError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="wizard-file-error">
              {fileError}
            </p>
          ) : null}
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
                          <li key={idx} className="flex flex-wrap items-center gap-2">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <span className="font-medium text-navy-800">{f.name}</span>
                            <span className="text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                            <span className="badge bg-emerald-100 text-emerald-800">{t.uploaded}</span>
                            <button
                              type="button"
                              onClick={() => removeFile(r.documentTypeId)}
                              className="text-[11px] font-semibold text-rose-600 underline"
                            >
                              {t.remove}
                            </button>
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

      {/* STEP 3 — review & submit */}
      <section data-wizard-section="3" hidden={step !== 3} className="space-y-4">
        <div className="card space-y-5 p-5">
          <div>
            <h2 className="font-serif text-lg text-navy-900">{t.reviewTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{t.reviewSubtitle}</p>
          </div>

          {/* VISA */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t.sectionVisa}</h3>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
                <dt className="text-slate-500">{t.destination}</dt>
                <dd className="font-medium text-navy-900">{country?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
                <dt className="text-slate-500">{t.programme}</dt>
                <dd className="font-medium text-navy-900">{visa?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
                <dt className="text-slate-500">{t.processing}</dt>
                <dd className="font-medium text-navy-900">{visa ? processingLabel(visa) : "—"}</dd>
              </div>
            </dl>
          </div>

          {/* APPLICANT */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t.sectionApplicant}</h3>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2 sm:col-span-2">
                <dt className="text-slate-500">{t.summaryApplicant}</dt>
                <dd className="font-medium text-navy-900" data-testid="wizard-applicant-summary">{applicantSummary()}</dd>
              </div>
            </dl>
          </div>

          {/* DOCUMENTS */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t.summaryDocuments}</h3>
            <ul className="space-y-1 text-sm">
              {requirements.map((r) => {
                const count = (files[r.documentTypeId] ?? []).length;
                const missingHere = r.required && count === 0;
                return (
                  <li key={r.documentTypeId} className="flex items-center justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
                    <span className="text-slate-600">{r.name}</span>
                    <span className={missingHere ? "font-semibold text-rose-600" : "font-medium text-emerald-700"}>
                      {missingHere ? t.missingPrefix : `${count} × ${t.uploaded}`}
                    </span>
                  </li>
                );
              })}
              {requirements.length === 0 ? <li className="text-slate-500">{t.noDocumentsRequired}</li> : null}
            </ul>
          </div>

          {/* PAYMENT */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t.sectionPayment}</h3>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
                <dt className="text-slate-500">{t.fee}</dt>
                <dd className="font-medium tabular-nums text-navy-900">{visa ? `${visa.fee} DZD` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-xl bg-ivory-50 px-3 py-2">
                <dt className="text-slate-500">{t.currentBalance}</dt>
                <dd className="font-medium tabular-nums text-navy-900">{props.walletBalance} DZD</dd>
              </div>
              <div className={`flex justify-between gap-3 rounded-xl px-3 py-2 ${canAfford ? "bg-emerald-50" : "bg-gold-50"}`}>
                <dt className={canAfford ? "text-emerald-700" : "text-gold-800"}>{t.balanceAfter}</dt>
                <dd className={`font-medium tabular-nums ${canAfford ? "text-emerald-800" : "text-gold-800"}`}>
                  {canAfford && visa ? `${afterNum.toFixed(2)} DZD` : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <p className="rounded-xl bg-iris-50 px-3 py-2 text-xs text-iris-800">{t.chargeNote}</p>

          {canAfford ? (
            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full sm:w-auto disabled:opacity-50"
              data-testid="wizard-submit"
            >
              {pending ? t.submitting : `${t.submitApplication} — ${visa?.fee ?? ""} DZD`}
            </button>
          ) : (
            <div className="space-y-3 rounded-2xl border border-gold-200 bg-gold-50 p-4">
              <p className="font-semibold text-gold-900">{t.insufficientTitle}</p>
              <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-3">
                <div className="flex justify-between gap-2">
                  <dt className="text-gold-800">{t.requiredAmount}</dt>
                  <dd className="font-medium tabular-nums text-gold-900">{feeNumber.toFixed(2)} DZD</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gold-800">{t.currentBalance}</dt>
                  <dd className="font-medium tabular-nums text-gold-900">{balanceNumber.toFixed(2)} DZD</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gold-800">{t.missingAmount}</dt>
                  <dd className="font-semibold tabular-nums text-gold-900">{missing.toFixed(2)} DZD</dd>
                </div>
              </dl>
              <a href={topupHref} className="btn-primary inline-flex w-full sm:w-auto" data-testid="wizard-topup-cta">
                {t.requestTopup}
              </a>
            </div>
          )}
        </div>
      </section>

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
