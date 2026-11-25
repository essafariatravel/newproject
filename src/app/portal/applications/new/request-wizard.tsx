"use client";
import { useAgencyPopover } from "@/components/agency-popover-controller";

/**
 * The 3-step visa request wizard — §12/§13/§14/§15.
 *
 *   1. DESTINATION  — a nationality-style searchable selector with a compact
 *      floating list (maximum six rows visible), plus popular quick picks.
 *      All active DZD destinations remain browseable by scroll or typing.
 *   2. DOCUMENTS    — requirement cards from the visa-type configuration,
 *      2 MB per file enforced here AND server-side.
 *   3. REVIEW       — VISA / APPLICANT / DOCUMENTS / PAYMENT SUMMARY, one
 *      explicit money action with the exact amount on the button.
 *
 * Nothing is persisted before the final confirmation, so abandoning the flow
 * can never leave a dossier behind.
 */

import { useMemo, useRef, useState, useEffect } from "react";
import { contentT } from "@/lib/i18n-content";
import { formatDZD } from "@/lib/format";
import { readRequestResponse, requestFailureFeedback } from "@/lib/request-feedback";

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
  initialVisaTypeId?: string | null;
  /** Deep link used by the insufficient-balance state. */
  topupPath?: string;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
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
  const [wizardDirection, setWizardDirection] = useState<"forward" | "back">("forward");
  const [countryId, setCountryId] = useState(() => {
    const initial = props.initialCountryId;
    return initial && props.countries.some((c) => c.id === initial) ? initial : "";
  });
  const [visaTypeId, setVisaTypeId] = useState(()=>props.countries.find(c=>c.id===props.initialCountryId)?.visaTypes.some(v=>v.id===props.initialVisaTypeId)?props.initialVisaTypeId??"":"");
  const [countrySearch, setCountrySearch] = useState("");
  const [destinationOpen, setDestinationOpen] = useState(false);
  const destinationPickerRef = useRef<HTMLDivElement>(null);
  const destinationListRef = useRef<HTMLDivElement>(null);
  useAgencyPopover(destinationPickerRef,destinationOpen,setDestinationOpen);
  const [activeDestination,setActiveDestination]=useState(-1);
  const destinationChangeRef=useRef<HTMLButtonElement>(null);
  const keyboardSelectionRef=useRef(false);
  const [fileError, setFileError] = useState("");
  const [activeDoc,setActiveDoc]=useState("");
  const [previewIndex,setPreviewIndex]=useState(0);
  const [previewUrl,setPreviewUrl]=useState("");
  const [dragging,setDragging]=useState(false);
  const [nameDraft,setNameDraft]=useState("");
  const [nationalityDraft,setNationalityDraft]=useState(props.defaultNationality);
  const ui = {
    fr:{title:"Nouvelle demande",reservation:"Votre demande",travel:"Voyage et voyageur",documents:"Documents",confirm:"Confirmation",suggestions:"Destinations suggérées",ready:"Prêt à vérifier",select:"Choisissez un programme",noDebit:"Aucun débit avant la confirmation.",estimate:"Solde estimé après confirmation",covered:"Votre solde couvre cette demande.",missing:"Montant manquant",drop:"Déposez votre document ici",browse:"Parcourir les fichiers",nextDoc:"Pièce suivante",review:"Vérifier le dossier",continue:"Préparer les documents",preview:"Aperçu",unavailable:"Aperçu indisponible pour ce format. Vérifiez le fichier sur votre appareil.",replace:"Changer de fichier",changeWarning:"Changer de programme supprimera les fichiers déjà sélectionnés. Continuer ?",invalid:"Format non accepté",duplicate:"Ce fichier est déjà sélectionné. Vérifiez la pièce choisie.",local:"Fichiers sur cet appareil jusqu’à la confirmation",empty:"À préparer",optional:"Facultatif",edit:"Modifier",download:"Ouvrir le fichier",payment:"Votre paiement",check:"Votre dossier est prêt à être vérifié",selected:"Pièce sélectionnée",working:"Délai indicatif",notes:"Instructions facultatives"},
    en:{title:"New application",reservation:"Your application",travel:"Trip and traveller",documents:"Documents",confirm:"Confirmation",suggestions:"Suggested destinations",ready:"Ready to review",select:"Choose a programme",noDebit:"No charge until confirmation.",estimate:"Estimated balance after confirmation",covered:"Your balance covers this application.",missing:"Amount missing",drop:"Drop your document here",browse:"Browse files",nextDoc:"Next document",review:"Review application",continue:"Prepare documents",preview:"Preview",unavailable:"Preview unavailable for this format. Check the file on your device.",replace:"Change file",changeWarning:"Changing the programme removes the selected files. Continue?",invalid:"Unsupported format",duplicate:"This file is already selected. Check the chosen document.",local:"Files stay on this device until confirmation",empty:"To prepare",optional:"Optional",edit:"Edit",download:"Open file",payment:"Your payment",check:"Your application is ready to review",selected:"Document selected",working:"Estimated processing time",notes:"Optional instructions"},
    ar:{title:"طلب جديد",reservation:"طلبكم",travel:"الرحلة والمسافر",documents:"الوثائق",confirm:"التأكيد",suggestions:"الوجهات المقترحة",ready:"جاهز للمراجعة",select:"اختاروا برنامجاً",noDebit:"لا خصم قبل التأكيد.",estimate:"الرصيد المتوقع بعد التأكيد",covered:"رصيدكم يغطي هذا الطلب.",missing:"المبلغ الناقص",drop:"أفلتوا الوثيقة هنا",browse:"تصفح الملفات",nextDoc:"الوثيقة التالية",review:"مراجعة الطلب",continue:"تحضير الوثائق",preview:"معاينة",unavailable:"المعاينة غير متاحة لهذا التنسيق. تحققوا من الملف على جهازكم.",replace:"تغيير الملف",changeWarning:"سيؤدي تغيير البرنامج إلى حذف الملفات المحددة. هل تريدون المتابعة؟",invalid:"تنسيق غير مدعوم",duplicate:"هذا الملف محدد مسبقاً. تحققوا من الوثيقة المختارة.",local:"تبقى الملفات على الجهاز حتى التأكيد",empty:"للتحضير",optional:"اختياري",edit:"تعديل",download:"فتح الملف",payment:"الدفع",check:"طلبكم جاهز للمراجعة",selected:"وثيقة محددة",working:"مدة المعالجة التقديرية",notes:"تعليمات اختيارية"}
  }[props.locale];
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);
  const leavingAfterSuccess = useRef(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty && !pending) return;
    const protect = (event: BeforeUnloadEvent) => {
      if (leavingAfterSuccess.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty,pending]);
  const [transfer, setTransfer] = useState<{done:number;total:number;phase:"files"|"confirm"} | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLOListElement>(null);
  const previousStep = useRef(1);
  const progressCopy = { en: { files:"Documents received by the server", confirm:"Confirming the application and wallet charge…", notice:"Keep this page open until confirmation.", selected:"Required documents selected" }, fr: { files:"Documents reçus par le serveur", confirm:"Confirmation du dossier et du débit du portefeuille…", notice:"Gardez cette page ouverte jusqu’à la confirmation.", selected:"Documents obligatoires sélectionnés" }, ar: { files:"المستندات التي استلمها الخادم", confirm:"جارٍ تأكيد الطلب والخصم من المحفظة…", notice:"أبقوا هذه الصفحة مفتوحة حتى التأكيد.", selected:"المستندات الإلزامية المحددة" } }[props.locale];
  const [clientError, setClientError] = useState("");
  const [catalogueRecovery, setCatalogueRecovery] = useState(false);
  const [sessionRecovery, setSessionRecovery] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);

  const country = useMemo(() => props.countries.find((c) => c.id === countryId) ?? null, [props.countries, countryId]);
  useEffect(()=>{if(countryId&&keyboardSelectionRef.current){keyboardSelectionRef.current=false;destinationChangeRef.current?.focus();}},[countryId]);
  const visa = useMemo(() => country?.visaTypes.find((v) => v.id === visaTypeId) ?? null, [country, visaTypeId]);
  const requirements = useMemo(() => (visaTypeId ? (props.requirementsByVisaType[visaTypeId] ?? []) : []), [props.requirementsByVisaType, visaTypeId]);

  const requiredDocs=requirements.filter(r=>r.required);
  const completedDocs=requiredDocs.filter(r=>(files[r.documentTypeId]??[]).length>0).length;
  const selectedRequirement=requirements.find(r=>r.documentTypeId===activeDoc)??requirements.find(r=>r.required&&!(files[r.documentTypeId]??[]).length)??requirements[0];
  const selectedFiles=selectedRequirement?files[selectedRequirement.documentTypeId]??[]:[];
  const selectedFile=selectedFiles[previewIndex]??selectedFiles[0];
  useEffect(()=>{if(!selectedFile){setPreviewUrl("");return;}const url=URL.createObjectURL(selectedFile);setPreviewUrl(url);return ()=>URL.revokeObjectURL(url);},[selectedFile]);
  function selectDoc(id:string){setActiveDoc(id);setPreviewIndex(0);setFileError("");}
  function clearForProgrammeChange(){if(Object.values(files).some(a=>a.length)&&!window.confirm(ui.changeWarning))return false;setFiles({});setActiveDoc("");setPreviewIndex(0);setFileError("");return true;}
  function changeProgramme(id:string){if(id===visaTypeId)return;if(!clearForProgrammeChange())return;setVisaTypeId(id);setDirty(true);}
  function editStep(n:number){if(submittingRef.current||pending||n>=step)return;setClientError("");setWizardDirection("back");setStep(n);}
  // All destinations with a bookable programme remain visible without typing.
  const availableDestinations = useMemo(() =>
    props.countries.filter((c) => c.visaTypes.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [props.countries],
  );

  const suggestions = useMemo(() => {
    const q = normalize(countrySearch);
    if (!q) return availableDestinations;
    return availableDestinations.filter((c) =>
      normalize(c.name).includes(q) ||
      c.visaTypes.some((v) => normalize(v.name).includes(q)),
    );
  }, [availableDestinations, countrySearch]);

  const popularDestinations = useMemo(() =>
    [...availableDestinations]
      .sort((a, b) => b.visaTypes.length - a.visaTypes.length || a.name.localeCompare(b.name))
      .slice(0, POPULAR_COUNT),
    [availableDestinations],
  );

  // An outside click closes the floating list without changing the selected destination.
  useEffect(() => {
    if (!destinationOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!destinationPickerRef.current?.contains(event.target as Node)) {
        setDestinationOpen(false);
        setActiveDestination(-1);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [destinationOpen]);

  useEffect(() => {
    if (!destinationOpen || activeDestination < 0) return;
    destinationListRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[activeDestination]
      ?.scrollIntoView({ block: "nearest" });
  }, [destinationOpen, activeDestination]);

  function chooseDestination(selected: WizardCountry, keyboard = false) {
    keyboardSelectionRef.current = keyboard;
    setCountryId(selected.id);
    setDirty(true);
    setCountrySearch("");
    setActiveDestination(-1);
    setDestinationOpen(false);
    setVisaTypeId(selected.visaTypes.length===1 ? selected.visaTypes[0]!.id : "");
  }

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
      if (!visa) {
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

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    stepHeadingRef.current?.focus({preventScroll:true});
    stepHeadingRef.current?.scrollIntoView({block:"start",behavior:"instant"});
  }, [step]);

  useEffect(() => {
    if (!clientError || pending) return;
    feedbackRef.current?.focus({preventScroll:true});
    feedbackRef.current?.scrollIntoView({block:"nearest",behavior:"instant"});
  }, [clientError,pending]);

  function goNext() {
    if (submittingRef.current || !validateStep(step)) return;
    setDirty(true);
    setWizardDirection("forward");
    setStep(Math.min(3, step + 1));
  }

  function goBack() {
    if (submittingRef.current) return;
    setClientError("");
    setWizardDirection("back");
    setStep((s) => Math.max(1, s - 1));
  }

  function onFileChange(documentTypeId: string, list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    if(!incoming.length)return;
    const invalid=incoming.find(f=>!(/\.(pdf|jpe?g|png|webp|docx?)$/i.test(f.name))||f.size===0);
    if(invalid){setFileError(ui.invalid+" ("+invalid.name+")");return;}
    const signature=(f:File)=>f.name+"|"+f.size+"|"+f.lastModified;
    if(new Set(incoming.map(signature)).size!==incoming.length||incoming.some(f=>Object.entries(files).some(([id,arr])=>id!==documentTypeId&&arr.some(other=>signature(other)===signature(f))))){setFileError(ui.duplicate);return;}
    const tooBig = incoming.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setFileError(`${t.fileTooLarge} (${tooBig.name})`);
      return;
    }
    setFileError("");
    setDirty(true);
    setFiles((prev) => ({ ...prev, [documentTypeId]: incoming }));
    setPreviewIndex(0);
  }

  function removeFile(documentTypeId: string, index: number) {
    setFiles((prev) => ({ ...prev, [documentTypeId]: (prev[documentTypeId] ?? []).filter((_, i) => i !== index) }));
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


  async function submit(form: HTMLFormElement) {
    if (step !== 3 || submittingRef.current || !canAfford || catalogueRecovery || sessionRecovery || !validateStep(1) || !validateStep(2)) return;
    submittingRef.current = true;
    setPending(true);
    const fields = new FormData(form);
    const total = requirements.reduce((sum,r)=>sum+(files[r.documentTypeId]??[]).length,0);
    let received = 0;
    setTransfer({done:0,total,phase:total?"files":"confirm"});
    try {
      const tokens: string[] = [];
      // Each file travels in its own bounded request. Only final confirmation
      // starts uploading; navigating away from earlier steps persists nothing.
      for (const requirement of requirements) {
        const selected = files[requirement.documentTypeId] ?? [];
        for (let slot = 0; slot < selected.length; slot++) {
          const body = new FormData();
          body.set("attempt", idempotencyKey); body.set("visaTypeId", visaTypeId);
          body.set("documentTypeId", requirement.documentTypeId); body.set("slot", String(slot)); body.set("file", selected[slot]!);
          const response = await fetch("/api/agency/requests", { method: "POST", body });
          const data = await readRequestResponse<{token:string}>(response,props.locale);
          tokens.push(data.token);
          received += 1;
          setTransfer({done:received,total,phase:"files"});
        }
      }
      setTransfer({done:received,total,phase:"confirm"});
      const response = await fetch("/api/agency/requests", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempt: idempotencyKey, countryId, visaTypeId, tokens,
          fullName: String(fields.get("t0_fullName") ?? ""), nationality: String(fields.get("t0_nationality") ?? ""), notes: String(fields.get("agencyNotes") ?? "") }) });
      const data = await readRequestResponse<{applicationId:string}>(response,props.locale);
      leavingAfterSuccess.current = true;
      window.location.assign(`/portal/applications/${data.applicationId}?submitted=1`);
    } catch (error) {
      const feedback=requestFailureFeedback(error,props.locale);
      setClientError(feedback.message);
      setCatalogueRecovery(feedback.catalogue);
      setSessionRecovery(feedback.session);
      submittingRef.current = false;
      setTransfer(null);
      setPending(false);
    }
  }

  return (
    <form ref={formRef} className="agency-v2-wizard booking-experience" onChange={()=>setDirty(true)} onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {countryId ? <input type="hidden" name="countryId" value={countryId} /> : null}
      <input type="hidden" name="locale" value={props.locale} />

      <style>{bookingCss}</style>
      <ol ref={stepHeadingRef} tabIndex={-1} className="booking-rail" data-testid="wizard-steps">
        {[ui.travel,ui.documents,ui.confirm].map((label,i)=>(
          <li key={label} aria-current={step===i+1?"step":undefined} data-state={step===i+1?"active":step>i+1?"complete":"pending"}>
            <button type="button" disabled={step<=i+1||pending} onClick={()=>editStep(i+1)}>
              <span className="booking-marker">{step>i+1?"✓":step===i+1?<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 10 21 3l-7 18-4-7-7-4Zm7 4L21 3"/></svg>:i+1}</span>
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {props.serverError ? (
        <p className="form-feedback rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-base text-rose-700">{props.serverError}</p>
      ) : null}
      {clientError ? (
        <div ref={feedbackRef} tabIndex={-1} role="alert" className="form-feedback rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-base text-rose-700"><p>{clientError}</p>{catalogueRecovery ? <button type="button" className="btn-secondary mt-4" onClick={() => window.location.reload()}>{contentT(props.locale)("Refresh catalogue and choose again")}</button> : null}{sessionRecovery ? <a className="btn-secondary mt-4" href="/login?reason=session-expired">{contentT(props.locale)("Sign in")}</a> : null}</div>
      ) : null}

      {/* STEP 1 — destination search, then programmes, then applicant */}
      <section data-wizard-section="1" hidden={step !== 1} className="wizard-panel booking-grid" data-direction={wizardDirection}>
        <div className="booking-main"><div className="booking-destination relative z-10 space-y-4">
          <div>
            <h2 className="font-serif text-lg text-navy-900">{t.destinationQuestion}</h2>

          </div>

          {country ? (
            <div className="booking-selected-country">
              <p className="text-base">
                <span className="text-slate-500">{t.destination}: </span>
                <span className="font-semibold text-navy-900" data-testid="wizard-destination-selected">
                  {country.name}
                </span>
              </p>
              <button
                type="button"
                className="btn-secondary btn-sm"
                ref={destinationChangeRef}
                onClick={() => {
                  if(!clearForProgrammeChange())return;
                  setCountryId("");
                  setVisaTypeId("");
                }}
              >
                {t.change}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                ref={destinationPickerRef}
                className="relative z-30 w-full"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setDestinationOpen(false);
                    setActiveDestination(-1);
                  }
                }}
              >
                <label className="label sr-only" htmlFor="destination-search">{t.searchDestination}</label>
                <input
                  id="destination-search"
                  type="search"
                  role="combobox"
                  aria-haspopup="listbox"
                  aria-expanded={destinationOpen}
                  aria-controls="destination-suggestions"
                  aria-autocomplete="list"
                  aria-activedescendant={destinationOpen && suggestions[activeDestination] ? `destination-${suggestions[activeDestination]!.id}` : undefined}
                  autoComplete="off"
                  className="input pe-12"
                  placeholder={t.searchDestination}
                  value={countrySearch}
                  data-testid="wizard-destination-search"
                  onFocus={() => setDestinationOpen(true)}
                  onClick={() => setDestinationOpen(true)}
                  onChange={(event) => {
                    setCountrySearch(event.target.value);
                    setActiveDestination(-1);
                    setDestinationOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      setDestinationOpen(true);
                      setActiveDestination((index) => suggestions.length
                        ? event.key === "ArrowDown"
                          ? (index + 1) % suggestions.length
                          : (index <= 0 ? suggestions.length - 1 : index - 1)
                        : -1);
                    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      if (!destinationOpen) setDestinationOpen(true);
                      else {
                        const selected = suggestions[activeDestination >= 0 ? activeDestination : 0];
                        if (selected) chooseDestination(selected, true);
                      }
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setDestinationOpen(false);
                      setCountrySearch("");
                      setActiveDestination(-1);
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label={t.searchDestination}
                  aria-expanded={destinationOpen}
                  aria-controls="destination-suggestions"
                  className="absolute end-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:text-navy-900"
                  onClick={() => {
                    setDestinationOpen((open) => !open);
                    setActiveDestination(-1);
                  }}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={`h-4 w-4 transition-transform ${destinationOpen ? "rotate-180" : ""}`}>
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {destinationOpen ? (
                  <div
                    id="destination-suggestions"
                    role="listbox"
                    aria-label={t.searchDestination}
                    data-testid="wizard-destination-popover"
                    className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                  >
                    <div ref={destinationListRef} className="max-h-52 overflow-y-auto overscroll-contain py-1" data-testid="wizard-all-destinations">
                      {suggestions.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-slate-500">{t.noDestinationMatch}</p>
                      ) : (
                        suggestions.map((c, index) => (
                          <a
                            key={c.id}
                            id={`destination-${c.id}`}
                            role="option"
                            aria-selected={activeDestination === index}
                            href={`?destination=${c.id}`}
                            data-testid="wizard-destination-option"
                            data-country-id={c.id}
                            onClick={(event) => {
                              event.preventDefault();
                              chooseDestination(c, event.detail === 0);
                            }}
                            className={`flex min-h-9 items-center px-4 py-2 text-base font-normal text-navy-900 hover:bg-slate-50 ${activeDestination === index ? "bg-slate-50" : ""}`}
                          >
                            {c.name}
                          </a>
                        ))
                      )}
                    </div>
                    <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                      {t.destinationsAvailable.replace("{count}", String(suggestions.length))}
                    </p>
                  </div>
                ) : null}
              </div>

              {!countrySearch && popularDestinations.length > 0 ? (
                <div data-testid="wizard-popular-destinations">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {ui.suggestions}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {popularDestinations.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        data-testid="wizard-popular-destination"
                        className="wizard-choice inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-base font-semibold text-navy-900 hover:bg-ivory-50"
                        onClick={(event) => chooseDestination(c, event.detail === 0)}
                      >
                        {c.name}

                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Programmes for the chosen destination only */}
          {country && country.visaTypes.length>1 ? (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <h3 className="text-base font-semibold text-navy-900">
                {t.availableProgrammes}
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {country.visaTypes.map((v) => (
                  <label
                    key={v.id}
                    data-testid="wizard-visa-type"
                    className={`wizard-choice cursor-pointer rounded-lg border p-4 ${visaTypeId === v.id ? "border-gold-500 bg-gold-50/60 shadow-[inset_0_0_0_1px_rgb(201_154_50/0.12)]" : "border-slate-200"}`}
                  >
                    <input
                      type="radio"
                      name="visaTypeId"
                      value={v.id}
                      data-country-id={v.countryId}
                      className="sr-only"
                      checked={visaTypeId === v.id}
                      onChange={() => changeProgramme(v.id)}
                    />
                    <span className="block font-semibold text-navy-900">{v.name}</span>
                    <span className="mt-1 block text-xs text-slate-500">{v.categoryName}</span>
                    <span className="mt-2 block text-base font-semibold text-navy-800 tabular-nums">
                      {formatDZD(v.fee)} <span className="text-xs text-slate-400">· {t.processing} {processingLabel(v)}</span>
                    </span>
                    {v.description ? <span className="mt-1 block text-xs text-slate-500">{v.description}</span> : null}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Applicant — one traveler, minimal data (§12) */}
        <div className="booking-traveller space-y-4">
          <h2>{t.applicant}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="t0_fullName">{t.fullName} *</label>
              <input
                id="t0_fullName"
                name="t0_fullName"
                required
                autoComplete="name"
                className="input"
                data-testid="wizard-full-name"
                value={nameDraft} onChange={e=>setNameDraft(e.target.value)}
                placeholder={t.fullNamePlaceholder}
              />
            </div>
            <div>
              <label className="label" htmlFor="t0_nationality">{t.nationality} *</label>
              <select
                id="t0_nationality"
                name="t0_nationality"
                required
                value={nationalityDraft} onChange={e=>setNationalityDraft(e.target.value)}
                className="input"
                data-testid="wizard-nationality"
                aria-label={t.nationality}
              >
                {props.nationalities.map((n) => (
                  <option key={n.code} value={n.code}>{n.label}</option>
                ))}
              </select>
            </div>
          </div>
          <details className="booking-notes"><summary>{ui.notes}</summary><label className="label sr-only" htmlFor="agencyNotes">{t.notes}</label><textarea id="agencyNotes" name="agencyNotes" rows={2} className="input mt-3" placeholder={t.notesPlaceholder} /></details>
        </div>
        </div>
        <aside className="booking-side">
          <h2>{ui.reservation}</h2>
          {visa?<><div className="booking-product"><small>{country?.name}</small><h3>{visa.name}</h3><span>{visa.categoryName} · {processingLabel(visa)}</span>{visa.description?<p>{visa.description}</p>:null}<strong className="booking-price"><bdi>{formatDZD(visa.fee)}</bdi></strong></div>
          <div className="booking-rule"><h3>{t.summaryDocuments}</h3>{requirements.length?requirements.map(r=><p className="booking-line" key={r.documentTypeId}><span>{r.name}</span><small>{r.required?t.required:ui.optional}</small></p>):<p>{t.noDocumentsRequired}</p>}</div>
          <div className="booking-rule"><p className="booking-line"><span>{t.walletBalance}</span><strong><bdi>{formatDZD(props.walletBalance)}</bdi></strong></p>{canAfford?<><p className="booking-line"><span>{ui.estimate}</span><strong><bdi>{formatDZD(afterNum)}</bdi></strong></p><p className="booking-success">✓ {ui.covered}</p></>:<><p className="booking-warning">{ui.missing}: <bdi>{formatDZD(missing)}</bdi></p><a href={topupHref} className="btn-secondary">{t.requestTopup}</a></>}</div></>:<p className="booking-empty">{ui.select}</p>}
          <small>{ui.noDebit}</small>
        </aside>
      </section>

      {/* STEP 2 — document workspace */}
      <section data-wizard-section="2" hidden={step!==2} className="wizard-panel booking-docs" data-direction={wizardDirection}>
        <div className="booking-doc-head"><div><h2>{t.documents}</h2><small>{country?.name} · {visa?.name} · <bdi>{visa?formatDZD(visa.fee):"—"}</bdi></small></div><div className="booking-doc-progress" role="status"><strong>{completedDocs}/{requiredDocs.length}</strong> <span>{progressCopy.selected}</span>{requiredDocs.length>0?<progress value={completedDocs} max={requiredDocs.length} aria-label={progressCopy.selected}/>:null}</div></div>
        {fileError?<p role="alert" className="booking-warning" data-testid="wizard-file-error">{fileError}</p>:null}
        {requirements.length===0?<p>{t.noDocumentsRequired}</p>:<div className="booking-doc-grid">
          <div className="booking-doc-list" role="group" aria-label={t.summaryDocuments}>
            {requirements.map(r=><button type="button" key={r.documentTypeId} className="booking-doc-row" aria-pressed={selectedRequirement?.documentTypeId===r.documentTypeId} onClick={()=>selectDoc(r.documentTypeId)}><span className="booking-doc-icon" aria-hidden>▤</span><span><strong>{r.name}</strong><small>{r.required?t.required:ui.optional}</small></span><span className={(files[r.documentTypeId]??[]).length?"booking-success":"booking-muted"}>{(files[r.documentTypeId]??[]).length?"✓ "+t.uploaded:ui.empty}</span></button>)}
          </div>
          {selectedRequirement?<div className="booking-doc-panel">
            <div className="booking-doc-head"><h3>{selectedRequirement.name}</h3>{selectedFiles.length?<span className="booking-success">✓ {ui.selected}</span>:null}</div>
            {selectedRequirement.notes?<p className="booking-muted">{selectedRequirement.notes}</p>:null}
            <label className={selectedFiles.length?"booking-file-replace":"booking-drop"} data-dragging={dragging} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);onFileChange(selectedRequirement.documentTypeId,e.dataTransfer.files)}}>
              {!selectedFiles.length?<><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></svg><strong>{ui.drop}</strong></>:null}
              <span className={selectedFiles.length?"btn-secondary":"btn-primary"}>{selectedFiles.length?ui.replace:ui.browse}</span>
              <input key={selectedRequirement.documentTypeId} type="file" name={`file_${selectedRequirement.documentTypeId}`} aria-label={`${t.chooseFile}: ${selectedRequirement.name}`} multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="sr-only" data-required={selectedRequirement.required?"1":"0"} onChange={e=>{onFileChange(selectedRequirement.documentTypeId,e.currentTarget.files);e.currentTarget.value=""}}/>
              {!selectedFiles.length?<small>{t.uploadHint}</small>:null}
            </label>
            {selectedFiles.length?<><div className="booking-files">{selectedFiles.map((f,i)=><div key={i} className="booking-line"><button type="button" className="booking-file-name" aria-pressed={i===previewIndex} onClick={()=>setPreviewIndex(i)}>{f.name} <small>{Math.ceil(f.size/1024)} KB</small></button><button type="button" className="booking-link" onClick={()=>{removeFile(selectedRequirement.documentTypeId,i);setPreviewIndex(0)}}>{t.remove}</button></div>)}</div>
            {selectedFile&&previewUrl?<div className="booking-preview">{/^image\/(jpeg|png|webp)$/.test(selectedFile.type)?<img src={previewUrl} alt={selectedFile.name}/>:selectedFile.type==="application/pdf"?<iframe title={selectedFile.name} src={previewUrl}/>:<p>{ui.unavailable}</p>}</div>:null}</>:null}
            <div className="booking-line"><small>{ui.local}</small>{requirements.some(r=>r.documentTypeId!==selectedRequirement.documentTypeId&&r.required&&!(files[r.documentTypeId]??[]).length)?<button type="button" className="btn-secondary" onClick={()=>{const next=requirements.find(r=>r.documentTypeId!==selectedRequirement.documentTypeId&&r.required&&!(files[r.documentTypeId]??[]).length);if(next)selectDoc(next.documentTypeId)}}>{ui.nextDoc} →</button>:null}</div>
          </div>:null}
        </div>}
      </section>

      {/* STEP 3 — review & submit */}
      <section data-wizard-section="3" hidden={step!==3} className="wizard-panel booking-grid" data-direction={wizardDirection}>
        <div className="booking-main booking-review">
          <h2>{ui.check}</h2>
          <div className="booking-rule"><div className="booking-line"><h3>{t.sectionVisa}</h3><button type="button" className="booking-link" disabled={pending} onClick={()=>editStep(1)}>{ui.edit}</button></div><h3>{country?.name} · {visa?.name}</h3><p className="booking-muted">{visa?processingLabel(visa):"—"}</p></div>
          <div className="booking-rule"><div className="booking-line"><h3>{t.sectionApplicant}</h3><button type="button" className="booking-link" disabled={pending} onClick={()=>editStep(1)}>{ui.edit}</button></div><p data-testid="wizard-applicant-summary">{nameDraft||"—"} · {props.nationalities.find(n=>n.code===nationalityDraft)?.label??nationalityDraft}</p></div>
          <div className="booking-rule"><div className="booking-line"><h3>{t.summaryDocuments}</h3><button type="button" className="booking-link" disabled={pending} onClick={()=>editStep(2)}>{ui.edit}</button></div>{requirements.map(r=><div className="booking-line" key={r.documentTypeId}><span>{r.name}</span><button type="button" disabled={pending} className="booking-link" onClick={()=>{selectDoc(r.documentTypeId);editStep(2)}}>{(files[r.documentTypeId]??[]).length?ui.preview:r.required?t.missingPrefix:ui.optional} →</button></div>)}</div>
        </div>
        <aside className="booking-side">
          <h2>{ui.payment}</h2><div className="booking-product"><small>{t.requiredAmount}</small><strong className="booking-price"><bdi>{visa?formatDZD(visa.fee):"—"}</bdi></strong></div>
          <div className="booking-rule"><p className="booking-line"><span>{t.currentBalance}</span><strong><bdi>{formatDZD(props.walletBalance)}</bdi></strong></p><p className="booking-line"><span>{t.fee}</span><strong><bdi>{formatDZD(feeNumber)}</bdi></strong></p><p className="booking-line"><span>{t.balanceAfter}</span><strong className={canAfford?"booking-success":"booking-warning"}><bdi>{canAfford?formatDZD(afterNum):"—"}</bdi></strong></p></div>
          <p className="booking-muted">{t.chargeNote}</p>
          {pending&&transfer?<div className="agency-v2-submit-progress" role="status" aria-live="polite"><strong>{transfer.phase==="files"?`${progressCopy.files}: ${transfer.done} / ${transfer.total}`:progressCopy.confirm}</strong>{transfer.phase==="files"&&transfer.total>0?<progress aria-label={progressCopy.files} value={transfer.done} max={transfer.total}/>:null}<p>{progressCopy.notice}</p></div>:null}
          {canAfford?<button type="submit" className="btn-primary w-full" disabled={pending||catalogueRecovery||sessionRecovery} data-testid="wizard-submit">{pending?t.submitting:<>{t.submitApplication} — <bdi>{visa?formatDZD(visa.fee):"—"}</bdi></>}</button>:<><p className="booking-warning">{t.insufficientTitle} · <bdi>{formatDZD(missing)}</bdi></p><a href={topupHref} className="btn-primary" data-testid="wizard-topup-cta">{t.requestTopup}</a></>}
        </aside>
      </section>


      <div className="booking-footer" data-step={step}>
        <button type="button" onClick={goBack} hidden={step===1} disabled={step === 1 || pending} className="btn-secondary">
          <span className="directional" aria-hidden>←</span> {t.back}
        </button>
        <small>{ui.noDebit}</small>
        {step < 3 ? (
          <button type="button" onClick={goNext} className="btn-primary">
            {step===1?ui.continue:ui.review} <span className="directional" aria-hidden>→</span>
          </button>
        ) : null}
      </div>
    </form>
  );
}

const bookingCss = "/* ESSAFARIA Dashboard 04 — only /portal. Typography and surface tokens have one source. */\n.workspace-agency.workspace-agency:has(.booking-experience){\n --agency-paper:#fff;--agency-ink:#0b1c30;--agency-muted:#344457;--agency-rule:#e2e5e9;--agency-hover:#f5f7fa;\n background:#fff;color:#0b1c30;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",Arial,sans-serif;\n}\nhtml[lang=\"ar\"] .workspace-agency.workspace-agency:has(.booking-experience){font-family:\"Plex Arabic\",Barlow,Arial,sans-serif}\n.workspace-agency.workspace-agency:has(.booking-experience) #workspace-main{background:#fff;padding-block-start:24px}\n.workspace-agency.workspace-agency:has(.booking-experience) .workspace-header-context{display:none}\n.workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation a[href=\"/portal/notifications\"] .badge{display:none}\n.workspace-agency.workspace-agency:has(.booking-experience) .agency-header-brand small{font-size:15px;letter-spacing:normal}\n.workspace-agency.workspace-agency:has(.booking-experience) .workspace-topbar button,.workspace-agency.workspace-agency:has(.booking-experience) .workspace-topbar summary{font-family:inherit}\n.workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation .workspace-nav-link{font-size:16px;font-weight:500}\n.workspace-agency.workspace-agency:has(.booking-experience) :is(.workspace-topbar,.agency-desktop-navigation) :is(a,button,summary):focus-visible{outline:2px solid #304b64;outline-offset:3px}\n@media(min-width:1280px){\n .workspace-agency.workspace-agency:has(.booking-experience) .workspace-topbar{flex-shrink:0}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation{position:sticky;top:64px;z-index:29;flex-shrink:0;background:white}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation a:is([href=\"/portal/notifications\"],[href=\"/portal/profile\"]){display:none}\n}\n@media(min-width:1600px){\n .workspace-agency.workspace-agency:has(.booking-experience) .workspace-topbar{height:68px;padding-inline:24px}\n .workspace-agency.workspace-agency:has(.booking-experience) .workspace-topbar > div:last-child > span.hidden{display:none}\n .workspace-agency.workspace-agency:has(.booking-experience) .account-menu-identity{display:none}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation{top:0;z-index:31;align-self:center;width:calc(100% - 480px);min-height:68px;height:68px;margin-block-start:-68px;padding:0;gap:8px;justify-content:center;border:0;background:transparent}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation .workspace-nav-link{padding:8px 12px;min-height:44px;white-space:nowrap;border-radius:6px}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation .workspace-nav-link:not([href=\"/portal/applications/new\"]) .workspace-nav-icon{display:none}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation .workspace-nav-link[aria-current]:not([href=\"/portal/applications/new\"]){background:transparent;box-shadow:inset 0 -2px #0b1c30;border-radius:0;color:#0b1c30;font-weight:600}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation .workspace-nav-link:hover:not([href=\"/portal/applications/new\"]){background:#f5f7fa}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation a[href=\"/portal/applications/new\"]{margin-inline:6px}\n}\n\n.workspace-agency.workspace-agency:has(.booking-experience){--agency-muted:#647182}\n.workspace-agency:has(.booking-experience) #workspace-main{max-width:1700px;width:100%;padding-inline:clamp(20px,4vw,64px)}\n.workspace-agency:has(.booking-experience) #workspace-main .page-header{margin-block-end:12px}\n.workspace-agency:has(.booking-experience) #workspace-main .page-header-subtitle{display:none}\n.workspace-agency #workspace-main .booking-experience{color:#0b1c30;font-size:16px;line-height:1.5;display:grid;gap:20px;font-family:inherit}\n.workspace-agency #workspace-main .booking-experience :is(h1,h2,h3,button,input,select,textarea){font-family:inherit}\n.workspace-agency #workspace-main .booking-experience h2{font-size:22px;font-weight:600;letter-spacing:-.018em}\n.workspace-agency #workspace-main .booking-experience h3{font-size:17px;font-weight:600}\n.workspace-agency #workspace-main .booking-experience small,.booking-muted{font-size:15px;color:#647182}\n.workspace-agency #workspace-main .booking-experience :is(.input,.btn-primary,.btn-secondary){border-radius:7px;font-weight:500}\n.booking-experience [hidden]{display:none!important}\n.booking-rail{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding-block:5px 12px;border-bottom:1px solid #e2e5e9;gap:12px}\n.booking-rail li{position:relative;min-width:0}\n.booking-rail li:not(:last-child):after{content:\"\";position:absolute;inset-inline-start:42px;inset-inline-end:8px;top:18px;border-top:1px dashed #b8c6d4;z-index:0}\n.booking-rail li[data-state=complete]:after{border-top:1px solid #6b899f}\n.booking-rail button{display:flex;flex-direction:column;align-items:start;gap:7px;position:relative;z-index:1;text-align:start;font-size:15px;color:#647182;min-height:58px}\n.booking-rail li[data-state=active] button{color:#0b1c30;font-weight:600}\n.booking-rail li[data-state=complete] button{color:#0b1c30;cursor:pointer}\n.booking-marker{width:36px;height:36px;display:grid;place-items:center;border:1px solid #c7d1db;border-radius:50%;background:white;color:#647182;font-size:15px}\n.booking-rail li[data-state=active] .booking-marker{background:#0b1c30;color:white;box-shadow:0 0 0 4px #e6edf3;border-color:#0b1c30}\n.booking-rail li[data-state=complete] .booking-marker{color:#23685c;border-color:#8cb4a8}\n.booking-grid:not([hidden]){display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,1fr);gap:clamp(24px,4vw,64px);align-items:start}\n.booking-main,.booking-side{display:grid;gap:18px;min-width:0}\n.booking-side{border-inline-start:1px solid #e2e5e9;padding-inline-start:clamp(20px,3vw,44px)}\n.booking-traveller{border-top:1px solid #e2e5e9;padding-top:20px}\n.booking-selected-country{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #e2e5e9;padding-block:10px}\n.booking-notes summary{cursor:pointer;color:#647182;min-height:44px;display:list-item;padding-block:10px}\n.booking-product{display:grid;gap:5px}\n.booking-product h3{font-size:24px!important;line-height:1.25}\n.booking-price{font-size:34px;line-height:1.2;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.025em;margin-top:8px}\n.booking-rule{border-top:1px solid #e2e5e9;padding-top:12px;display:grid;gap:8px}\n.booking-line{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:30px}\n.booking-line strong{font-weight:600;text-align:end;font-variant-numeric:tabular-nums}\n.booking-success{color:#21684f;font-size:15px}\n.booking-warning{color:#934516;font-size:15px}\n.booking-empty{color:#647182;padding-block:14px}\n.booking-doc-head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}\n.booking-doc-progress{display:flex;align-items:center;gap:8px;color:#647182;font-size:15px}\n.booking-doc-progress strong{font-size:22px;color:#0b1c30;font-weight:600}\n.booking-doc-progress progress{width:90px;height:5px;accent-color:#23685c}\n.booking-doc-grid{display:grid;grid-template-columns:minmax(260px, .75fr) minmax(0,1.25fr);gap:24px;border-top:1px solid #e2e5e9;margin-top:14px}\n.booking-doc-list{padding-block:8px;min-width:0}\n.booking-doc-row{width:100%;display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;text-align:start;gap:12px;min-height:64px;padding:10px 12px;border-bottom:1px solid #e2e5e9;transition:background 160ms ease;border-radius:5px}\n.booking-doc-row[aria-pressed=true]{background:#edf2f6;box-shadow:inset 3px 0 #0b1c30}\n[dir=rtl] .booking-doc-row[aria-pressed=true]{box-shadow:inset -3px 0 #0b1c30}\n.booking-doc-row:hover{background:#f5f7fa}\n.booking-doc-row strong,.booking-doc-row small{display:block;font-weight:500}\n.booking-doc-icon{color:#647182;font-size:20px}\n.booking-doc-panel{display:grid;gap:14px;align-content:start;padding:16px 0 0 24px;border-inline-start:1px solid #e2e5e9;min-width:0}\n[dir=rtl] .booking-doc-panel{padding:16px 24px 0 0}\n.booking-drop{display:grid;justify-items:center;align-content:center;gap:10px;min-height:218px;border:1px dashed #aab8c7;border-radius:12px;text-align:center;padding:18px;cursor:pointer;transition:background 160ms ease,border-color 160ms ease}\n.booking-drop:hover,.booking-drop[data-dragging=true]{background:#f5f8fb;border-color:#0b1c30}\n.booking-drop:focus-within,.booking-file-replace:focus-within{outline:2px solid #0b1c30;outline-offset:3px}\n.booking-file-replace{justify-self:start;cursor:pointer}\n.booking-preview{display:grid;place-items:center;background:#f6f7f9;border-radius:7px;min-height:150px;overflow:hidden}\n.booking-preview img{max-width:100%;height:clamp(160px,25vh,310px);object-fit:contain}\n.booking-preview iframe{width:100%;height:clamp(220px,33vh,390px);border:0}\n.booking-preview p{padding:18px;color:#647182}\n.booking-files{display:grid;gap:4px}\n.booking-file-name{text-align:start;overflow-wrap:anywhere;min-width:0}\n.booking-file-name[aria-pressed=true]{font-weight:600}\n.booking-link{color:#285582;min-height:44px;padding-inline:6px;text-decoration:underline;text-underline-offset:3px}\n.booking-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-block:12px;border-top:1px solid #e2e5e9}\n.booking-footer>button:last-child{margin-inline-start:auto}\n.workspace-agency #workspace-main .booking-experience .wizard-choice{font-weight:500;border-radius:6px}\n.workspace-agency #workspace-main .booking-experience .wizard-panel:not([hidden]){animation:booking-enter 200ms cubic-bezier(.2,.7,.2,1) both}\n@keyframes booking-enter{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}\n@media(max-width:850px){.booking-grid:not([hidden]),.booking-doc-grid{grid-template-columns:1fr;gap:16px}.booking-side,.booking-doc-panel,[dir=rtl] .booking-doc-panel{border-inline-start:0;padding-inline:0;border-top:1px solid #e2e5e9;padding-top:16px}.booking-doc-row{min-height:56px}.booking-rail button{font-size:14px}.booking-footer{position:static}}\n@media(prefers-reduced-motion:reduce){.workspace-agency #workspace-main .booking-experience .wizard-panel:not([hidden]){animation:none}.booking-doc-row,.booking-drop{transition:none}}\n";
