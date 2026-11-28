"use client";
import { CountryFlag } from "@/components/country-flag";
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
import { assessTravelDeadline,algeriaToday } from "@/lib/travel-deadline";
import { operationalCopy } from "@/lib/operational-copy";
import { TravelDeparture,TravelTiming } from "./travel-departure";
import { PassportValidity,PassportValiditySummary,GuardSummary,guardCopy,useDocumentGuard } from "./document-studio";
import {expiryAssessment,guardTechnical} from "@/lib/document-intelligence";
import { runBoundedUploads } from "@/lib/bounded-upload";
import { stagingReceiptKey,reusableStagingToken,type StagedReceipt } from "@/lib/request-upload-retry";
import { contentT } from "@/lib/i18n-content";
import { formatDZD, formatProcessingDays } from "@/lib/format";
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
  iso?: string | null;
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
  documentIntelligence?:boolean;
  catalogueFingerprints?: Record<string,string>;
  today?:string;
  parallelStaging?: boolean;
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
  const [programmeSearch,setProgrammeSearch]=useState("");
  const [nationalitySearch,setNationalitySearch]=useState("");
  const [nationalityOpen,setNationalityOpen]=useState(false);
  const nationalityRef=useRef<HTMLDivElement>(null);
  const nationalityTriggerRef=useRef<HTMLButtonElement>(null);
  const nationalitySearchRef=useRef<HTMLInputElement>(null);
  const [nationalityMenu,setNationalityMenu]=useState({above:false,listHeight:240});
  useAgencyPopover(nationalityRef,nationalityOpen,setNationalityOpen,nationalityTriggerRef);
  useEffect(()=>{
    if(!nationalityOpen)return;
    const measure=()=>{
      const trigger=nationalityTriggerRef.current;
      if(!trigger)return;
      const rect=trigger.getBoundingClientRect();
      const viewport=window.visualViewport;
      const top=viewport?.offsetTop??0;
      const bottom=top+(viewport?.height??window.innerHeight);
      const headerBottom=document.querySelector(".workspace-topbar")?.getBoundingClientRect().bottom??top;
      const below=bottom-rect.bottom-12;
      const above=rect.top-Math.max(top,headerBottom)-12;
      const opensAbove=below<320&&above>below;
      const listHeight=Math.max(64,Math.min(240,Math.floor((opensAbove?above:below)-72)));
      setNationalityMenu(previous=>previous.above===opensAbove&&previous.listHeight===listHeight?previous:{above:opensAbove,listHeight});
    };
    const onScroll=(event:Event)=>{if(event.target instanceof Node&&nationalityRef.current?.contains(event.target))return;measure();};
    measure();
    nationalitySearchRef.current?.focus({preventScroll:true});
    window.addEventListener("resize",measure);
    window.addEventListener("scroll",onScroll,true);
    window.visualViewport?.addEventListener("resize",measure);
    window.visualViewport?.addEventListener("scroll",measure);
    return()=>{window.removeEventListener("resize",measure);window.removeEventListener("scroll",onScroll,true);window.visualViewport?.removeEventListener("resize",measure);window.visualViewport?.removeEventListener("scroll",measure);};
  },[nationalityOpen]);
  const [batch,setBatch]=useState<File[]>([]);
  const [zoom,setZoom]=useState(false);
  const [programmeCategory,setProgrammeCategory]=useState("");
  const [programmeSort,setProgrammeSort]=useState<"catalogue"|"price"|"time">("catalogue");
  const [reviewFile,setReviewFile]=useState<File|null>(null);
  const [reviewObject,setReviewObject]=useState<{file:File;url:string}|null>(null);
  const reviewUrl=reviewObject?.file===reviewFile?reviewObject?.url??"":"";
  const reviewDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(!reviewFile){setReviewObject(null);return;}const url=URL.createObjectURL(reviewFile);setReviewObject({file:reviewFile,url});setZoom(false);if(reviewDialog.current&&!reviewDialog.current.open)reviewDialog.current.showModal();return()=>URL.revokeObjectURL(url)},[reviewFile]);
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
  const [departure,setDeparture]=useState("");
  const [passportExpiry,setPassportExpiry]=useState("");
  const ops=operationalCopy[props.locale];
  const [nationalityDraft,setNationalityDraft]=useState(props.defaultNationality);
  // Controlled state is the single source of truth for the gate and the submitted payload.
  const applicantReady = Boolean(nameDraft.trim() && props.nationalities.some(n => n.code === nationalityDraft));
  const checkout = {
    fr:{heading:"Récapitulatif de votre demande",subtitle:"",selected:"pièces requises sélectionnées",selectedShort:"Sélectionné",check:"À vérifier",replace:"Remplacer",add:"Ajouter",previous:"Précédent",next:"Suivant",tourist:"Tourisme",destination:"Destination",missing:"Non sélectionné",attention:"Documents à vérifier",replaceAll:"Remplacer les fichiers",loading:"Chargement de l’aperçu…",portrait:"Cette image a des proportions proches d’une photo d’identité. Vérifiez qu’il s’agit bien du relevé bancaire.",format:"Le format déclaré et l’extension du fichier semblent différents. Vérifiez le fichier."},
    en:{heading:"Application summary",subtitle:"",selected:"required documents selected",selectedShort:"Selected",check:"Review",replace:"Replace",add:"Add",previous:"Previous",next:"Next",tourist:"Tourism",destination:"Destination",missing:"Not selected",attention:"Documents to review",replaceAll:"Replace files",loading:"Loading preview…",portrait:"This image has proportions similar to an identity photo. Check that it is the bank statement.",format:"The declared file format and extension appear different. Check the file."},
    ar:{heading:"ملخص الطلب",subtitle:"",selected:"وثائق إلزامية محددة",selectedShort:"محدد",check:"للمراجعة",replace:"استبدال",add:"إضافة",previous:"السابق",next:"التالي",tourist:"سياحة",destination:"الوجهة",missing:"غير محدد",attention:"وثائق للمراجعة",replaceAll:"استبدال الملفات",loading:"جارٍ تحميل المعاينة…",portrait:"أبعاد الصورة قريبة من أبعاد صورة الهوية. تحققوا من أنها كشف الحساب البنكي.",format:"يبدو أن نوع الملف وامتداده مختلفان. تحققوا من الملف."}
  }[props.locale];
  const ui = {
    fr:{title:"Nouvelle demande",reservation:"Votre demande",travel:"Voyage et voyageur",documents:"Documents",confirm:"Confirmation",suggestions:"Destinations suggérées",ready:"Prêt à vérifier",select:"Choisissez un programme",noDebit:"Aucun débit avant la confirmation.",estimate:"Solde estimé après confirmation",covered:"Votre solde couvre cette demande.",missing:"Montant manquant",drop:"Déposez votre document ici",browse:"Parcourir les fichiers",nextDoc:"Pièce suivante",review:"Vérifier le dossier",continue:"Préparer les documents",preview:"Aperçu",unavailable:"Aperçu indisponible pour ce format. Vérifiez le fichier sur votre appareil.",replace:"Changer de fichier",changeWarning:"Changer de programme supprimera les fichiers déjà sélectionnés. Continuer ?",invalid:"Format non accepté",duplicate:"Ce fichier est déjà sélectionné. Vérifiez la pièce choisie.",local:"Fichiers sur cet appareil jusqu’à la confirmation",empty:"À préparer",optional:"Facultatif",edit:"Modifier",download:"Ouvrir le fichier",payment:"Votre paiement",check:"Votre dossier est prêt à être vérifié",selected:"Pièce sélectionnée",working:"Délai indicatif",notes:"Instructions facultatives"},
    en:{title:"New application",reservation:"Your application",travel:"Trip and traveller",documents:"Documents",confirm:"Confirmation",suggestions:"Suggested destinations",ready:"Ready to review",select:"Choose a programme",noDebit:"No charge until confirmation.",estimate:"Estimated balance after confirmation",covered:"Your balance covers this application.",missing:"Amount missing",drop:"Drop your document here",browse:"Browse files",nextDoc:"Next document",review:"Review application",continue:"Prepare documents",preview:"Preview",unavailable:"Preview unavailable for this format. Check the file on your device.",replace:"Change file",changeWarning:"Changing the programme removes the selected files. Continue?",invalid:"Unsupported format",duplicate:"This file is already selected. Check the chosen document.",local:"Files stay on this device until confirmation",empty:"To prepare",optional:"Optional",edit:"Edit",download:"Open file",payment:"Your payment",check:"Your application is ready to review",selected:"Document selected",working:"Estimated processing time",notes:"Optional instructions"},
    ar:{title:"طلب جديد",reservation:"طلبكم",travel:"الرحلة والمسافر",documents:"الوثائق",confirm:"التأكيد",suggestions:"الوجهات المقترحة",ready:"جاهز للمراجعة",select:"اختاروا برنامجاً",noDebit:"لا خصم قبل التأكيد.",estimate:"الرصيد المتوقع بعد التأكيد",covered:"رصيدكم يغطي هذا الطلب.",missing:"المبلغ الناقص",drop:"أفلتوا الوثيقة هنا",browse:"تصفح الملفات",nextDoc:"الوثيقة التالية",review:"مراجعة الطلب",continue:"تحضير الوثائق",preview:"معاينة",unavailable:"المعاينة غير متاحة لهذا التنسيق. تحققوا من الملف على جهازكم.",replace:"تغيير الملف",changeWarning:"سيؤدي تغيير البرنامج إلى حذف الملفات المحددة. هل تريدون المتابعة؟",invalid:"تنسيق غير مدعوم",duplicate:"هذا الملف محدد مسبقاً. تحققوا من الوثيقة المختارة.",local:"تبقى الملفات على الجهاز حتى التأكيد",empty:"للتحضير",optional:"اختياري",edit:"تعديل",download:"فتح الملف",payment:"الدفع",check:"طلبكم جاهز للمراجعة",selected:"وثيقة محددة",working:"مدة المعالجة التقديرية",notes:"تعليمات اختيارية"}
  }[props.locale];
  const ux={
    fr:{search:"Rechercher un programme",all:"Toutes les catégories",catalogue:"Ordre du catalogue",price:"Prix croissant",time:"Délai le plus court",programmes:"programmes",noMatch:"Aucun programme ne correspond.",reset:"Effacer les filtres",start:"Choisissez votre destination",hint:"Comparez les programmes, délais et pièces nécessaires.",traveller:"Votre voyageur",full:"Agrandir",close:"Fermer",verify:"Vérifiez le type et le contenu de chaque pièce avant l’envoi.",wrong:"Le nom du fichier évoque un passeport. Vérifiez qu’il correspond à la pièce demandée.",local:"Les fichiers ne sont pas transmis avant la confirmation.",payment:"Montant à débiter"},
    en:{search:"Search programmes",all:"All categories",catalogue:"Catalogue order",price:"Lowest price",time:"Shortest processing time",programmes:"programmes",noMatch:"No matching programmes.",reset:"Clear filters",start:"Choose your destination",hint:"Compare programmes, processing times and required documents.",traveller:"Your traveller",full:"Enlarge",close:"Close",verify:"Check the type and contents of each document before submitting.",wrong:"The filename suggests a passport. Check that it matches the requested document.",local:"Files are not sent until confirmation.",payment:"Amount to charge"},
    ar:{search:"ابحثوا عن برنامج",all:"كل الفئات",catalogue:"ترتيب القائمة",price:"السعر الأقل",time:"أقصر مدة معالجة",programmes:"برامج",noMatch:"لا توجد برامج مطابقة.",reset:"مسح الفلاتر",start:"اختاروا وجهتكم",hint:"قارنوا البرامج والمدد والوثائق المطلوبة.",traveller:"المسافر",full:"تكبير",close:"إغلاق",verify:"تحققوا من نوع ومحتوى كل وثيقة قبل الإرسال.",wrong:"يشير اسم الملف إلى جواز سفر. تحققوا من مطابقته للوثيقة المطلوبة.",local:"لا ترسل الملفات قبل التأكيد.",payment:"المبلغ المراد خصمه"}
  }[props.locale];
  const assist={
    fr:{nationality:"Rechercher une nationalité",batch:"Ajouter plusieurs fichiers",batchHint:"Sélectionnez une pièce puis attribuez-lui le fichier correspondant.",assign:"Attribuer",unassigned:"Fichiers à attribuer",fit:"Ajuster",leave:"Quitter cette demande sans l’enregistrer ?",noNationality:"Aucun résultat.",ready:"Toutes les pièces obligatoires sont sélectionnées.",download:"Ouvrir le fichier"},
    en:{nationality:"Search nationality",batch:"Add multiple files",batchHint:"Select a requirement and assign the matching file.",assign:"Assign",unassigned:"Unassigned files",fit:"Fit",leave:"Leave this application without saving?",noNationality:"No results.",ready:"All required documents are selected.",download:"Open file"},
    ar:{nationality:"البحث عن الجنسية",batch:"إضافة عدة ملفات",batchHint:"اختاروا الوثيقة ثم خصصوا الملف المناسب.",assign:"تخصيص",unassigned:"ملفات غير مخصصة",fit:"ملاءمة",leave:"مغادرة الطلب دون حفظ؟",noNationality:"لا نتائج.",ready:"تم تحديد جميع الوثائق الإلزامية.",download:"فتح الملف"}
  }[props.locale];
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const smart = {
    fr:{mismatch:"Le nom du fichier suggère un autre type de document. Vérifiez son contenu.",identical:"Un fichier au contenu identique est associé à plusieurs pièces.",small:"Image de faible résolution : vérifiez sa lisibilité.",checks:"Points à vérifier avant l’envoi",inspect:"Vérifier cette pièce",ready:"Toutes les pièces requises sont sélectionnées",remaining:"Pièces obligatoires restantes",selected:"Sélectionné",programmeDocs:"pièces requises",noValidation:"Ces contrôles locaux ne valident ni le contenu ni l’authenticité du document."},
    en:{mismatch:"The filename suggests another document type. Check its contents.",identical:"An identical file is assigned to multiple requirements.",small:"Low-resolution image: check readability.",checks:"Items to check before submitting",inspect:"Review this document",ready:"All required documents are selected",remaining:"Required documents remaining",selected:"Selected",programmeDocs:"required documents",noValidation:"These local checks do not validate document contents or authenticity."},
    ar:{mismatch:"يشير اسم الملف إلى نوع آخر من الوثائق. تحققوا من محتواه.",identical:"تم تخصيص ملف مطابق لعدة وثائق.",small:"صورة منخفضة الدقة: تحققوا من وضوحها.",checks:"نقاط للتحقق قبل الإرسال",inspect:"مراجعة الوثيقة",ready:"تم تحديد جميع الوثائق المطلوبة",remaining:"الوثائق الإلزامية المتبقية",selected:"محدد",programmeDocs:"وثائق مطلوبة",noValidation:"لا تتحقق هذه الفحوص المحلية من محتوى الوثائق أو أصالتها."}
  }[props.locale];
  type LocalWarning="identical"|"small"|"portrait"|"format";
  const [localWarnings,setLocalWarnings]=useState<Record<string,LocalWarning[]>>({});
  useEffect(()=>{
    let active=true;
    setLocalWarnings({});
    if(props.documentIntelligence)return;
    const entries=Object.entries(files).flatMap(([id,list])=>list.map(file=>({id,file})));
    if(!entries.length)return;
    void (async()=>{
      const warnings:Record<string,LocalWarning[]>={};
      const add=(id:string,kind:LocalWarning)=>{const list=warnings[id]??(warnings[id]=[]);if(!list.includes(kind))list.push(kind)};
      const hashes=new Map<string,string>();
      for(const {id,file} of entries){
        if(!active)return;
        try{
          const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
          const key=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
          const prior=hashes.get(key);
          if(prior!==undefined&&prior!==id){add(prior,"identical");add(id,"identical")}else if(prior===undefined)hashes.set(key,id);
        }catch{/* Optional local check. */}
        const requirement=(props.requirementsByVisaType[visaTypeId]??[]).find(r=>r.documentTypeId===id);
        if(checkoutFormatMismatch(file))add(id,"format");
        if((file.type.startsWith("image/")||/\.(jpe?g|png|webp)$/i.test(file.name))&&typeof createImageBitmap==="function"){
          try{
            const bitmap=await createImageBitmap(file);
            try{
              if(Math.min(bitmap.width,bitmap.height)<250)add(id,"small");
              if(requirement&&checkoutBankRequirement(requirement)&&checkoutPortraitLike(bitmap.width,bitmap.height))add(id,"portrait");
            }finally{bitmap.close()}
          }catch{/* Unsupported image decoding: no claim about contents. */}
        }
      }
      if(active)setLocalWarnings(warnings);
    })();
    return()=>{active=false};
  },[files,props.requirementsByVisaType,visaTypeId,props.documentIntelligence]);
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
  useEffect(()=>{
    if(!dirty&&!pending)return;
    const guard=(e:MouseEvent)=>{if(leavingAfterSuccess.current||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const a=(e.target instanceof Element?e.target.closest("a[href]"):null) as HTMLAnchorElement|null;if(!a||a.target==="_blank"||a.download||a.origin!==location.origin||a.pathname===location.pathname)return;if(pending||!window.confirm(assist.leave)){e.preventDefault();e.stopPropagation();}};
    document.addEventListener("click",guard,true);return()=>document.removeEventListener("click",guard,true);
  },[dirty,pending,assist.leave]);
  const [transferItems,setTransferItems]=useState<Record<string,number>>({});
  const [transfer, setTransfer] = useState<{done:number;total:number;phase:"files"|"confirm"} | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLOListElement>(null);
  const previousStep = useRef(1);
  const progressCopy = { en: { files:"Documents received by the server", confirm:"Confirming the application and wallet charge…", notice:"Keep this page open until confirmation.", selected:"Required documents selected" }, fr: { files:"Documents reçus par le serveur", confirm:"Confirmation du dossier et du débit du portefeuille…", notice:"Gardez cette page ouverte jusqu’à la confirmation.", selected:"Documents obligatoires sélectionnés" }, ar: { files:"المستندات التي استلمها الخادم", confirm:"جارٍ تأكيد الطلب والخصم من المحفظة…", notice:"أبقوا هذه الصفحة مفتوحة حتى التأكيد.", selected:"المستندات الإلزامية المحددة" } }[props.locale];
  const [clientError, setClientError] = useState("");
  const [catalogueRecovery, setCatalogueRecovery] = useState(false);
  const [sessionRecovery, setSessionRecovery] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const stagingReceipts=useRef(new Map<string,StagedReceipt>());
  const formRef = useRef<HTMLFormElement>(null);

  const country = useMemo(() => props.countries.find((c) => c.id === countryId) ?? null, [props.countries, countryId]);
  useEffect(()=>{if(countryId&&keyboardSelectionRef.current){keyboardSelectionRef.current=false;destinationChangeRef.current?.focus();}},[countryId]);
  const visa = useMemo(() => country?.visaTypes.find((v) => v.id === visaTypeId) ?? null, [country, visaTypeId]);
  const categories=useMemo(()=>Array.from(new Set((country?.visaTypes??[]).map(v=>v.categoryName).filter(Boolean))),[country]);
  const visibleProgrammes=useMemo(()=>{
    const q=normalize(programmeSearch);
    const list=(country?.visaTypes??[]).filter(v=>(!programmeCategory||v.categoryName===programmeCategory)&&(!q||normalize([v.name,v.categoryName,v.description??"",v.fee].join(" ")).includes(q)));
    if(programmeSort==="price")list.sort((a,b)=>Number(a.fee)-Number(b.fee));
    if(programmeSort==="time")list.sort((a,b)=>(a.maxDays>0?a.maxDays:Infinity)-(b.maxDays>0?b.maxDays:Infinity));
    return list;
  },[country,programmeSearch,programmeCategory,programmeSort]);
  const deadline=assessTravelDeadline(departure,props.today??algeriaToday(),visa?.minDays??0,visa?.maxDays??0);
  const expectedCatalogue=props.catalogueFingerprints?.[visaTypeId];
  const requirements = useMemo(() => (visaTypeId ? (props.requirementsByVisaType[visaTypeId] ?? []) : []), [props.requirementsByVisaType, visaTypeId]);

  const guard=useDocumentGuard(Boolean(props.documentIntelligence),files,requirements);
  const guardText=guardCopy[props.locale];
  const expiry=expiryAssessment(passportExpiry,props.today??algeriaToday(),departure);
  const expiryWarning=Boolean(props.documentIntelligence&&passportExpiry&&(expiry.state==="invalid"||expiry.state==="expired"));
  const technicalError=Boolean(guard.result&&Object.values(guard.result.byId).some(list=>list.some(guardTechnical)));
  const [acceptedRisk,setAcceptedRisk]=useState<{result:typeof guard.result;expiry:string;departure:string;visa:string}|null>(null);
  const accepted=acceptedRisk?.result===guard.result&&acceptedRisk?.expiry===passportExpiry&&acceptedRisk?.departure===departure&&acceptedRisk?.visa===visaTypeId;
  const requiredDocs=requirements.filter(r=>r.required);
  const completedDocs=requiredDocs.filter(r=>(files[r.documentTypeId]??[]).length>0).length;
  const selectedRequirement=requirements.find(r=>r.documentTypeId===activeDoc)??requirements.find(r=>r.required&&!(files[r.documentTypeId]??[]).length)??requirements[0];
  const selectedFiles=selectedRequirement?files[selectedRequirement.documentTypeId]??[]:[];
  const selectedFile=selectedFiles[previewIndex]??selectedFiles[0];
  function warningMessages(r:WizardRequirement):string[]{
    const key=normalize(r.code+" "+r.name);
    const mismatch=(files[r.documentTypeId]??[]).some(f=>{
      const name=normalize(f.name);
      if(/passport|passeport|جواز/.test(key))return /visa.grant|e.?visa|visa.approval|releve.bancaire|bank.statement|photo.identite|تأشيرة/.test(name);
      if(/photo|portrait|صورة/.test(key))return /passport|passeport|جواز|mrz|visa.grant|bank.statement/.test(name);
      if(checkoutBankRequirement(r))return checkoutBankFilenameMismatch(name);
      return false;
    });
    return [...new Set([...(mismatch?[smart.mismatch]:[]),...(localWarnings[r.documentTypeId]??[]).map(k=>k==="portrait"||k==="format"?checkout[k]:smart[k]),...(guard.result?.byId[r.documentTypeId]??[]).map(k=>guardText.issues[k])])];
  }
  const flaggedRequirements=requirements.filter(r=>warningMessages(r).length>0);
  const guardIssues=flaggedRequirements.map(r=>({name:r.name,messages:warningMessages(r)}));
  const requiresRisk=Boolean(props.documentIntelligence&&(flaggedRequirements.length||expiryWarning));
  const checkoutFiles=requirements.flatMap(r=>files[r.documentTypeId]??[]);
  const checkoutFileIndex=reviewFile?checkoutFiles.indexOf(reviewFile):-1;
  const checkoutCategory=/^(tourist|tourism|tourisme|touristique|سياحة)$/i.test(visa?.categoryName.trim()??"")?checkout.tourist:visa?.categoryName;
  const genericProgramme=Boolean(visa&&country&&[normalize(country.name),normalize("Visa "+country.name),normalize(country.name+" Visa"),normalize("تأشيرة "+country.name)].includes(normalize(visa.name)));
  useEffect(()=>{if(!selectedFile){setPreviewUrl("");return;}const url=URL.createObjectURL(selectedFile);setPreviewUrl(url);return ()=>URL.revokeObjectURL(url);},[selectedFile]);
  function selectDoc(id:string){setActiveDoc(id);setPreviewIndex(0);setFileError("");}
  function clearForProgrammeChange(){if((Object.values(files).some(a=>a.length)||batch.length)&&!window.confirm(ui.changeWarning))return false;setFiles({});setBatch([]);setActiveDoc("");setPreviewIndex(0);setFileError("");return true;}
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
    setProgrammeSearch("");setProgrammeCategory("");setProgrammeSort("catalogue");
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
      if(deadline.state==="invalid"){setClientError(ops.invalid);return false;}
      if(props.documentIntelligence&&expiry.state==="invalid"){setClientError(guardText.invalid);return false;}
      if (!applicantReady) {
        setClientError(t.validationApplicant);
        return false;
      }
    }
    if (n === 2) {
      if(batch.length){setClientError(assist.batchHint);return false;}
      if(props.documentIntelligence&&(guard.checking||technicalError)){setClientError(guard.checking?guardText.checking:guardText.technical);return false;}
      for (const r of requirements) {
        if (r.required && (files[r.documentTypeId] ?? []).length === 0) {
          selectDoc(r.documentTypeId);setClientError(`${t.missingPrefix}: ${r.name}`);
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

  function onFileChange(documentTypeId: string, list: FileList | File[] | null): boolean {
    if (!list) return false;
    const incoming = Array.from(list);
    if(!incoming.length)return false;
    const invalid=incoming.find(f=>!(/\.(pdf|jpe?g|png|webp|docx?)$/i.test(f.name))||f.size===0);
    if(invalid){setFileError(ui.invalid+" ("+invalid.name+")");return false;}
    const signature=(f:File)=>f.name+"|"+f.size+"|"+f.lastModified;
    if(new Set(incoming.map(signature)).size!==incoming.length||incoming.some(f=>Object.entries(files).some(([id,arr])=>id!==documentTypeId&&arr.some(other=>signature(other)===signature(f))))){setFileError(ui.duplicate);return false;}
    const tooBig = incoming.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setFileError(`${t.fileTooLarge} (${tooBig.name})`);
      return false;
    }
    setFileError("");
    setDirty(true);
    setFiles((prev) => ({ ...prev, [documentTypeId]: incoming }));
    setClientError("");setPreviewIndex(0);
    return true;
  }

  function removeFile(documentTypeId: string, index: number) {
    setFiles((prev) => ({ ...prev, [documentTypeId]: (prev[documentTypeId] ?? []).filter((_, i) => i !== index) }));
  }

  const preflightText = {
    fr:{checking:"Vérification du tarif et du solde…",unavailable:"La vérification n’a pas abouti. Réessayez avant de soumettre.",retry:"Réessayer",changed:"Ce programme ou son tarif a changé. Actualisez le catalogue avant de confirmer. Les fichiers sélectionnés seront à ajouter de nouveau.",refresh:"Actualiser le catalogue",duplicate:"Un dossier actif similaire existe pour ce nom, cette nationalité et ce programme. Vérifiez avant de soumettre ; il peut s’agir d’un homonyme.",checked:"Tarif et solde vérifiés."},
    en:{checking:"Checking price and balance…",unavailable:"The check could not be completed. Try again before submitting.",retry:"Retry",changed:"This programme or its price has changed. Refresh the catalogue before confirming. Selected files will need to be added again.",refresh:"Refresh catalogue",duplicate:"A similar active application exists for this name, nationality and programme. Check before submitting; it may be a different person with the same name.",checked:"Price and balance checked."},
    ar:{checking:"جارٍ التحقق من السعر والرصيد…",unavailable:"تعذر إتمام التحقق. أعيدوا المحاولة قبل الإرسال.",retry:"إعادة المحاولة",changed:"تغير هذا البرنامج أو سعره. حدّثوا القائمة قبل التأكيد. ستحتاجون إلى إضافة الملفات مجدداً.",refresh:"تحديث القائمة",duplicate:"يوجد طلب نشط مشابه بالاسم والجنسية والبرنامج نفسه. تحققوا قبل الإرسال، فقد يكون شخصاً آخر بالاسم نفسه.",checked:"تم التحقق من السعر والرصيد."}
  }[props.locale];
  type PreflightResponse = {fee:string|null;balance:string;possibleDuplicate:boolean;catalogueChanged?:boolean;similarApplicationId?:string|null};
  type ReviewCheck = { key:string; status:"checking"|"unavailable" } | ({key:string;status:"ready"} & PreflightResponse);
  const [preflight,setPreflight]=useState<ReviewCheck|null>(null);
  const [preflightRetry,setPreflightRetry]=useState(0);
  const preflightKey=JSON.stringify([countryId,visaTypeId,nameDraft.trim(),nationalityDraft,visa?.fee,expectedCatalogue]);
  useEffect(()=>{
    if(step!==3||!visaTypeId||!countryId)return;
    let current=true;
    const controller=new AbortController();
    setPreflight({key:preflightKey,status:"checking"});
    void (async()=>{
      try{
        const response=await fetch("/api/agency/requests",{method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({action:"preflight",countryId,visaTypeId,fullName:nameDraft.trim(),nationality:nationalityDraft,expectedCatalogue})});
        const data=await readRequestResponse<PreflightResponse>(response,props.locale);
        if(!data||typeof data.balance!=="string"||!Number.isFinite(Number(data.balance))||!(data.fee===null||typeof data.fee==="string")||typeof data.possibleDuplicate!=="boolean"||(expectedCatalogue&&typeof data.catalogueChanged!=="boolean"))throw Error("Invalid review data");
        if(current)setPreflight({key:preflightKey,status:"ready",...data});
      }catch{if(current)setPreflight({key:preflightKey,status:"unavailable"})}
    })();
    return()=>{current=false;controller.abort()};
  },[step,preflightKey,preflightRetry,countryId,visaTypeId,nameDraft,nationalityDraft,props.locale,expectedCatalogue]);
  const reviewCheck=step===3&&preflight?.key===preflightKey?preflight:null;
  const quoteChanged=reviewCheck?.status==="ready"&&(reviewCheck.catalogueChanged===true||reviewCheck.fee===null||Number(reviewCheck.fee)!==Number(visa?.fee));
  const reviewReady=reviewCheck?.status==="ready"&&!quoteChanged;
  const displayedBalance=reviewCheck?.status==="ready"?reviewCheck.balance:props.walletBalance;
  const feeNumber = visa ? Number(visa.fee) : 0;
  const balanceNumber = Number(displayedBalance);
  const afterNum = balanceNumber - feeNumber;
  const canAfford = visa ? afterNum >= 0 : false;
  const missing = canAfford ? 0 : Math.max(0, feeNumber - balanceNumber);
  const topupHref = `${props.topupPath ?? "/portal/wallet"}#topup`;

  function processingLabel(v: { minDays: number; maxDays: number }): string {
    return formatProcessingDays(v.minDays,v.maxDays,props.locale);
  }


  async function submit(form: HTMLFormElement) {
    if (step !== 3 || submittingRef.current || !reviewReady || !canAfford || catalogueRecovery || sessionRecovery || !validateStep(1) || !validateStep(2)) return;
    if(props.documentIntelligence&&(guard.checking||technicalError||(requiresRisk&&!accepted))){setClientError(guard.checking?guardText.checking:technicalError?guardText.technical:guardText.ack);return;}
    submittingRef.current = true;
    setPending(true);
    const fields = new FormData(form);
    const total = requirements.reduce((sum,r)=>sum+(files[r.documentTypeId]??[]).length,0);
    let received = 0;
    let finalAttemptStarted=false;
    // Keep only receipts for the current set of file objects, not previous selections.
    const currentKeys=new Set(requirements.flatMap(r=>(files[r.documentTypeId]??[]).map((_,slot)=>stagingReceiptKey(visaTypeId,r.documentTypeId,slot))));
    for(const key of stagingReceipts.current.keys())if(!currentKeys.has(key))stagingReceipts.current.delete(key);
    setTransferItems({});
    setTransfer({done:0,total,phase:total?"files":"confirm"});
    try {
      // Two independent bounded HTTP requests may overlap; the existing
      // transaction lock still serializes per-user quota checks and writes.
      const jobs=requirements.flatMap(requirement=>(files[requirement.documentTypeId]??[]).map((file,slot)=>({requirement,file,slot})));
      const tokens=await runBoundedUploads(jobs,props.parallelStaging?2:1,async({requirement,file,slot})=>{
          const key=stagingReceiptKey(visaTypeId,requirement.documentTypeId,slot);
          const expectedToken=String(requirement.documentTypeId)+"/"+slot;
          let token=reusableStagingToken(stagingReceipts.current.get(key),file,expectedToken);
          if(token===null){
            stagingReceipts.current.delete(key);
            const body = new FormData();
            body.set("attempt", idempotencyKey); body.set("visaTypeId", visaTypeId);
            body.set("documentTypeId", requirement.documentTypeId); body.set("slot", String(slot)); body.set("file", file);
            const response = await fetch("/api/agency/requests", { method: "POST", body });
            const data = await readRequestResponse<{token:string}>(response,props.locale);
            if(data.token!==expectedToken)throw Error("Invalid staging receipt");
            token=data.token;
            stagingReceipts.current.set(key,{file,token,at:Date.now()});
          }
          received += 1;
          setTransferItems(prev=>({...prev,[requirement.documentTypeId]:(prev[requirement.documentTypeId]??0)+1}));
          setTransfer({done:received,total,phase:"files"});
          return token;
      });
      setTransfer({done:received,total,phase:"confirm"});
      finalAttemptStarted=true;
      const response = await fetch("/api/agency/requests", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale:props.locale, attempt: idempotencyKey, countryId, visaTypeId, expectedFee: visa?.fee, expectedCatalogue, tokens,
          fullName: nameDraft.trim(), nationality: nationalityDraft, notes: String(fields.get("agencyNotes") ?? "") }) });
      const data = await readRequestResponse<{applicationId:string}>(response,props.locale);
      leavingAfterSuccess.current = true;
      window.location.assign(`/portal/applications/${data.applicationId}?submitted=1`);
    } catch (error) {
      // After any final commit failure, retry from a fresh staging set. The existing
      // idempotency key is intentionally unchanged: a lost response must not debit twice.
      if(finalAttemptStarted)stagingReceipts.current.clear();
      const feedback=requestFailureFeedback(error,props.locale);
      if(feedback.session||feedback.catalogue)stagingReceipts.current.clear();
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

      <style>{bookingCss+bookingRefinementCss+bookingAssistCss+smartBookingCss+checkoutCss}</style>
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
                <span className="font-semibold text-navy-900 inline-flex items-center gap-2" data-testid="wizard-destination-selected">
                  <CountryFlag iso={country.iso}/>{country.name}
                </span>
              </p>
              <button
                type="button"
                className="btn-secondary btn-sm"
                ref={destinationChangeRef}
                onClick={() => {
                  if(!clearForProgrammeChange())return;
                  setProgrammeSearch("");setProgrammeCategory("");setProgrammeSort("catalogue");setCountryId("");
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
                            className={`flex min-h-9 items-center gap-2 px-4 py-2 text-base font-normal text-navy-900 hover:bg-slate-50 ${activeDestination === index ? "bg-slate-50" : ""}`}
                          >
                            <CountryFlag iso={c.iso}/><span>{c.name}</span>
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
                        <CountryFlag iso={c.iso}/><span>{c.name}</span>{c.visaTypes.length>1?<small>{c.visaTypes.length}</small>:null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Programmes for the chosen destination only */}
          {country && country.visaTypes.length>1 ? (
            <div className="booking-catalogue">
              <div className="booking-line"><h3>{t.availableProgrammes}</h3><small>{country.visaTypes.length} {ux.programmes}</small></div>
              {country.visaTypes.length>3?<div className="booking-catalogue-tools">
                <input type="search" className="input" aria-label={ux.search} placeholder={ux.search} value={programmeSearch} onChange={e=>setProgrammeSearch(e.target.value)}/>
                <select className="input" aria-label={ux.catalogue} value={programmeSort} onChange={e=>setProgrammeSort(e.target.value as typeof programmeSort)}><option value="catalogue">{ux.catalogue}</option><option value="price">{ux.price}</option><option value="time">{ux.time}</option></select>
                {categories.length>1?<select className="input" aria-label={ux.all} value={programmeCategory} onChange={e=>setProgrammeCategory(e.target.value)}><option value="">{ux.all}</option>{categories.map(c=><option key={c}>{c}</option>)}</select>:null}
              </div>:null}
              <div className="booking-programmes" role="group" aria-label={t.availableProgrammes}>
                {visibleProgrammes.map(v=><label key={v.id} className="booking-programme" data-testid="wizard-visa-type" data-selected={visaTypeId===v.id}>
                  <input type="radio" name="visaTypeId" value={v.id} data-country-id={v.countryId} checked={visaTypeId===v.id} onChange={()=>changeProgramme(v.id)}/>
                  <span className="booking-programme-title"><strong>{v.name}</strong><small>{v.categoryName} · {processingLabel(v)} · {(props.requirementsByVisaType[v.id]??[]).filter(r=>r.required).length} {smart.programmeDocs}</small></span>
                  <strong className="booking-programme-fee"><bdi>{formatDZD(v.fee)}</bdi></strong>
                </label>)}
                {!visibleProgrammes.length?<p className="booking-muted">{ux.noMatch} <button type="button" className="booking-link" onClick={()=>{setProgrammeSearch("");setProgrammeCategory("")}}>{ux.reset}</button></p>:null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Applicant — one traveler, minimal data (§12) */}
        <div className="booking-traveller space-y-4">
          <h2>{ux.traveller}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="t0_fullName">{t.fullName} *</label>
              <input
                id="t0_fullName"
                name="t0_fullName"
                required
                autoComplete="off"
                className="input"
                data-testid="wizard-full-name"
                value={nameDraft} onChange={e=>{setNameDraft(e.target.value);if(clientError===t.validationApplicant)setClientError("")}}
                placeholder={t.fullNamePlaceholder}
              />
            </div>
            <div>
              <label className="label" htmlFor="wizard-nationality-trigger">{t.nationality} *</label>
              <div ref={nationalityRef} className="booking-nationality">
                <input type="hidden" name="t0_nationality" value={nationalityDraft}/>
                <button type="button" id="wizard-nationality-trigger" ref={nationalityTriggerRef} className="input booking-line" data-testid="wizard-nationality" aria-expanded={nationalityOpen} aria-controls="booking-nationality-options" onClick={()=>{setNationalitySearch("");setNationalityOpen(v=>!v)}}>{props.nationalities.find(n=>n.code===nationalityDraft)?.label??nationalityDraft}<span aria-hidden>⌄</span></button>
                {nationalityOpen?<div className="booking-nationality-pop" data-placement={nationalityMenu.above?"above":"below"} id="booking-nationality-options" onKeyDown={e=>{if(e.key==="Escape"){setNationalityOpen(false);document.getElementById("wizard-nationality-trigger")?.focus()}}}>
                  <input ref={nationalitySearchRef} type="search" className="input" aria-label={assist.nationality} placeholder={assist.nationality} value={nationalitySearch} onChange={e=>setNationalitySearch(e.target.value)}/>
                  <div className="booking-nationality-list" style={{maxHeight:nationalityMenu.listHeight}}>{props.nationalities.filter(n=>normalize(n.label+" "+n.code).includes(normalize(nationalitySearch))).map(n=><button key={n.code} type="button" aria-pressed={n.code===nationalityDraft} onClick={()=>{setNationalityDraft(n.code);if(clientError===t.validationApplicant)setClientError("");setDirty(true);setNationalityOpen(false);document.getElementById("wizard-nationality-trigger")?.focus()}}>{n.label}{n.code===nationalityDraft?" ✓":""}</button>)}{!props.nationalities.some(n=>normalize(n.label+" "+n.code).includes(normalize(nationalitySearch)))?<p className="booking-muted">{assist.noNationality}</p>:null}</div>
                </div>:null}
              </div>
            </div>
          </div>
          {props.documentIntelligence?<PassportValidity locale={props.locale} today={props.today??algeriaToday()} departure={departure} value={passportExpiry} onChange={v=>{setPassportExpiry(v);setDirty(true)}} disabled={pending||step!==1}/>:null}
          <TravelDeparture locale={props.locale} today={props.today??algeriaToday()} value={departure} programme={visa} disabled={pending||step!==1} onChange={value=>{setDeparture(value);setDirty(true);if(clientError===ops.invalid)setClientError("")}}/>
          <details className="booking-notes"><summary>{ui.notes}</summary><label className="label sr-only" htmlFor="agencyNotes">{t.notes}</label><textarea id="agencyNotes" name="agencyNotes" rows={2} className="input mt-3" placeholder={t.notesPlaceholder} /></details>
        </div>
        </div>
        <aside className="booking-side">
          <h2>{ui.reservation}</h2>
          {visa?<><div className="booking-product"><small>{country?.name}</small><h3>{visa.name}</h3><span>{visa.categoryName} · {processingLabel(visa)}</span>{visa.description?<p>{visa.description}</p>:null}<strong className="booking-price"><bdi>{formatDZD(visa.fee)}</bdi></strong></div>
          <div className="booking-rule"><h3>{t.summaryDocuments}</h3>{requirements.length?requirements.map(r=><p className="booking-line" key={r.documentTypeId}><span>{r.name}</span><small>{r.required?t.required:ui.optional}</small></p>):<p>{t.noDocumentsRequired}</p>}</div>
          <div className="booking-rule"><p className="booking-line"><span>{t.walletBalance}</span><strong><bdi>{formatDZD(props.walletBalance)}</bdi></strong></p>{canAfford?<><p className="booking-line"><span>{ui.estimate}</span><strong><bdi>{formatDZD(afterNum)}</bdi></strong></p><p className="booking-success">✓ {ui.covered}</p></>:<><p className="booking-warning">{ui.missing}: <bdi>{formatDZD(missing)}</bdi></p><a href={topupHref} className="btn-secondary">{t.requestTopup}</a></>}</div></>:<div className="booking-empty"><h3>{ux.start}</h3><p>{ux.hint}</p>{country?<p>{country.visaTypes.length} {ux.programmes}</p>:null}</div>}
        </aside>
      </section>

      {/* STEP 2 — document workspace */}
      <section data-wizard-section="2" hidden={step!==2} className="wizard-panel booking-docs" data-direction={wizardDirection}>
        <div className="booking-doc-head"><div><h2>{t.documents}</h2><small>{country?.name} · {visa?.name} · <bdi>{visa?formatDZD(visa.fee):"—"}</bdi></small></div><div className="booking-doc-progress" role="status"><strong>{completedDocs}/{requiredDocs.length}</strong> <span>{progressCopy.selected}</span>{requiredDocs.length>0?<progress value={completedDocs} max={requiredDocs.length} aria-label={progressCopy.selected}/>:null}</div></div>
        {fileError?<p role="alert" className="booking-warning" data-testid="wizard-file-error">{fileError}</p>:null}
        {props.documentIntelligence&&step===2?<GuardSummary locale={props.locale} checking={guard.checking} issues={guardIssues}/>:null}
        {requirements.length===0?<p>{t.noDocumentsRequired}</p>:<div className="booking-doc-grid" data-single={requirements.length===1&&batch.length===0}>
          <div className="booking-doc-list" role="group" aria-label={t.summaryDocuments} hidden={requirements.length===1&&batch.length===0}>
            <label className="booking-batch btn-secondary"><span>＋ {assist.batch}</span><input className="sr-only" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={e=>{const incoming=Array.from(e.currentTarget.files??[]);if(incoming.length){setBatch(prev=>[...prev,...incoming]);setDirty(true)}e.currentTarget.value=""}}/></label>
            {batch.length?<div className="booking-inbox"><strong>{assist.unassigned} ({batch.length})</strong><small>{assist.batchHint}</small>{batch.map((f,i)=><div className="booking-batch-row" key={i}><span>{f.name}</span><button type="button" className="booking-link" disabled={!selectedRequirement} aria-label={assist.assign+" "+f.name+" → "+selectedRequirement?.name} onClick={()=>{if(selectedRequirement&&onFileChange(selectedRequirement.documentTypeId,[...(files[selectedRequirement.documentTypeId]??[]),f]))setBatch(prev=>prev.filter((_,j)=>j!==i))}}>{assist.assign}</button><button type="button" className="booking-link" aria-label={t.remove+" "+f.name} onClick={()=>setBatch(prev=>prev.filter((_,j)=>j!==i))}>×</button></div>)}</div>:null}
            {requirements.map(r=><button type="button" key={r.documentTypeId} className="booking-doc-row" aria-pressed={selectedRequirement?.documentTypeId===r.documentTypeId} onClick={()=>selectDoc(r.documentTypeId)}><span className="booking-doc-icon" aria-hidden>▤</span><span><strong>{r.name}</strong><small>{r.required?t.required:ui.optional}</small></span><span className={(files[r.documentTypeId]??[]).length?"booking-success":"booking-muted"}>{warningMessages(r).length?<span className="booking-warning">• {smart.inspect}</span>:(files[r.documentTypeId]??[]).length?(guard.checking?guardText.checking:"✓ "+smart.selected):ui.empty}</span></button>)}
          </div>
          {selectedRequirement?<div className="booking-doc-panel">
            <div className="booking-doc-head"><h3>{selectedRequirement.name}</h3>{selectedFiles.length?<span className={warningMessages(selectedRequirement).length?"booking-warning":guard.checking?"booking-muted":"booking-success"}>{warningMessages(selectedRequirement).length?checkout.check:guard.checking?guardText.checking:ui.selected}</span>:null}</div>
            {selectedRequirement.notes?<p className="booking-muted">{selectedRequirement.notes}</p>:null}{warningMessages(selectedRequirement).length?<div role="status" className="booking-warning">{warningMessages(selectedRequirement).map(message=><p key={message}>{message}</p>)}<small>{smart.noValidation}</small></div>:null}
            <label className={selectedFiles.length?"booking-file-replace":"booking-drop"} data-dragging={dragging} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);onFileChange(selectedRequirement.documentTypeId,e.dataTransfer.files)}}>
              {!selectedFiles.length?<><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></svg><strong>{ui.drop}</strong></>:null}
              <span className={selectedFiles.length?"btn-secondary":"btn-primary"}>{selectedFiles.length?ui.replace:ui.browse}</span>
              <input key={selectedRequirement.documentTypeId} type="file" name={`file_${selectedRequirement.documentTypeId}`} aria-label={`${t.chooseFile}: ${selectedRequirement.name}`} multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="sr-only" data-required={selectedRequirement.required?"1":"0"} onChange={e=>{onFileChange(selectedRequirement.documentTypeId,e.currentTarget.files);e.currentTarget.value=""}}/>
              {!selectedFiles.length?<small>{t.uploadHint}</small>:null}
            </label>
            {selectedFiles.length?<><div className="booking-files">{selectedFiles.map((f,i)=><div key={i} className="booking-line"><button type="button" className="booking-file-name" aria-pressed={i===previewIndex} onClick={()=>setPreviewIndex(i)}>{f.name} <small>{Math.ceil(f.size/1024)} KB</small></button><button type="button" className="booking-link" onClick={()=>{removeFile(selectedRequirement.documentTypeId,i);setPreviewIndex(0)}}>{t.remove}</button></div>)}</div>
            {selectedFile&&previewUrl?<div className="booking-preview">{/^image\/(jpeg|png|webp)$/.test(selectedFile.type)?<button type="button" className="booking-preview-image" onClick={()=>setReviewFile(selectedFile)} aria-label={ux.full}><img src={previewUrl} alt={selectedFile.name}/></button>:selectedFile.type==="application/pdf"?<iframe title={selectedFile.name} src={previewUrl}/>:<p>{ui.unavailable}</p>}</div>:null}</>:null}
            <div className="booking-line"><small>{ux.verify}</small>{selectedFile?<button type="button" className="booking-link" onClick={()=>setReviewFile(selectedFile)}>{ux.full}</button>:null}{requirements.some(r=>r.documentTypeId!==selectedRequirement.documentTypeId&&r.required&&!(files[r.documentTypeId]??[]).length)?<button type="button" className="btn-secondary" onClick={()=>{const next=requirements.find(r=>r.documentTypeId!==selectedRequirement.documentTypeId&&r.required&&!(files[r.documentTypeId]??[]).length);if(next)selectDoc(next.documentTypeId)}}>{ui.nextDoc} →</button>:null}</div>
          </div>:null}
        </div>}
      </section>

      {/* STEP 3 — review & submit */}
      <section data-wizard-section="3" hidden={step!==3} className="wizard-panel booking-grid" data-direction={wizardDirection}>
        <div className="booking-main booking-review checkout-review">
          <div className="checkout-heading"><h2>{checkout.heading}</h2></div>
          <div className="checkout-ticket">
            <div className="checkout-ticket-info"><small>{checkout.destination}</small><h3 className="checkout-country-name">{country?.name}{country?<CountryFlag iso={country.iso} className="checkout-country-code"/>:null}</h3>{!genericProgramme&&visa?.name?<strong className="checkout-programme">{visa.name}</strong>:null}<span>{[checkoutCategory,visa?processingLabel(visa):null].filter(Boolean).join(" · ")}</span></div>
            <button type="button" className="checkout-edit" disabled={pending} onClick={()=>editStep(1)} aria-label={ui.edit+" · "+t.sectionVisa}><CheckoutIcon kind="edit"/><span>{ui.edit}</span></button>
          </div>
          <div className="checkout-traveller">
            <div className="checkout-traveller-info" data-testid="wizard-applicant-summary"><small>{t.sectionApplicant}</small><strong>{nameDraft||"—"}</strong><span>{t.nationality}: {props.nationalities.find(n=>n.code===nationalityDraft)?.label??nationalityDraft}</span></div>
            <button type="button" className="checkout-edit" disabled={pending} onClick={()=>editStep(1)} aria-label={ui.edit+" · "+t.sectionApplicant}><CheckoutIcon kind="edit"/><span>{ui.edit}</span></button>
          </div>
          {props.documentIntelligence?<PassportValiditySummary locale={props.locale} today={props.today??algeriaToday()} departure={departure} value={passportExpiry}/>:null}
          {departure?<TravelTiming locale={props.locale} today={props.today??algeriaToday()} value={departure} programme={visa} onEdit={pending?undefined:()=>editStep(1)}/>:null}
          {reviewReady&&reviewCheck?.status==="ready"&&reviewCheck.possibleDuplicate?<div className="booking-duplicate-note" role="status"><div><strong>{({fr:"Dossier similaire détecté",en:"Similar application found",ar:"تم العثور على طلب مشابه"}[props.locale])}</strong><p>{({fr:"Vérifiez s’il s’agit du même voyageur ou d’un homonyme.",en:"Check whether this is the same traveller or a different person with the same name.",ar:"تحققوا مما إذا كان المسافر نفسه أو شخصاً آخر يحمل الاسم نفسه."}[props.locale])}</p></div>{typeof reviewCheck.similarApplicationId==="string"&&/^[0-9a-f-]{36}$/i.test(reviewCheck.similarApplicationId)?<a className="booking-link" href={`/portal/applications/${encodeURIComponent(reviewCheck.similarApplicationId)}`} target="_blank" rel="noopener noreferrer">{({fr:"Consulter le dossier ↗",en:"View application ↗",ar:"عرض الطلب ↗"}[props.locale])}</a>:null}</div>:null}
          <div className="checkout-documents">
            <div className="checkout-doc-heading"><h3>{t.summaryDocuments}</h3><span className="checkout-count"><bdi>{completedDocs}/{requiredDocs.length}</bdi> {checkout.selected}</span><button type="button" className="checkout-edit" disabled={pending} onClick={()=>editStep(2)} aria-label={ui.edit+" · "+t.summaryDocuments}><CheckoutIcon kind="edit"/><span>{ui.edit}</span></button></div>
            {fileError?<p role="alert" className="booking-warning" data-testid="checkout-file-error">{fileError}</p>:null}
            {!props.documentIntelligence&&flaggedRequirements.length?<details className="checkout-attention"><summary><span className="checkout-attention-dot" aria-hidden="true"/><span>{checkout.attention} · <bdi>{flaggedRequirements.length}</bdi></span></summary><small>{smart.noValidation}</small></details>:null}
            {props.documentIntelligence?<GuardSummary locale={props.locale} checking={guard.checking} issues={guardIssues} onFix={()=>editStep(2)}/>:null}
            {requirements.length===0?<p className="booking-muted">{t.noDocumentsRequired}</p>:<div className="checkout-gallery" data-single={requirements.length===1} role="group" aria-label={t.summaryDocuments}>
              {requirements.map(r=>{
                const attached=files[r.documentTypeId]??[];
                const warnings=warningMessages(r);
                const flagged=warnings.length>0;
                return <div className="checkout-document" key={r.documentTypeId} data-flagged={flagged}>
                  <div className="checkout-document-label">
                    <strong>{r.name}</strong>
                    <span className={flagged?"booking-warning":"booking-muted"}><span className="checkout-status-dot" aria-hidden="true"/>{flagged?checkout.check:attached.length?checkout.selectedShort:r.required?checkout.missing:ui.optional}</span>
                  </div>
                  {attached.length?attached.map((f,i)=><button key={i} type="button" className="checkout-document-preview" disabled={pending} onClick={()=>setReviewFile(f)} aria-label={ui.preview+" · "+r.name+" · "+f.name}><CheckoutThumbnail file={f} active={step===3}/><span className="checkout-file-caption"><span title={f.name} dir="auto">{f.name}</span><CheckoutIcon kind="expand"/></span></button>):<div className="checkout-missing"><CheckoutIcon kind="file"/><span>{r.required?checkout.missing:ui.optional}</span></div>}
                  {flagged&&!props.documentIntelligence?<details className="checkout-document-warning"><summary>{smart.inspect} ({warnings.length})</summary>{warnings.map(message=><p key={message}>{message}</p>)}</details>:null}
                  <label className="checkout-replace" data-disabled={pending}>
                    <CheckoutIcon kind="edit"/><span>{attached.length>1?checkout.replaceAll:attached.length?checkout.replace:checkout.add}</span>
                    <input className="sr-only" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" disabled={pending} aria-label={(attached.length>1?checkout.replaceAll:attached.length?checkout.replace:checkout.add)+" · "+r.name} onChange={e=>{if(!submittingRef.current&&!pending)onFileChange(r.documentTypeId,e.currentTarget.files);e.currentTarget.value=""}}/>
                  </label>
                </div>;
              })}
            </div>}
            <small className="checkout-verify">{ux.verify}</small>
          </div>
        </div>
        <aside className="booking-side checkout-payment">
          <h2>{ui.payment}</h2><div className="booking-product"><small>{ux.payment}</small><strong className="booking-price"><bdi>{visa?formatDZD(visa.fee):"—"}</bdi></strong></div>
          <div className="booking-rule"><p className="booking-line"><span>{t.currentBalance}</span><strong><bdi>{formatDZD(displayedBalance)}</bdi></strong></p><p className="booking-line"><span>{t.balanceAfter}</span><strong className={canAfford?"booking-success":"booking-warning"}><bdi>{canAfford?formatDZD(afterNum):"—"}</bdi></strong></p></div>
          <p className="booking-muted">{t.chargeNote}</p>
          <div className="booking-preflight" aria-live="polite">
            {!reviewCheck||reviewCheck.status==="checking"?<p className="booking-muted">{preflightText.checking}</p>:reviewCheck.status==="unavailable"?<div className="booking-line"><p className="booking-warning">{preflightText.unavailable}</p><button type="button" className="booking-link" disabled={pending} onClick={()=>{setPreflight(null);setPreflightRetry(n=>n+1)}}>{preflightText.retry}</button></div>:quoteChanged?<div><p className="booking-warning">{reviewCheck.catalogueChanged?ops.changed:preflightText.changed}</p><button type="button" className="booking-link" disabled={pending} onClick={()=>window.location.reload()}>{preflightText.refresh}</button></div>:<><p className="booking-success">✓ {expectedCatalogue?ops.checklist:preflightText.checked}</p></>}
          </div>
          <details className="ops-review"><summary>{ops.decision}</summary><p>{ops.traveller}: {applicantReady?"✓":"—"}</p><p>{ops.documents}: <bdi>{completedDocs}/{requiredDocs.length}</bdi></p><small>{ops.notReviewed}</small></details>
          {pending&&transfer?<div className="agency-v2-submit-progress" role="status" aria-live="polite"><strong>{transfer.phase==="files"?`${progressCopy.files}: ${transfer.done} / ${transfer.total}`:progressCopy.confirm}</strong>{transfer.phase==="files"&&transfer.total>0?<progress aria-label={progressCopy.files} value={transfer.done} max={transfer.total}/>:null}{transfer.phase==="files"?<details className="core-transfer-details"><summary>{t.documents}</summary>{requirements.filter(r=>(files[r.documentTypeId]??[]).length>0).map(r=><div key={r.documentTypeId}><span>{r.name}</span><bdi>{transferItems[r.documentTypeId]??0}/{(files[r.documentTypeId]??[]).length}</bdi></div>)}</details>:null}<p>{progressCopy.notice}</p></div>:null}
          {props.documentIntelligence&&requiresRisk&&!technicalError&&!guard.checking?<label className="di-risk-ack"><input type="checkbox" checked={accepted} disabled={pending} onChange={e=>setAcceptedRisk(e.currentTarget.checked?{result:guard.result,expiry:passportExpiry,departure,visa:visaTypeId}:null)}/><span>{guardText.ack}</span></label>:null}
          {props.documentIntelligence&&technicalError?<p role="alert" className="booking-warning">{guardText.technical}</p>:null}
          {canAfford||!reviewReady?<button type="submit" className="btn-primary w-full" disabled={pending||!reviewReady||catalogueRecovery||sessionRecovery||Boolean(props.documentIntelligence&&(guard.checking||technicalError||(requiresRisk&&!accepted)))} data-testid="wizard-submit">{pending?t.submitting:<>{t.submitApplication} — <bdi>{visa?formatDZD(visa.fee):"—"}</bdi></>}</button>:<><p className="booking-warning">{t.insufficientTitle} · <bdi>{formatDZD(missing)}</bdi></p><a href={topupHref} className="btn-primary" data-testid="wizard-topup-cta">{t.requestTopup}</a></>}
        </aside>
      </section>


      <div className="booking-footer" data-step={step}>
        <button type="button" onClick={goBack} hidden={step===1} disabled={step === 1 || pending} className="btn-secondary">
          <span className="directional" aria-hidden>←</span> {t.back}
        </button>
        <small aria-live="polite">{step===2?(batch.length?assist.batchHint:completedDocs<requiredDocs.length?smart.remaining+" : "+(requiredDocs.length-completedDocs):smart.ready+" · "+ux.local):step===1?ui.noDebit:""}</small>
        {step < 3 ? (
          <button type="button" onClick={goNext} disabled={pending||(step===1?(!visa||!applicantReady||deadline.state==="invalid"):completedDocs<requiredDocs.length||batch.length>0||Boolean(props.documentIntelligence&&(guard.checking||technicalError)))} className="btn-primary">
            {step===1?ui.continue:ui.review} <span className="directional" aria-hidden>→</span>
          </button>
        ) : null}
      </div>
      <dialog ref={reviewDialog} className="booking-review-dialog" onClose={()=>setReviewFile(null)} onCancel={()=>setReviewFile(null)} aria-label={ui.preview}>
        {reviewFile?<><div className="booking-dialog-head"><strong dir="auto">{reviewFile.name}</strong>{step===3&&checkoutFileIndex>=0&&checkoutFiles.length>1?<div className="checkout-dialog-navigation"><button type="button" className="btn-secondary" disabled={checkoutFileIndex===0} onClick={()=>setReviewFile(checkoutFiles[checkoutFileIndex-1]??null)}>{checkout.previous}</button><small><bdi>{checkoutFileIndex+1}/{checkoutFiles.length}</bdi></small><button type="button" className="btn-secondary" disabled={checkoutFileIndex===checkoutFiles.length-1} onClick={()=>setReviewFile(checkoutFiles[checkoutFileIndex+1]??null)}>{checkout.next}</button></div>:null}{reviewFile.type.startsWith("image/")?<button type="button" className="btn-secondary" onClick={()=>setZoom(v=>!v)}>{zoom?assist.fit:ux.full}</button>:null}<button type="button" className="btn-secondary" onClick={()=>reviewDialog.current?.close()}>{ux.close}</button></div><div className="booking-dialog-body" data-zoom={zoom}>{!reviewUrl?<p role="status">{checkout.loading}</p>:/^image\/(jpeg|png|webp)$/.test(reviewFile.type)?<img src={reviewUrl} alt={reviewFile.name}/>:reviewUrl&&reviewFile.type==="application/pdf"?<iframe title={reviewFile.name} src={reviewUrl}/>:<p>{ui.unavailable}</p>}</div></>:null}
      </dialog>
    </form>
  );
}

const bookingCss = "/* ESSAFARIA Dashboard 04 — only /portal. Typography and surface tokens have one source. */\n.workspace-agency.workspace-agency:has(.booking-experience){\n --agency-paper:#fff;--agency-ink:#0b1c30;--agency-muted:#344457;--agency-rule:#e2e5e9;--agency-hover:#f5f7fa;\n background:#fff;color:#0b1c30;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",Arial,sans-serif;\n}\nhtml[lang=\"ar\"] .workspace-agency.workspace-agency:has(.booking-experience){font-family:\"Plex Arabic\",Barlow,Arial,sans-serif}\n.workspace-agency.workspace-agency:has(.booking-experience) #workspace-main{background:#fff;padding-block-start:24px}\n.workspace-agency.workspace-agency:has(.booking-experience) .workspace-header-context{display:none}\n.workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation a[href=\"/portal/notifications\"] .badge{display:none}\n.workspace-agency.workspace-agency:has(.booking-experience) .agency-header-brand small{font-size:15px;letter-spacing:normal}\n.workspace-agency.workspace-agency:has(.booking-experience) .workspace-topbar button,.workspace-agency.workspace-agency:has(.booking-experience) .workspace-topbar summary{font-family:inherit}\n.workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation .workspace-nav-link{font-size:16px;font-weight:500}\n.workspace-agency.workspace-agency:has(.booking-experience) :is(.workspace-topbar,.agency-desktop-navigation) :is(a,button,summary):focus-visible{outline:2px solid #304b64;outline-offset:3px}\n@media(min-width:1280px){\n .workspace-agency.workspace-agency:has(.booking-experience) .workspace-topbar{flex-shrink:0}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation{position:sticky;top:64px;z-index:29;flex-shrink:0;background:white}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation a:is([href=\"/portal/notifications\"],[href=\"/portal/profile\"]){display:none}\n}\n@media(min-width:1600px){\n .workspace-agency.workspace-agency:has(.booking-experience) .workspace-topbar{height:68px;padding-inline:24px}\n .workspace-agency.workspace-agency:has(.booking-experience) .workspace-topbar > div:last-child > span.hidden{display:none}\n .workspace-agency.workspace-agency:has(.booking-experience) .account-menu-identity{display:none}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation{top:0;z-index:31;align-self:center;width:calc(100% - 480px);min-height:68px;height:68px;margin-block-start:-68px;padding:0;gap:8px;justify-content:center;border:0;background:transparent}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation .workspace-nav-link{padding:8px 12px;min-height:44px;white-space:nowrap;border-radius:6px}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation .workspace-nav-link:not([href=\"/portal/applications/new\"]) .workspace-nav-icon{display:none}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation .workspace-nav-link[aria-current]:not([href=\"/portal/applications/new\"]){background:transparent;box-shadow:inset 0 -2px #0b1c30;border-radius:0;color:#0b1c30;font-weight:600}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation .workspace-nav-link:hover:not([href=\"/portal/applications/new\"]){background:#f5f7fa}\n .workspace-agency.workspace-agency:has(.booking-experience) .agency-desktop-navigation a[href=\"/portal/applications/new\"]{margin-inline:6px}\n}\n\n.workspace-agency.workspace-agency:has(.booking-experience){--agency-muted:#647182}\n.workspace-agency:has(.booking-experience) #workspace-main{max-width:1700px;width:100%;padding-inline:clamp(20px,4vw,64px)}\n.workspace-agency:has(.booking-experience) #workspace-main .page-header{margin-block-end:12px}\n.workspace-agency:has(.booking-experience) #workspace-main .page-header-subtitle{display:none}\n.workspace-agency #workspace-main .booking-experience{color:#0b1c30;font-size:16px;line-height:1.5;display:grid;gap:20px;font-family:inherit}\n.workspace-agency #workspace-main .booking-experience :is(h1,h2,h3,button,input,select,textarea){font-family:inherit}\n.workspace-agency #workspace-main .booking-experience h2{font-size:22px;font-weight:600;letter-spacing:-.018em}\n.workspace-agency #workspace-main .booking-experience h3{font-size:17px;font-weight:600}\n.workspace-agency #workspace-main .booking-experience small,.booking-muted{font-size:15px;color:#647182}\n.workspace-agency #workspace-main .booking-experience :is(.input,.btn-primary,.btn-secondary){border-radius:7px;font-weight:500}\n.booking-experience [hidden]{display:none!important}\n.booking-rail{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding-block:5px 12px;border-bottom:1px solid #e2e5e9;gap:12px}\n.booking-rail li{position:relative;min-width:0}\n.booking-rail li:not(:last-child):after{content:\"\";position:absolute;inset-inline-start:42px;inset-inline-end:8px;top:18px;border-top:1px dashed #b8c6d4;z-index:0}\n.booking-rail li[data-state=complete]:after{border-top:1px solid #6b899f}\n.booking-rail button{display:flex;flex-direction:column;align-items:start;gap:7px;position:relative;z-index:1;text-align:start;font-size:15px;color:#647182;min-height:58px}\n.booking-rail li[data-state=active] button{color:#0b1c30;font-weight:600}\n.booking-rail li[data-state=complete] button{color:#0b1c30;cursor:pointer}\n.booking-marker{width:36px;height:36px;display:grid;place-items:center;border:1px solid #c7d1db;border-radius:50%;background:white;color:#647182;font-size:15px}\n.booking-rail li[data-state=active] .booking-marker{background:#0b1c30;color:white;box-shadow:0 0 0 4px #e6edf3;border-color:#0b1c30}\n.booking-rail li[data-state=complete] .booking-marker{color:#23685c;border-color:#8cb4a8}\n.booking-grid:not([hidden]){display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,1fr);gap:clamp(24px,4vw,64px);align-items:start}\n.booking-main,.booking-side{display:grid;gap:18px;min-width:0}\n.booking-side{border-inline-start:1px solid #e2e5e9;padding-inline-start:clamp(20px,3vw,44px)}\n.booking-traveller{border-top:1px solid #e2e5e9;padding-top:20px}\n.booking-selected-country{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #e2e5e9;padding-block:10px}\n.booking-notes summary{cursor:pointer;color:#647182;min-height:44px;display:list-item;padding-block:10px}\n.booking-product{display:grid;gap:5px}\n.booking-product h3{font-size:24px!important;line-height:1.25}\n.booking-price{font-size:34px;line-height:1.2;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.025em;margin-top:8px}\n.booking-rule{border-top:1px solid #e2e5e9;padding-top:12px;display:grid;gap:8px}\n.booking-line{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:30px}\n.booking-line strong{font-weight:600;text-align:end;font-variant-numeric:tabular-nums}\n.booking-success{color:#21684f;font-size:15px}\n.booking-warning{color:#934516;font-size:15px}\n.booking-empty{color:#647182;padding-block:14px}\n.booking-doc-head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}\n.booking-doc-progress{display:flex;align-items:center;gap:8px;color:#647182;font-size:15px}\n.booking-doc-progress strong{font-size:22px;color:#0b1c30;font-weight:600}\n.booking-doc-progress progress{width:90px;height:5px;accent-color:#23685c}\n.booking-doc-grid{display:grid;grid-template-columns:minmax(260px, .75fr) minmax(0,1.25fr);gap:24px;border-top:1px solid #e2e5e9;margin-top:14px}\n.booking-doc-list{padding-block:8px;min-width:0}\n.booking-doc-row{width:100%;display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;text-align:start;gap:12px;min-height:64px;padding:10px 12px;border-bottom:1px solid #e2e5e9;transition:background 160ms ease;border-radius:5px}\n.booking-doc-row[aria-pressed=true]{background:#edf2f6;box-shadow:inset 3px 0 #0b1c30}\n[dir=rtl] .booking-doc-row[aria-pressed=true]{box-shadow:inset -3px 0 #0b1c30}\n.booking-doc-row:hover{background:#f5f7fa}\n.booking-doc-row strong,.booking-doc-row small{display:block;font-weight:500}\n.booking-doc-icon{color:#647182;font-size:20px}\n.booking-doc-panel{display:grid;gap:14px;align-content:start;padding:16px 0 0 24px;border-inline-start:1px solid #e2e5e9;min-width:0}\n[dir=rtl] .booking-doc-panel{padding:16px 24px 0 0}\n.booking-drop{display:grid;justify-items:center;align-content:center;gap:10px;min-height:218px;border:1px dashed #aab8c7;border-radius:12px;text-align:center;padding:18px;cursor:pointer;transition:background 160ms ease,border-color 160ms ease}\n.booking-drop:hover,.booking-drop[data-dragging=true]{background:#f5f8fb;border-color:#0b1c30}\n.booking-drop:focus-within,.booking-file-replace:focus-within{outline:2px solid #0b1c30;outline-offset:3px}\n.booking-file-replace{justify-self:start;cursor:pointer}\n.booking-preview{display:grid;place-items:center;background:#f6f7f9;border-radius:7px;min-height:150px;overflow:hidden}\n.booking-preview img{max-width:100%;height:clamp(160px,25vh,310px);object-fit:contain}\n.booking-preview iframe{width:100%;height:clamp(220px,33vh,390px);border:0}\n.booking-preview p{padding:18px;color:#647182}\n.booking-files{display:grid;gap:4px}\n.booking-file-name{text-align:start;overflow-wrap:anywhere;min-width:0}\n.booking-file-name[aria-pressed=true]{font-weight:600}\n.booking-link{color:#285582;min-height:44px;padding-inline:6px;text-decoration:underline;text-underline-offset:3px}\n.booking-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-block:12px;border-top:1px solid #e2e5e9}\n.booking-footer>button:last-child{margin-inline-start:auto}\n.workspace-agency #workspace-main .booking-experience .wizard-choice{font-weight:500;border-radius:6px}\n.workspace-agency #workspace-main .booking-experience .wizard-panel:not([hidden]){animation:booking-enter 200ms cubic-bezier(.2,.7,.2,1) backwards}\n@keyframes booking-enter{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}\n@media(max-width:850px){.booking-grid:not([hidden]),.booking-doc-grid{grid-template-columns:1fr;gap:16px}.booking-side,.booking-doc-panel,[dir=rtl] .booking-doc-panel{border-inline-start:0;padding-inline:0;border-top:1px solid #e2e5e9;padding-top:16px}.booking-doc-row{min-height:56px}.booking-rail button{font-size:14px}.booking-footer{position:static}}\n@media(prefers-reduced-motion:reduce){.workspace-agency #workspace-main .booking-experience .wizard-panel:not([hidden]){animation:none}.booking-doc-row,.booking-drop{transition:none}}\n";

const bookingRefinementCss="\n.booking-rail{max-width:760px;width:100%;padding-block:0 10px;gap:18px}.booking-rail button{flex-direction:row;align-items:center;gap:10px;min-height:42px}.booking-rail li:not(:last-child):after{inset-inline-start:0;inset-inline-end:0;top:auto;bottom:-5px}.booking-marker{width:30px;height:30px;flex:none}.booking-grid:not([hidden]){grid-template-columns:minmax(0,1.6fr) minmax(280px,1fr);gap:clamp(24px,3vw,48px)}\n.booking-catalogue{display:grid;gap:10px}.booking-catalogue-tools{display:flex;flex-wrap:wrap;gap:8px}.booking-catalogue-tools input{flex:2 1 180px;min-width:0}.booking-catalogue-tools select{flex:1 1 140px;min-width:0;max-width:100%}.booking-programmes{max-height:clamp(200px,32vh,350px);overflow:auto;overscroll-behavior:contain;border-block:1px solid #e2e5e9}.booking-programme{display:grid;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:12px;padding:10px 12px;min-height:60px;cursor:pointer;border-bottom:1px solid #e2e5e9;transition:background 160ms ease}.booking-programme:last-child{border-bottom:0}.booking-programme[data-selected=true]{background:#edf2f6}.booking-programme:hover{background:#f5f7fa}.booking-programme input{accent-color:#0b1c30}.booking-programme-title{min-width:0;overflow-wrap:anywhere;display:grid}.booking-programme-title strong{font-weight:600}.booking-programme-fee{white-space:nowrap;font-variant-numeric:tabular-nums}.booking-empty{display:grid;gap:8px}.booking-empty h3{color:#0b1c30}.booking-experience .wizard-choice small{margin-inline-start:10px}\n.booking-preview-image{width:100%;display:grid;place-items:center;cursor:zoom-in}.booking-preview-image img{height:clamp(200px,38vh,430px)}.booking-review-files{display:flex;flex-wrap:wrap;justify-content:end}.booking-review-dialog{width:min(1000px,94vw);max-height:90dvh;margin:auto;border:1px solid #dce3e9;border-radius:14px;padding:18px;background:#fff;color:#0b1c30}.booking-review-dialog::backdrop{background:#0b1c3066}.booking-dialog-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}.booking-dialog-head strong{flex:1;overflow-wrap:anywhere}.booking-dialog-body{height:min(70dvh,750px);overflow:auto;background:#f5f7fa;display:grid;place-items:center}.booking-dialog-body img{max-width:100%;max-height:100%;object-fit:contain}.booking-dialog-body iframe{width:100%;height:100%;border:0}.booking-footer{position:sticky;bottom:0;background:white;z-index:10}.booking-footer button:disabled{opacity:.5;cursor:not-allowed}.booking-experience :is(button,a,input,select,textarea):focus-visible{outline:2px solid #285582;outline-offset:3px}\n@media(max-width:850px){.booking-grid:not([hidden]){grid-template-columns:1fr}.booking-rail{gap:8px}.booking-rail button{flex-direction:column;align-items:start;font-size:13px}.booking-footer{position:static}.booking-dialog-head{flex-wrap:wrap}.booking-programme{grid-template-columns:18px minmax(0,1fr);gap:6px}.booking-programme-fee{grid-column:2}}\n@media(prefers-reduced-motion:reduce){.booking-programme{transition:none}}\n";

const bookingAssistCss=".booking-experience .wizard-panel[data-wizard-section=\"1\"]:has(.booking-nationality-pop,.wizard-destination-popover,[data-testid=\"wizard-destination-popover\"]){position:relative;z-index:11}.booking-nationality{position:relative}.booking-nationality>button{width:100%;text-align:start}.booking-nationality-pop{position:absolute;z-index:45;inset-inline:0;top:100%;padding:8px;background:#fff;border:1px solid #e2e5e9;border-radius:12px;box-shadow:0 12px 32px #0b1c301a}.booking-nationality-pop[data-placement=above]{top:auto;bottom:100%;margin-bottom:4px}.booking-nationality-pop[data-placement=below]{margin-top:4px}.booking-nationality-pop{box-sizing:border-box}.booking-nationality-list{max-height:240px;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;touch-action:pan-y}.booking-nationality-pop input{width:100%;min-width:0}.booking-nationality-list button{display:block;width:100%;text-align:start;padding:9px;border-radius:5px}.booking-nationality-list button:hover,.booking-nationality-list button[aria-pressed=true]{background:#edf2f6}.booking-batch{display:flex!important;justify-content:center;cursor:pointer;margin-bottom:8px}.booking-batch:focus-within{outline:2px solid #0b1c30;outline-offset:2px}.booking-inbox{display:grid;gap:6px;padding:10px 0;border-bottom:1px solid #e2e5e9}.booking-batch-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:4px;align-items:center}.booking-batch-row>span{overflow-wrap:anywhere}.booking-dialog-body[data-zoom=true] img{max-width:none;max-height:none;width:150%;height:auto}@media(max-width:850px){.booking-batch-row{grid-template-columns:minmax(0,1fr) auto}.booking-batch-row>span{grid-column:1/-1}}";

const smartBookingCss = `
.booking-experience .booking-doc-grid[data-single="true"]{grid-template-columns:minmax(0,1fr);gap:0}.booking-experience .booking-doc-grid[data-single="true"] .booking-doc-list{display:none}.booking-experience .booking-doc-grid[data-single="true"] .booking-doc-panel{border-inline-start:0;padding-inline:0}.booking-experience .booking-doc-grid[data-single="true"] .booking-preview{min-height:280px}.booking-experience .booking-duplicate-note{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-block-start:12px;padding:12px 0;border-block-start:1px solid #e2e5e9;color:#87500d}.booking-experience .booking-duplicate-note p{margin:4px 0 0;color:#647182}.booking-experience .booking-duplicate-note a{flex-shrink:0}@media(max-width:600px){.booking-experience .booking-duplicate-note{flex-wrap:wrap}}

.booking-experience .booking-preflight{display:grid;gap:8px;margin-block:10px}.booking-experience .booking-preflight p{margin:0}.booking-experience .booking-preflight .booking-line{align-items:flex-start;gap:12px}.booking-experience .booking-smart-review{display:grid;gap:10px;padding-block:12px;border-block-start:1px solid #e2e5e9;margin-block:12px}
.booking-experience .booking-smart-review .booking-line{align-items:flex-start;gap:16px}
.booking-experience .booking-smart-review .booking-line>div{min-width:0}
.booking-experience .booking-smart-review .booking-line button{flex-shrink:0}
.booking-experience .booking-doc-progress progress{accent-color:#206b52;border:0;height:5px;border-radius:6px;overflow:hidden}
.booking-experience .booking-doc-progress progress::-webkit-progress-bar{background:#e2e5e9}
.booking-experience .booking-doc-progress progress::-webkit-progress-value{background:#206b52;transition:width 180ms ease}
.booking-experience .booking-doc-progress progress::-moz-progress-bar{background:#206b52}
.booking-experience .booking-doc-row{transition:background-color 140ms ease}
@media(prefers-reduced-motion:reduce){.booking-experience .booking-doc-row,.booking-experience .booking-doc-progress progress::-webkit-progress-value{transition:none}}
@media(max-width:600px){.booking-experience .booking-smart-review .booking-line{flex-wrap:wrap}}
`;

/** Advisory only: no OCR, content identification or authentication. */
function checkoutBankRequirement(r:WizardRequirement):boolean{
  return /bank|bancaire|بنك|مصرف|كشف.الحساب/.test(normalize(r.code+" "+r.name));
}
function checkoutBankFilenameMismatch(name:string):boolean{
  const value=normalize(name);
  const explicitBank=/bank|bancaire|releve|statement|كشف.الحساب/.test(value);
  return /passport|passeport|mrz|visa.grant|photo.identite|identity.photo|portrait|صورة.شخصية/.test(value)||(!explicitBank&&/(^|[^a-z])photo([^a-z]|$)|صورة/.test(value));
}
function checkoutPortraitLike(width:number,height:number):boolean{
  return width>0&&height>0&&width/height>=0.68&&width/height<=0.9&&Math.max(width,height)<=1100;
}
function checkoutFormatMismatch(file:File):boolean{
  const extension=file.name.split(".").pop()?.toLowerCase();
  const type=file.type.toLowerCase();
  const expected:Record<string,string[]>={pdf:["application/pdf"],jpg:["image/jpeg","image/jpg"],jpeg:["image/jpeg","image/jpg"],png:["image/png"],webp:["image/webp"],doc:["application/msword"],docx:["application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/zip"]};
  return Boolean(extension&&expected[extension]&&type&&type!=="application/octet-stream"&&!expected[extension].includes(type));
}

function CheckoutIcon({kind}:{kind:"edit"|"expand"|"file"}){
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{kind==="edit"?<><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></>:kind==="expand"?<path d="M14 4h6v6M20 4l-6 6M10 20H4v-6M4 20l6-6"/>:<><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/></>}</svg>;
}
function CheckoutThumbnail({file,active}:{file:File;active:boolean}){
  const [url,setUrl]=useState("");
  const image=/^image\/(jpeg|png|webp)$/.test(file.type);
  useEffect(()=>{if(!active||!image){setUrl("");return;}const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next)},[file,active,image]);
  const extension=(file.name.split(".").pop()??"").slice(0,5).toUpperCase();
  return <span className="checkout-thumb" aria-hidden="true">{image&&url?<img src={url} alt="" loading="lazy" decoding="async"/>:<span className="checkout-file-glyph"><svg viewBox="0 0 48 60" width="42" height="52" fill="none"><path d="M7 2h24l10 10v46H7z" fill="#fff" stroke="#a9b8c5" strokeWidth="1.4"/><path d="M31 2v11h10M14 23h20M14 30h20M14 37h16" stroke="#a9b8c5" strokeWidth="1.4" strokeLinecap="round"/></svg><span>{extension||"FILE"}</span></span>}</span>;
}
const checkoutCss = `
.booking-experience .checkout-review{gap:14px;align-content:start}
.booking-experience .checkout-heading{display:grid;gap:3px}
.booking-experience .checkout-heading h2{font-size:clamp(22px,2vw,29px)!important;line-height:1.25;letter-spacing:-.025em}
.booking-experience .checkout-ticket{display:grid;grid-template-columns:112px minmax(0,1fr) auto;gap:18px;align-items:center;padding:12px;background:#fff;border:1px solid #e0e6ec;border-radius:14px}
.booking-experience .checkout-ticket-image{width:112px;height:86px;overflow:hidden;background:#edf1f5;border-radius:8px}
.booking-experience .checkout-ticket-image img{width:100%;height:100%;object-fit:cover}
.booking-experience .checkout-ticket-info,.booking-experience .checkout-traveller-info{display:grid;gap:3px;min-width:0;overflow-wrap:anywhere}
.booking-experience .checkout-ticket-info h3{font-size:23px!important;line-height:1.25}
.booking-experience .checkout-ticket-info>span,.booking-experience .checkout-traveller-info>span{color:#647182;font-size:15px}
.booking-experience .checkout-edit{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:8px 11px;border-radius:9px;color:#285582;white-space:nowrap;transition:background-color 160ms ease,color 160ms ease}
.booking-experience .checkout-edit:hover{background:#edf2f6;color:#0b1c30}
.booking-experience .checkout-edit:disabled,.booking-experience .checkout-document-preview:disabled{opacity:.55;cursor:not-allowed}
.booking-experience .checkout-traveller{display:flex;align-items:center;gap:14px;padding:8px 12px}
.booking-experience .checkout-avatar{flex:none;width:46px;height:46px;border-radius:50%;background:#eaf0f5;color:#0b1c30;display:grid;place-items:center;font-size:16px;font-weight:600}
.booking-experience .checkout-traveller-info{flex:1}
.booking-experience .checkout-traveller-info strong{font-size:19px;font-weight:600}
.booking-experience .checkout-review .booking-duplicate-note{margin:0;padding:10px 14px;border:0;border-inline-start:3px solid #aa762a;background:#faf7f1;border-radius:7px;align-items:center}
.booking-experience .checkout-review .booking-duplicate-note .booking-link{text-decoration:none}
.booking-experience .checkout-documents{display:grid;gap:8px;min-width:0}
.booking-experience .checkout-doc-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.booking-experience .checkout-doc-heading h3{flex:1;min-width:fit-content;font-size:19px!important}
.booking-experience .checkout-count{color:#21684f;font-size:15px;font-variant-numeric:tabular-nums}
.booking-experience .checkout-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,170px),1fr));gap:10px;align-items:start;max-height:clamp(230px,38vh,390px);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:3px 4px 5px}
.booking-experience .checkout-document{border:1px solid #e0e6ec;border-radius:11px;min-width:0;padding:8px;display:grid;gap:6px}
.booking-experience .checkout-document[data-flagged=true]{border-color:#bc9259}
.booking-experience .checkout-document-label{display:grid;gap:1px;overflow-wrap:anywhere}
.booking-experience .checkout-document-label strong{font-weight:600;font-size:15px}
.booking-experience .checkout-document-label>span{font-size:13px}
.booking-experience .checkout-document-preview,.booking-experience .checkout-missing{display:grid;gap:6px;min-width:0;width:100%;text-align:start;border-radius:7px;cursor:pointer}
.booking-experience .checkout-thumb{height:94px;display:grid;place-items:center;background:#f3f5f7;overflow:hidden;border-radius:7px;transition:background-color 160ms ease}
.booking-experience .checkout-thumb img{max-width:100%;max-height:94px;object-fit:contain;transition:transform 180ms ease}
.booking-experience .checkout-document-preview:hover .checkout-thumb{background:#e9eef3}
.booking-experience .checkout-document-preview:hover .checkout-thumb img{transform:scale(1.04)}
.booking-experience .checkout-file-glyph{position:relative;display:grid;place-items:center}
.booking-experience .checkout-file-glyph>span{position:absolute;bottom:0;inset-inline-end:-8px;background:#e0e8ef;color:#344457;border-radius:3px;padding:1px 4px;font-size:10px;font-weight:600}
.booking-experience .checkout-file-caption{display:flex;align-items:center;gap:6px;font-size:13px;color:#344457;min-height:25px}
.booking-experience .checkout-file-caption>span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.booking-experience .checkout-file-caption svg{flex:none;color:#647182}
.booking-experience .checkout-missing{min-height:94px;place-items:center;align-content:center;background:#f5f7f9;color:#647182;padding:8px;text-align:center}
.booking-experience .checkout-verify{margin-inline:4px}
.booking-experience .checkout-review .booking-smart-review{margin:0;padding:8px 10px;border:0;border-inline-start:3px solid #aa762a;background:#faf7f1;border-radius:7px;gap:5px}
.booking-experience .checkout-payment{position:sticky;top:90px;gap:14px}
@media(max-width:850px){.booking-experience .checkout-payment{position:static}.booking-experience .checkout-gallery{max-height:none;overflow:visible;scrollbar-gutter:auto}.booking-experience .checkout-ticket{grid-template-columns:72px minmax(0,1fr) auto;gap:10px}.booking-experience .checkout-ticket-image{width:72px;height:70px}.booking-experience .checkout-edit span{display:none}.booking-experience .checkout-edit{min-width:44px;padding:8px}.booking-experience .checkout-doc-heading{gap:6px}.booking-experience .checkout-count{font-size:13px}}
@media(prefers-reduced-motion:reduce){.booking-experience .checkout-edit,.booking-experience .checkout-thumb,.booking-experience .checkout-thumb img{transition:none}.booking-experience .checkout-document-preview:hover .checkout-thumb img{transform:none}}

/* Checkout revision 02: scoped to confirmation; intrinsic sizing must not leak from global button styles. */
.booking-experience .booking-grid[data-wizard-section="3"]:not([hidden]){grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:clamp(24px,3vw,44px);align-items:start}
.booking-experience .checkout-review{min-width:0;gap:18px}
.booking-experience .checkout-heading h2{font-size:20px!important;font-weight:600;letter-spacing:-.015em}
.booking-experience .checkout-ticket{border:0;border-bottom:1px solid #e2e5e9;border-radius:0;padding:4px 0 16px;grid-template-columns:64px minmax(0,1fr) auto;gap:14px}
.booking-experience .checkout-ticket-image{display:grid;place-items:center;width:64px;height:64px;background:#f3f5f7;color:#647182;border-radius:10px}
.booking-experience .checkout-ticket-info h3{font-size:23px!important;font-weight:600}
.booking-experience .checkout-programme{font-size:16px;font-weight:600;overflow-wrap:anywhere}
.booking-experience .checkout-traveller{padding:0;min-width:0}
.booking-experience .checkout-traveller-info strong{font-size:19px;font-weight:600}
.booking-experience .checkout-review .booking-duplicate-note{padding:8px 0 12px;background:transparent;border:0;border-bottom:1px solid #e2e5e9;border-radius:0;gap:8px;flex-wrap:wrap}
.booking-experience .checkout-review .booking-duplicate-note p{font-size:14px;margin:2px 0 0}
.booking-experience .checkout-documents{gap:12px;min-width:0}
.booking-experience .checkout-doc-heading h3{font-weight:600;min-width:0;flex:1 1 auto}
.booking-experience .checkout-count{color:#647182}
.booking-experience .checkout-attention{display:grid;gap:3px;padding:9px 12px;border-inline-start:2px solid #aa762a;background:#faf7f1;color:#85551c;border-radius:4px;overflow-wrap:anywhere}
.booking-experience .checkout-attention strong{font-size:15px;font-weight:600}
.booking-experience .checkout-attention small{color:#647182;font-size:13px}
.booking-experience .checkout-gallery{grid-template-columns:repeat(auto-fit,minmax(min(100%,185px),1fr));gap:12px;align-items:start;max-height:none;overflow:visible;scrollbar-gutter:auto;padding:0;min-width:0}
.booking-experience .checkout-gallery[data-single=true]{grid-template-columns:minmax(0,300px)}
.booking-experience .checkout-document{grid-template-columns:minmax(0,1fr);box-sizing:border-box;min-inline-size:0;max-inline-size:100%;width:100%;gap:9px;padding:10px;border-radius:9px}
.booking-experience .checkout-document[data-flagged=true]{border-color:#dfc9aa}
.booking-experience .checkout-document-label{grid-template-columns:minmax(0,1fr);gap:4px;min-width:0}
.booking-experience .checkout-document-label strong{font-size:16px;line-height:1.35}
.booking-experience .checkout-document-label>span{display:flex;align-items:center;gap:6px;font-size:13px}
.booking-experience .checkout-status-dot{width:7px;height:7px;flex:none;border-radius:50%;background:currentColor}
.booking-experience .checkout-document-preview,.booking-experience .checkout-missing{display:grid;grid-template-columns:minmax(0,1fr);box-sizing:border-box;width:100%;min-width:0!important;max-width:100%;padding:0;border:0;background:transparent;white-space:normal;overflow:hidden}
.booking-experience .checkout-thumb{width:100%;min-width:0;max-width:100%;height:112px;grid-template-columns:minmax(0,1fr);overflow:hidden}
.booking-experience .checkout-thumb img{width:100%;height:112px;max-width:100%;max-height:112px;object-fit:contain}
.booking-experience .checkout-file-glyph{justify-self:center}
.booking-experience .checkout-file-caption{display:grid;grid-template-columns:minmax(0,1fr) 18px;min-width:0;max-width:100%;width:100%;text-align:start}
.booking-experience .checkout-file-caption>span{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.booking-experience .checkout-file-caption svg{width:18px;height:18px}
.booking-experience .checkout-missing{min-height:112px;background:#f3f5f7;padding:10px;justify-items:center}
.booking-experience .checkout-document-warning{font-size:13px;color:#85551c;overflow-wrap:anywhere;line-height:1.4}
.booking-experience .checkout-document-warning summary{cursor:pointer}
.booking-experience .checkout-document-warning p{margin:5px 0 0}
.booking-experience .checkout-replace{display:flex;gap:6px;align-items:center;justify-content:center;min-height:44px;border-top:1px solid #e2e5e9;color:#285582;font-size:14px;cursor:pointer;position:relative;text-align:center}
.booking-experience .checkout-replace svg{width:15px;height:15px;flex:none}
.booking-experience .checkout-replace:hover{background:#f3f5f7}
.booking-experience .checkout-replace:focus-within{outline:2px solid #285582;outline-offset:2px}
.booking-experience .checkout-replace[data-disabled=true]{opacity:.55;cursor:not-allowed}
.booking-experience .checkout-verify{margin:0;overflow-wrap:anywhere}
.booking-experience .checkout-payment{min-width:0;align-self:start;font-variant-numeric:tabular-nums}
.booking-experience .checkout-payment .booking-line{gap:10px;flex-wrap:wrap}
.booking-experience .checkout-payment .booking-line strong{white-space:nowrap}
.booking-experience .checkout-dialog-navigation{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
@media(max-width:850px){.booking-experience .booking-grid[data-wizard-section="3"]:not([hidden]){grid-template-columns:minmax(0,1fr);gap:24px}.booking-experience .checkout-payment{position:static}.booking-experience .checkout-ticket{grid-template-columns:52px minmax(0,1fr) auto;gap:10px}.booking-experience .checkout-ticket-image{width:52px;height:52px}.booking-experience .checkout-gallery{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}}
@media(max-width:360px){.booking-experience .checkout-gallery{grid-template-columns:minmax(0,1fr)}}

/* Revision 03 — final signature, confirmation only. */
.booking-experience .checkout-ticket{grid-template-columns:minmax(0,1fr) auto;gap:12px}
.booking-experience .checkout-country-name{display:flex;align-items:center;gap:10px;flex-wrap:wrap;overflow-wrap:anywhere}
.booking-experience .checkout-country-code{font-size:19px;line-height:1;flex:none;font-family:"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif}
.booking-experience .checkout-attention{display:block;background:transparent;padding:0;border:0;border-radius:0;color:#85551c}
.booking-experience .checkout-attention summary{display:flex;align-items:center;gap:8px;cursor:pointer;min-height:34px;font-size:14px;font-weight:600;list-style:none}
.booking-experience .checkout-attention summary::-webkit-details-marker{display:none}
.booking-experience .checkout-attention summary::after{content:"";width:7px;height:7px;border-inline-end:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);margin-inline-start:4px;flex:none}
.booking-experience .checkout-attention[open] summary::after{transform:rotate(225deg)}
.booking-experience .checkout-attention small{display:block;margin-inline-start:15px;padding-block-end:6px}
.booking-experience .checkout-attention-dot{width:7px;height:7px;border-radius:50%;background:#a66a28;flex:none}
.booking-experience .checkout-gallery{align-items:stretch}
.booking-experience .checkout-document{display:flex;flex-direction:column;align-items:stretch;height:100%;min-height:0}
.booking-experience .checkout-document-label{min-height:48px;align-content:start}
.booking-experience .checkout-document-preview,.booking-experience .checkout-missing{flex:none}
.booking-experience .checkout-document-warning{margin-block:0;font-size:13px}
.booking-experience .checkout-document-warning summary{min-height:30px;line-height:1.4}
.booking-experience .checkout-document-warning p{padding-inline-start:10px}
.booking-experience .checkout-replace{margin-block-start:auto;padding-block:7px;flex:none}
.booking-experience .booking-footer[data-step="3"]{position:static;inset:auto;z-index:auto}
.booking-experience .booking-footer[data-step="3"] small:empty{display:none}
.booking-experience .checkout-doc-heading,.booking-experience .checkout-dialog-navigation{min-width:0}
.booking-experience .checkout-dialog-navigation button{min-width:0;max-width:100%}
.booking-experience .booking-review-dialog .booking-dialog-head strong{min-width:0}
.booking-experience .checkout-document-warning summary:focus-visible,.booking-experience .checkout-attention summary:focus-visible{outline:2px solid #285582;outline-offset:3px}
@media(max-width:850px){.booking-experience .checkout-ticket{grid-template-columns:minmax(0,1fr) auto}.booking-experience .checkout-doc-heading{row-gap:2px}.booking-experience .checkout-dialog-navigation{flex-wrap:wrap}.booking-experience .checkout-country-code{font-size:18px}}
@media(max-width:480px){.booking-experience .checkout-gallery{grid-template-columns:minmax(0,1fr)}.booking-experience .checkout-gallery[data-single=true]{grid-template-columns:minmax(0,1fr)}.booking-experience .checkout-document-label{min-height:0}.booking-experience .checkout-payment .booking-price{overflow-wrap:anywhere}.booking-experience .checkout-dialog-navigation{width:100%;justify-content:space-between}}
`;
