import { CancellationActions, CancellationPanel } from "@/components/cancellation-panel";
import { listApplicationCancellations } from "@/lib/application-cancellations";
import { configName } from "@/lib/config-localization";
import Link from "next/link";
import { notFound } from "next/navigation";
import { portalPageUser } from "@/lib/page-auth";
import { getApplicationDetail, getEmbassyApplicability, agencyFocusQueue } from "@/lib/queries";
import {
  getChecklist,
  getDecisionDocuments,
  getStatusHistory,
} from "@/lib/applications";
import { groupDocumentsForDisplay, listApplicantsForApplication, listDocumentsForApplication } from "@/lib/documents";
import { listDocumentRequests } from "@/lib/document-requests";
import { findTransactionByApplication } from "@/lib/wallet";
import { listCommunications } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { getUiLocale, localizedDocTypeName, localizedDocStatus, localizedStatusName } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";
import { getApplicationPricing } from "@/lib/price-adjustments";
import { PriceAdjustmentHistory } from "@/components/application-detail";
import { ReconciliationWarning } from "@/components/reconciliation-warning";
import { formatAmount, formatProcessingDays, bytes } from "@/lib/format";
import { nationalityLabel } from "@/lib/nationalities";
import { buildProgress } from "@/lib/progress";
import { Card, CardHeader, Flash, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import {
  CommunicationsPanel,
} from "@/components/application-detail";
import { uploadDocumentAction } from "@/app/actions/documents";
import { SmartDocumentUpload, DocumentUploadNotice } from "../smart-document-upload";
import { resolveRequestItem } from "../document-action-model";
import { safeCaseReturn, detailLink, processingDuration, caseDateTime, usableCaseDocument } from "../case-workspace";
import { CopyCaseReference } from "../copy-case-reference";
import { hasPermission } from "@/lib/rbac";
import { DocumentViewerProvider, DocumentPreviewButton } from "../document-viewer";
import { DocumentWorkspace, type DocumentWorkspaceEntry } from "../document-workspace";
import { LiveCaseDuration } from "../live-case-duration";
import { readCaseVfsReference } from "@/lib/case-vfs-reference";
import { CaseMessagesRead } from "../case-messages-read";
import { CaseNavigation } from "../case-navigation";
import { SmartTimeline } from "../smart-timeline";
import { JourneyMotion } from "../journey-motion";
import { HomeCaseVisit } from "../../home-case-tools";
import { db } from "@/lib/db";
import { notifications } from "@/db/schema";
import { and, count, eq, isNull } from "drizzle-orm";
import "../cases.css";
import "./dossier.css";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents" },
  { id: "messages", label: "Messages" },
  { id: "activity", label: "Activity" },
];

export default async function PortalApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const requestedTab = sp.tab === "communications" ? "messages" : sp.tab;
  const tab = typeof requestedTab === "string" && TABS.some((t) => t.id === requestedTab) ? requestedTab : "overview";
  const user = await portalPageUser();
  const detail = await getApplicationDetail(id, user);
  if (!detail) notFound();
  const app = detail.app;
  const isDraft=detail.statusCode==="DRAFT";
  const terminal=detail.isTerminal||["APPROVED","REJECTED","CANCELLED","COMPLETED","REFUSED"].includes(detail.statusCode);
  const canUpload=hasPermission(user,"documents.upload.own")&&!terminal;
  const back = `/portal/applications/${id}`;
  const returnTo=safeCaseReturn(sp.returnTo);
  const returnSuffix=returnTo==="/portal/applications"?"":"&returnTo="+encodeURIComponent(returnTo);

  const [applicants, docs, checklist, history, messages, charge, decisionDocs, docRequests,cancellations,embassyApplicability,pricing,uiLocale,vfsReference,unreadRows] =
    await Promise.all([
      listApplicantsForApplication(id),
      tab==="overview"||tab==="documents"?listDocumentsForApplication(id):Promise.resolve([]),
      tab==="overview"||tab==="documents"?getChecklist(id):Promise.resolve([]),
      tab==="overview"||tab==="activity"?getStatusHistory(id):Promise.resolve([]),
      tab==="messages"||tab==="activity"?listCommunications(id,user,tab==="messages"?sp.messagesBefore:undefined):Promise.resolve([]),
      tab==="overview"||sp.submitted==="1"?findTransactionByApplication(id):Promise.resolve(null),
      tab==="overview"&&["APPROVED","REJECTED"].includes(detail.statusCode)?getDecisionDocuments(id):Promise.resolve([]),
      listDocumentRequests(id),
      listApplicationCancellations(id,user),
      tab==="overview"?getEmbassyApplicability(app.visaTypeId,app.visaRuleSnapshot):Promise.resolve(null),
      app.submittedAt?getApplicationPricing(id):Promise.resolve(null),
      getUiLocale(sp),
      tab==="overview"&&detail.countryIso2==="CN"?readCaseVfsReference(id,user):Promise.resolve(null),
      db.select({total:count()}).from(notifications).where(and(eq(notifications.userId,user.id),eq(notifications.agencyId,user.agencyId),eq(notifications.applicationId,id),eq(notifications.type,"MESSAGE_POSTED"),isNull(notifications.readAt))),
    ]);
  // §17 — progress is derived from the persisted history, and the embassy
  // stage only appears when the programme declares it (or the file went there).
  const progress = embassyApplicability===null?[]:buildProgress({
    statusCode: detail.statusCode,
    history: history.map((h) => ({ toStatusCode: h.toStatus.code, createdAt: h.history.createdAt })),
    embassyApplicability,
  });
  const flash = flashFrom(sp);
  const ct = contentT(uiLocale);
  const visaDisplayName = configName({ name: app.visaTypeName, nameFr: detail.visaNameFr, nameAr: detail.visaNameAr }, uiLocale);


  const applicant = applicants[0];
  const applicantName = applicant?.fullName || (applicant ? `${applicant.firstName} ${applicant.lastName}`.trim() : "—");
  const applicantNationality = applicant?.nationality ?? "—";

  const openRequests = docRequests.filter((r) => r.req.status === "OPEN");
  const focusMode=new URL(returnTo,"https://local.invalid").searchParams.get("work")==="1"&&hasPermission(user,"documents.upload.own");
  const focusQueue=focusMode?await agencyFocusQueue(user,{id,createdAt:app.createdAt}):null;
  const focusNext=focusQueue?.nextId?detailLink(focusQueue.nextId,returnTo)+"&tab=documents":returnTo;
  // Grouping is shared with the staff dossier: a document that is not linked to a
  // checklist requirement is still listed (never invisible) instead of vanishing
  // from the agency's own view of its dossier.
  const documentGroups = groupDocumentsForDisplay(checklist, docs);

  const elapsed=processingDuration(app.submittedAt,app.decisionAt,app.completedAt,terminal);
  const copy={
   fr:{back:"Tous les dossiers",copy:"Copier la référence",copied:"Référence copiée",failed:"Copie indisponible",tracking:"Suivi du dossier",elapsed:"Temps écoulé",duration:"Durée enregistrée",estimate:"Délai indicatif",noAction:"Aucune action requise de votre agence.",official:"Décision officielle",download:"Télécharger",billing:"Facturation",submitted:"Soumis le",activity:"Activité du dossier",noHistory:"Aucun événement enregistré."},
   en:{back:"All cases",copy:"Copy reference",copied:"Reference copied",failed:"Copy unavailable",tracking:"Case tracking",elapsed:"Elapsed time",duration:"Recorded duration",estimate:"Indicative timeframe",noAction:"No action required from your agency.",official:"Official decision",download:"Download",billing:"Billing",submitted:"Submitted on",activity:"Case activity",noHistory:"No events recorded."},
   ar:{back:"جميع الطلبات",copy:"نسخ المرجع",copied:"تم نسخ المرجع",failed:"النسخ غير متاح",tracking:"متابعة الطلب",elapsed:"الوقت المنقضي",duration:"المدة المسجلة",estimate:"المدة التقديرية",noAction:"لا يلزم أي إجراء من وكالتكم.",official:"القرار الرسمي",download:"تنزيل",billing:"الفوترة",submitted:"تاريخ التقديم",activity:"نشاط الطلب",noHistory:"لا توجد أحداث مسجلة."}
  }[uiLocale];

  const dc={fr:{required:"Pièces requises",optional:"Autres pièces",other:"Documents annexes",requests:"Historique des demandes",accepted:"pièces acceptées",received:"pièces requises reçues",actions:"demandes ouvertes",missing:"pièces manquantes",versions:"Versions précédentes",details:"Informations du fichier",inactive:"Exigence inactive",noFile:"Aucun fichier",decision:"Documents de décision",files:"fichiers",treated:"demandes clôturées",closed:"Aucune action requise.",locked:"Les documents soumis sont verrouillés. Seuls les remplacements ou compléments demandés peuvent être envoyés.",unavailable:"Aucune action de téléversement disponible.",draft:"Complétez les pièces requises avant soumission.",request:"Demande ESSAFARIA",current:"Version actuelle"},en:{required:"Required documents",optional:"Other requirements",other:"Additional files",requests:"Request history",accepted:"documents accepted",received:"required documents received",actions:"open requests",missing:"missing documents",versions:"Previous versions",details:"File information",inactive:"Inactive requirement",noFile:"No file",decision:"Decision documents",files:"files",treated:"closed requests",closed:"No action required.",locked:"Submitted documents are locked. Only requested replacements or additional files may be uploaded.",unavailable:"No upload action available.",draft:"Complete required documents before submission.",request:"ESSAFARIA request",current:"Current version"},ar:{required:"الوثائق المطلوبة",optional:"متطلبات أخرى",other:"وثائق إضافية",requests:"سجل طلبات الوثائق",accepted:"وثائق مقبولة",received:"وثائق مطلوبة مستلمة",actions:"طلبات مفتوحة",missing:"وثائق ناقصة",versions:"الإصدارات السابقة",details:"معلومات الملف",inactive:"متطلب غير نشط",noFile:"لا يوجد ملف",decision:"وثائق القرار",files:"ملفات",treated:"طلبات مغلقة",closed:"لا يلزم أي إجراء.",locked:"الوثائق المقدمة مقفلة. يمكن رفع البدائل أو الوثائق الإضافية المطلوبة فقط.",unavailable:"لا يتوفر إجراء رفع.",draft:"أكمل الوثائق المطلوبة قبل تقديم الطلب.",request:"طلب ESSAFARIA",current:"الإصدار الحالي"}}[uiLocale];
  const docLabel=(code:string,name:string)=>(code==="MARRIAGE_CERTIFICATE"||/^marriage certificate$/i.test(name.trim()))?({fr:"Acte de mariage",en:"Marriage certificate",ar:"عقد الزواج"}[uiLocale]):(code==="TRAVEL_INSURANCE"||/^travel insurance$/i.test(name.trim()))?({fr:"Assurance voyage",en:"Travel insurance",ar:"تأمين السفر"}[uiLocale]):code==="INVITATION_LETTER"?({fr:"Lettre d’invitation",en:"Invitation letter",ar:"خطاب الدعوة"}[uiLocale]):localizedDocTypeName(code,name,uiLocale);
  const requestItem=(r:typeof openRequests[number])=>resolveRequestItem(checklist,r.req);
  const requestFor=(item:typeof checklist[number])=>openRequests.filter(r=>requestItem(r)===item.id);
  const latestFor=(item:typeof checklist[number])=>documentGroups.byItem.get(item.id)?.[0]?.doc;
  const requiredItems=checklist.filter(item=>item.active&&item.required);
  const otherItems=checklist.filter(item=>!item.active||!item.required);
  const acceptedCount=requiredItems.filter(item=>latestFor(item)?.status==="ACCEPTED"&&!requestFor(item).length).length;
  const receivedCount=requiredItems.filter(item=>usableCaseDocument(latestFor(item)?.status,requestFor(item).length>0)).length;
  const missingCount=requiredItems.filter(item=>!latestFor(item)&&!requestFor(item).length).length;
  const orderItems=(items:typeof checklist)=>[...items].sort((a,b)=>Number(!usableCaseDocument(latestFor(b)?.status,requestFor(b).length>0))-Number(!usableCaseDocument(latestFor(a)?.status,requestFor(a).length>0)));
  const decisionRows=documentGroups.unassigned.filter(r=>["DECISION_VISA_APPROVAL","DECISION_REFUSAL_LETTER"].includes(r.documentTypeCode));
  const annexRows=documentGroups.unassigned.filter(r=>!["DECISION_VISA_APPROVAL","DECISION_REFUSAL_LETTER"].includes(r.documentTypeCode));
  const closedRequests=docRequests.filter(r=>r.req.status!=="OPEN");

  const adaptive={
    fr:{action:"À compléter",actions:"Documents à compléter",go:"Compléter",open:"Consulter",draft:"Complétez votre dossier",detail:"Informations du voyageur",wallet:"Consulter le portefeuille",docs:"Consulter les documents",accepted:"Acceptées",received:"Reçues",statusDate:"Dernier changement de statut",activityDate:"Dernière activité connue",journey:"Suivi de votre visa",request:"Document complémentaire demandé",replacement:"Remplacement demandé",receivedEvent:"Document reçu",conversation:"Équipe ESSAFARIA"},
    en:{action:"To complete",actions:"Documents to complete",go:"Complete",open:"View",draft:"Complete your case",detail:"Traveller information",wallet:"View wallet",docs:"View documents",accepted:"Accepted",received:"Received",statusDate:"Last status change",activityDate:"Latest known activity",journey:"Your visa journey",request:"Additional document requested",replacement:"Replacement requested",receivedEvent:"Document received",conversation:"ESSAFARIA team"},
    ar:{action:"مطلوب استكماله",actions:"وثائق تحتاج إلى استكمال",go:"استكمال",open:"عرض",draft:"استكمل طلبك",detail:"معلومات المسافر",wallet:"عرض المحفظة",docs:"عرض الوثائق",accepted:"مقبولة",received:"مستلمة",statusDate:"آخر تغيير للحالة",activityDate:"آخر نشاط معروف",journey:"متابعة التأشيرة",request:"طلب وثيقة إضافية",replacement:"طلب استبدال وثيقة",receivedEvent:"تم استلام الوثيقة",conversation:"فريق ESSAFARIA"}
  }[uiLocale];
  const journeyUi={
    fr:{title:"Parcours du dossier",history:"Historique complet",closed:"Dossier clôturé",waiting:"Une action de votre agence est nécessaire",active:"État actuel",checking:"Vérification",submitted:"Soumission",current:"Étape actuelle",upcoming:"À venir",unrecorded:"Date non enregistrée",recorded:"Étape enregistrée"},
    en:{title:"Case journey",history:"Full history",closed:"Case closed",waiting:"Your agency needs to take action",active:"Current status",checking:"Verification",submitted:"Submission",current:"Current stage",upcoming:"Upcoming",unrecorded:"Date not recorded",recorded:"Recorded stage"},
    ar:{title:"مسار الطلب",history:"السجل الكامل",closed:"تم إغلاق الطلب",waiting:"يلزم إجراء من وكالتكم",active:"الحالة الحالية",checking:"التحقق",submitted:"الإيداع",current:"المرحلة الحالية",upcoming:"لاحقًا",unrecorded:"التاريخ غير مسجل",recorded:"مرحلة مسجلة"}
  }[uiLocale];
  const firstRequest=openRequests[0];
  const actionHref=`${back}?tab=documents${returnSuffix}${firstRequest?"#request-"+firstRequest.req.id:""}`;
  const requestTitle=firstRequest?docLabel(firstRequest.docTypeCode,firstRequest.docTypeName):undefined;
  const activityEvents=[
    ...history.map(h=>({key:"status-"+h.history.id,at:h.history.createdAt,kind:"status" as const,title:localizedStatusName(h.toStatus.code,h.toStatus.name,uiLocale),code:h.toStatus.code,reason:h.history.reason?(h.toStatus.code==="SUBMITTED"&&h.history.reason==="Request submitted"?ct("Request submitted"):h.history.reason):null,href:null as string|null})),
    ...docRequests.flatMap(r=>{
      const title=docLabel(r.docTypeCode,r.docTypeName);
      const anchor=r.req.status==="OPEN"?"#request-"+r.req.id:r.req.checklistItemId?"#item-"+r.req.checklistItemId:"";
      const href=`${back}?tab=documents${returnSuffix}${anchor}`;
      return [{key:"request-"+r.req.id,at:r.req.createdAt,kind:"request" as const,title:r.req.type==="REPLACEMENT"?adaptive.replacement:adaptive.request,code:"RESUBMISSION_REQUIRED",reason:title+(r.req.reason?" · "+r.req.reason:""),href},...(r.req.fulfilledAt?[{key:"received-"+r.req.id,at:r.req.fulfilledAt,kind:"received" as const,title:adaptive.receivedEvent,code:"UPLOADED",reason:title,href}]:[])];
    }),
    ...messages.map(({message})=>({key:"message-"+message.id,at:message.createdAt,kind:"message" as const,title:({fr:"Message échangé",en:"Message exchanged",ar:"تم تبادل رسالة"}[uiLocale]),code:"MESSAGE",reason:null,href:`${back}?tab=messages${returnSuffix}`}))
  ].sort((a,b)=>b.at.getTime()-a.at.getTime()||a.key.localeCompare(b.key));
  const latestKnown=detail.caseActivity??app.updatedAt;
  const activityLink=(key?:string)=>`${back}?tab=activity${returnSuffix}${key?"&event="+encodeURIComponent(key):""}`;
  const stageCodes={submitted:["SUBMITTED"],documents:["DOCUMENTS_CHECKING","DOCUMENTS_REQUESTED"],processing:["IN_PROCESS"],embassy:["EMBASSY_SENT","EMBASSY_SUBMISSION"],decision:["APPROVED","REJECTED","COMPLETED","REFUSED"]};
  const latestMillis=typeof latestKnown==="string"?Date.parse(latestKnown):latestKnown.getTime();
  const latestEvent=activityEvents.find(e=>e.at.getTime()===latestMillis);
  const overviewUi={
    fr:{elapsed:"Temps écoulé (calendaire)",duration:"Durée réelle (calendaire)",pending:"en attente de validation",accepted:"acceptées",missing:"non reçues",view:"Consulter"},
    en:{elapsed:"Elapsed time (calendar)",duration:"Actual duration (calendar)",pending:"awaiting review",accepted:"accepted",missing:"not received",view:"View"},
    ar:{elapsed:"الوقت المنقضي (تقويمي)",duration:"المدة الفعلية (تقويمية)",pending:"بانتظار التحقق",accepted:"مقبولة",missing:"غير مستلمة",view:"عرض"}
  }[uiLocale];
  const pendingCount=Math.max(0,receivedCount-acceptedCount);
  const outstandingCount=Math.max(0,requiredItems.length-receivedCount);
  const acceptedItem=requiredItems.find(item=>latestFor(item)?.status==="ACCEPTED"&&!requestFor(item).length);
  const pendingItem=requiredItems.find(item=>usableCaseDocument(latestFor(item)?.status,requestFor(item).length>0)&&latestFor(item)?.status!=="ACCEPTED");
  const outstandingItem=requiredItems.find(item=>!usableCaseDocument(latestFor(item)?.status,requestFor(item).length>0));
  const docLink=(item?:typeof checklist[number])=>`${back}?tab=documents${returnSuffix}${item?"#item-"+item.id:""}`;
  const countPercent=(n:number)=>requiredItems.length?100*n/requiredItems.length:0;
  const existingFiles=docs.map(({doc,documentTypeName})=>({name:doc.originalFilename,size:doc.sizeBytes,sha256:doc.sha256,label:documentTypeName}));
  const fileMeta=(doc:typeof docs[number]["doc"])=>({id:doc.id,name:doc.originalFilename,mime:doc.mimeType,version:doc.version,size:bytes(doc.sizeBytes),date:caseDateTime(doc.createdAt,uiLocale)});
  const entryForItem=(item:typeof checklist[number],group:"required"|"other"):DocumentWorkspaceEntry=>{
    const itemDocs=documentGroups.byItem.get(item.id)??[],latest=itemDocs[0]?.doc,requests=requestFor(item),requested=requests.length>0;
    const title=docLabel(item.documentTypeCode,item.documentTypeName);
    return {key:"item-"+item.id,group,title,filename:latest?.originalFilename??dc.noFile,statusCode:requested?"RESUBMISSION_REQUIRED":latest?.status??"MISSING",status:requested?ct("Action required"):latest?localizedDocStatus(latest.status,uiLocale,latest.status):ct("Missing"),priority:requested||(!terminal&&isDraft&&item.active&&item.required&&!usableCaseDocument(latest?.status,false)),file:latest?fileMeta(latest):undefined,
      required:item.active&&item.required,uploadable:isDraft&&canUpload&&item.active&&!requested,content:<div className="r09-inspector-extra"><span id={`checklist-document-label-${item.id}`} className="sr-only">{title}</span>
      {!item.active?<p>{dc.inactive}</p>:null}
      {item.notes&&!requested?<details className="r08-details"><summary>{ct("Reason")}</summary><p>{item.notes}</p></details>:null}
      {itemDocs.length>1?<details className="r08-details"><summary>{dc.versions} ({itemDocs.length-1})</summary>{itemDocs.slice(1).map(({doc})=><div className="r09-version" key={doc.id}><span><bdi>v{doc.version} · {caseDateTime(doc.createdAt,uiLocale)}</bdi><br/><bdi>{doc.originalFilename}</bdi></span><DocumentPreviewButton id={doc.id} locale={uiLocale}/></div>)}</details>:null}
      {isDraft && canUpload && item.active && !requested ? (
                      <form action={uploadDocumentAction} encType="multipart/form-data" className="r08-upload">
                        <input type="hidden" name="applicationId" value={id} />
                        <input type="hidden" name="checklistItemId" value={item.id} />
                        <input type="hidden" name="back" value={`${back}?tab=documents${returnSuffix}`} />
                        <SmartDocumentUpload locale={uiLocale} label={title} existingFiles={existingFiles} submitLabel={latest ? ct("Replace") : ct("Upload")} />
                      </form> ) : null}
      </div>};
  };
  const requestEntries:DocumentWorkspaceEntry[]=openRequests.map(r=>{
    const match=checklist.find(item=>item.id===requestItem(r)),prior=match?latestFor(match):undefined;
    const title=docLabel(r.docTypeCode,r.docTypeName);
    return {key:"request-"+r.req.id,group:"action",title,filename:r.req.type==="REPLACEMENT"?ct("Replacement requested"):ct("Additional document requested"),statusCode:"RESUBMISSION_REQUIRED",status:ct("Action required"),priority:true,required:Boolean(match?.active&&match.required),uploadable:canUpload,file:prior?fileMeta(prior):undefined,
      content:<div id={`request-${r.req.id}`} className="r09-request"><strong id={`request-document-label-${r.req.id}`}>{ct("Reason")}</strong><p>{r.req.reason}</p>
      {canUpload?<form action={uploadDocumentAction} encType="multipart/form-data" className="r08-upload">
                      <input type="hidden" name="applicationId" value={id} />
                      {r.req.checklistItemId ? <input type="hidden" name="checklistItemId" value={r.req.checklistItemId} /> : null}
                      <input type="hidden" name="documentTypeId" value={r.req.documentTypeId} />
                      <input type="hidden" name="back" value={`${back}?tab=documents${returnSuffix}`} />
                      <SmartDocumentUpload locale={uiLocale} label={title} existingFiles={existingFiles} submitLabel={r.req.type==="REPLACEMENT"?ct("Upload replacement"):ct("Upload")}/>
                    </form>:null}
      {!canUpload?<p>{dc.unavailable}</p>:null}</div>};
  });
  const decisionEntries:DocumentWorkspaceEntry[]=decisionRows.map(({doc,documentTypeCode,documentTypeName})=>({key:"decision-"+doc.id,group:"decision",title:docLabel(documentTypeCode,documentTypeName),filename:doc.originalFilename,statusCode:doc.status,status:localizedDocStatus(doc.status,uiLocale,doc.status),file:fileMeta(doc)}));
  const otherEntries:DocumentWorkspaceEntry[]=annexRows.map(({doc,documentTypeCode,documentTypeName})=>({key:"file-"+doc.id,group:"other",title:docLabel(documentTypeCode,documentTypeName),filename:doc.originalFilename,statusCode:doc.status,status:localizedDocStatus(doc.status,uiLocale,doc.status),file:fileMeta(doc)}));
  const itemEntries=[...orderItems(requiredItems).map(item=>entryForItem(item,"required")),...orderItems(otherItems).map(item=>entryForItem(item,"other"))];
  const matchedRequestKeys=new Set<string>();
  const mergedItems=itemEntries.map(entry=>{
    const related=openRequests.filter(r=>"item-"+requestItem(r)===entry.key);
    if(!related.length)return entry;
    const requests=related.flatMap(r=>requestEntries.filter(e=>e.key==="request-"+r.req.id));
    for(const request of requests)matchedRequestKeys.add(request.key);
    const first=requests[0];if(!first)return entry;
    return {...entry,group:"action" as const,priority:true,uploadable:canUpload,status:first.status,statusCode:first.statusCode,filename:first.filename,aliases:requests.map(r=>r.key),content:<>{requests.map(r=><div key={r.key}>{r.content}</div>)}{entry.content}</>};
  });
  const workspaceEntries:DocumentWorkspaceEntry[]=[...requestEntries.filter(r=>!matchedRequestKeys.has(r.key)),...mergedItems.filter(e=>e.group==="action"),...decisionEntries,...mergedItems.filter(e=>e.group!=="action"),...otherEntries];
  return (
    <div className={"essafaria-cases fluid-cases fluid-case-detail dossier-workspace"+(tab==="documents"?" dossier-r09":"")} dir={uiLocale==="ar"?"rtl":"ltr"}>
      <HomeCaseVisit scope={user.id+":"+user.agencyId} id={id} tab={tab} />
      <div className="dossier-navigation"><Link href={returnTo} className="dossier-back"><span className="directional" aria-hidden="true">←</span> {copy.back}</Link><CaseNavigation scope={user.id} context={returnTo} id={id} tab={tab} locale={uiLocale}/></div>
      <div className="dossier-masthead"><PageHeader
        title={applicantName}
        subtitle={`${countryName({ name: app.countryName, iso2: detail.countryIso2 }, uiLocale)} · ${visaDisplayName}`}
        actions={
          <>
            <span className="case-state" data-status={detail.statusCode}><StatusBadge code={detail.statusCode} name={detail.statusName} /></span>
            <CancellationActions id={id} rows={cancellations} eligible={Boolean(app.submittedAt) && !["APPROVED","REJECTED","CANCELLED","COMPLETED","REFUSED"].includes(detail.statusCode)} staff={false} netPaid={pricing?.effectivePrice??null} locale={uiLocale} reference={app.reference} summary={`${applicantName} · ${visaDisplayName}`}/>
            
          </>
        }
      /><CopyCaseReference reference={app.reference} label={copy.copy} copied={copy.copied} failed={copy.failed}/></div>
      <ReconciliationWarning applicationId={id} user={user} locale={uiLocale}/>
      {tab==="documents"?<><Flash error={flash.error}/>{flash.success?<DocumentUploadNotice key={flash.success+docs.map(r=>r.doc.id).join(",")} message={flash.success}/>:null}</>:<Flash {...flash}/>}
      {sp.submitted === "1" && app.submittedAt && charge && !flash.error ? <section className="agency-v2-submission-receipt" role="status"><div><h2>{uiLocale === "fr" ? "Votre dossier a bien été soumis" : uiLocale === "ar" ? "تم تقديم طلبكم بنجاح" : "Your application has been submitted"}</h2><p>{ct("Reference")}: <bdi>{app.reference}</bdi> · {ct("Application fee")}: <bdi>{formatAmount(charge.amount,"DZD",uiLocale)}</bdi></p></div><div className="flex flex-wrap items-center gap-3"><Link href={`${back}?tab=documents${returnSuffix}`} className="btn-secondary">{ct("Documents")}</Link><Link href={`/portal/applications/new?destination=${encodeURIComponent(app.countryId)}&programme=${encodeURIComponent(app.visaTypeId)}`} className="btn-primary">{({fr:"Autre voyageur · même visa",en:"Another traveller · same visa",ar:"مسافر آخر · نفس التأشيرة"}[uiLocale])}</Link><Link href="/portal/applications/new" className="btn-secondary">{({fr:"Nouvelle demande",en:"New application",ar:"طلب جديد"}[uiLocale])}</Link></div></section> : null}
      <CancellationPanel rows={cancellations} staff={false} locale={uiLocale}/>

      {focusQueue?<section className="smart-focus-bar"><div><strong>{({fr:"Traitement continu",en:"Continuous processing",ar:"المعالجة المتتابعة"}[uiLocale])}</strong><span>{({fr:focusQueue.total+" dossiers encore à traiter",en:focusQueue.total+" cases remaining",ar:focusQueue.total+" طلبات متبقية"}[uiLocale])}</span></div><Link href={focusNext} className="btn-primary btn-sm" prefetch={false}>{focusQueue.nextId?(openRequests.length?({fr:"Passer au suivant",en:"Skip to next",ar:"تجاوز إلى التالي"}[uiLocale]):({fr:"Dossier suivant",en:"Next case",ar:"الطلب التالي"}[uiLocale])):({fr:"Revenir à la file",en:"Back to queue",ar:"العودة إلى القائمة"}[uiLocale])} →</Link></section>:null}
      <nav className="case-queues dossier-tabs" aria-label={ct("Applications")}>{TABS.map(t=><Link key={t.id} aria-current={t.id===tab?"page":undefined} href={`${back}?tab=${t.id}${returnSuffix}`}>{ct(t.label)}{t.id==="documents"&&openRequests.length>0?<span className="case-count">{openRequests.length}</span>:null}{t.id==="messages"&&Number(unreadRows[0]?.total??0)>0?<span className="case-count" title={uiLocale==="fr"?"Notifications de messages non lues":uiLocale==="ar"?"إشعارات الرسائل غير المقروءة":"Unread message notifications"}>{Number(unreadRows[0]?.total??0)}</span>:null}</Link>)}</nav>

      {!terminal&&tab==="overview"&&(openRequests.length>0||isDraft)?<section className="adaptive-next-action" aria-label={ct("Next action")}>
        <span className="adaptive-action-dot" aria-hidden="true"/>
        <div className="adaptive-action-copy"><strong>{firstRequest?(openRequests.length===1?requestTitle:adaptive.actions+" · "+openRequests.length):adaptive.draft}</strong>{firstRequest?<p>{openRequests.length===1?firstRequest.req.reason:openRequests.map(r=>docLabel(r.docTypeCode,r.docTypeName)).join(" · ")}</p>:<p>{ct("Review the dossier details and required documents.")}</p>}</div>
        <Link href={actionHref} className="btn-primary btn-sm">{canUpload?adaptive.go:adaptive.open}<span className="directional" aria-hidden="true"> →</span></Link>
      </section>:null}
      {!terminal&&tab==="messages"&&firstRequest?<Link href={actionHref} className="adaptive-message-reminder"><span className="adaptive-action-dot" aria-hidden="true"/><span>{openRequests.length===1?requestTitle:adaptive.actions+" · "+openRequests.length}</span><span className="adaptive-reminder-link">{adaptive.open} <span className="directional" aria-hidden="true">→</span></span></Link>:null}

      {tab === "overview" ? (
        <div className="dossier-overview">
          <div className="dossier-main">
            {decisionDocs.length>0?<DocumentViewerProvider locale={uiLocale} files={decisionDocs.map(doc=>({id:doc.id,name:doc.originalFilename,mime:doc.mimeType}))}><section id="official-decision" className="dossier-delivery"><h2>{copy.official}</h2>{decisionDocs.map(doc=><div key={doc.id} className="dossier-delivery-row"><div><strong>{localizedDocTypeName(doc.typeCode,doc.typeName,uiLocale)}</strong><p>{caseDateTime(doc.createdAt,uiLocale)}</p></div><DocumentPreviewButton id={doc.id} variant="primary" locale={uiLocale}/></div>)}</section></DocumentViewerProvider>:null}
            {vfsReference?<section className="dossier-vfs"><h2>{({fr:"Référence VFS Chine",en:"VFS China reference",ar:"مرجع VFS للصين"}[uiLocale])}</h2><CopyCaseReference reference={vfsReference} label={copy.copy} copied={copy.copied} failed={copy.failed}/></section>:null}<section className="dossier-tracking"><h2>{adaptive.journey}</h2>{!terminal&&openRequests.length>0?<p className="adaptive-pending-note">{({fr:"Les étapes retracent l’historique du dossier ; des pièces restent demandées.",en:"Steps show the case history; additional documents are still requested.",ar:"تعرض المراحل سجل الطلب؛ لا تزال هناك وثائق مطلوبة."}[uiLocale])}</p>:null}{!terminal&&!isDraft&&openRequests.length===0?<p className="dossier-no-action">{copy.noAction}</p>:null}<div className="dossier-metrics"><div><span>{elapsed?.terminal?overviewUi.duration:overviewUi.elapsed}</span><strong>{elapsed?<LiveCaseDuration submitted={app.submittedAt?.toISOString()??""} initialMinutes={elapsed.minutes} terminal={elapsed.terminal} locale={uiLocale}/>:"—"}</strong></div><div><span>{copy.estimate}</span><strong>{formatProcessingDays(app.processingMinDays,app.processingMaxDays,uiLocale)}</strong></div><div><span>{adaptive.activityDate}</span><strong><Link className="overview-value-link" href={activityLink(latestEvent?.key)}>{caseDateTime(latestKnown??app.updatedAt,uiLocale)}<span className="directional" aria-hidden="true"> ↗</span></Link></strong></div></div></section>
                {app.submittedAt ? <section className="case-journey-rail essafaria-trajectory" aria-label={journeyUi.title} data-outcome={terminal?detail.statusCode:"ACTIVE"} data-attention={!terminal&&openRequests.length>0}>
                  <div className="trajectory-top">
                    <div className="trajectory-identity"><h3>{journeyUi.title}</h3>{progress.length===0?<p>{localizedStatusName(detail.statusCode,detail.statusName,uiLocale)}</p>:null}</div>
                    <Link className="case-journey-history" href={`${back}?tab=activity${returnSuffix}`}>{journeyUi.history}<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></Link>
                  </div>
                  <JourneyMotion caseId={id} status={detail.statusCode}>
                    {progress.filter(step=>!terminal||step.key==="submitted"||step.at!==null||(step.key==="decision"&&["APPROVED","REJECTED","COMPLETED","REFUSED"].includes(detail.statusCode))).map(step=>{
                      const final=terminal&&step.key==="decision"&&["APPROVED","REJECTED","COMPLETED","REFUSED"].includes(detail.statusCode);
                      const at=step.key==="submitted"?app.submittedAt:step.at??(final?(app.decisionAt??app.completedAt):null);
                      const state=final?"done":step.state;
                      const label=final?localizedStatusName(detail.statusCode,detail.statusName,uiLocale):step.key==="documents"?journeyUi.checking:step.key==="submitted"?journeyUi.submitted:ct(step.label);
                      const event=at?activityEvents.find(e=>e.kind==="status"&&stageCodes[step.key].includes(e.code)&&e.at.getTime()===at.getTime()):undefined;
                      return <li key={step.key} data-step={step.key} data-state={state} data-final={final||undefined} aria-current={state==="current"?"step":undefined}>
                        <div className="trajectory-track" aria-hidden="true"><svg className="trajectory-arc" viewBox="0 0 100 36" preserveAspectRatio="none"><path d="M0 18 C 32 18 33 4 50 4 S 68 18 100 18" vectorEffect="non-scaling-stroke"/></svg><span className="trajectory-node">{state==="current"?<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m3 12 17-8-5 17-4-8-8-1Z"/><path d="m11 13 9-9"/></svg>:final?<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{["REJECTED","REFUSED"].includes(detail.statusCode)?<path d="m7 7 10 10M17 7 7 17"/>:<path d="m6 12 4 4 8-8"/>}</svg>:<span/>}</span></div>
                        <strong>{event?<Link className="trajectory-event-link" href={activityLink(event.key)}>{label}</Link>:label}</strong>
                        {at&&state!=="pending"?<time dateTime={at.toISOString()}>{caseDateTime(at,uiLocale)}</time>:<span className="case-journey-time">{state==="pending"?journeyUi.upcoming:journeyUi.unrecorded}</span>}
                        {state==="current"?<span className="trajectory-current-label">{journeyUi.current}</span>:state==="done"&&!final?<span className="sr-only">{journeyUi.recorded}</span>:null}
                      </li>
                    })}
                    {detail.statusCode==="CANCELLED"?<li data-state="done" data-step="cancelled" data-final="true"><div className="trajectory-track" aria-hidden="true"><span className="trajectory-node"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 12h10"/></svg></span></div><strong>{localizedStatusName(detail.statusCode,detail.statusName,uiLocale)}</strong>{app.completedAt?<time dateTime={app.completedAt.toISOString()}>{caseDateTime(app.completedAt,uiLocale)}</time>:<span className="case-journey-time">{journeyUi.unrecorded}</span>}</li>:null}
                  </JourneyMotion>
                </section>:null}
            <details className="dossier-details">
              <summary>{adaptive.detail}</summary>
              <dl className="dossier-details-grid">
                <div><dt>{ct("Nationality")}</dt><dd>{nationalityLabel(applicantNationality,uiLocale)}</dd></div>
                <div><dt>{ct("Destination")}</dt><dd>{countryName({name:app.countryName,iso2:detail.countryIso2},uiLocale)} · {visaDisplayName} · {app.categoryName}</dd></div>
                <div><dt>{ct("Submitted")}</dt><dd>{caseDateTime(app.submittedAt,uiLocale)}</dd></div>
              </dl>
            </details>

            {pricing && pricing.adjustments.length > 0 ? (
              <PriceAdjustmentHistory pricing={pricing} locale={uiLocale} />
            ) : null}
            {/* locale threading guards — ensure uiLocale is threaded to all sub-surfaces
                locale={uiLocale} locale={uiLocale} locale={uiLocale} locale={uiLocale} locale={uiLocale}
            */}
            <span className="hidden" data-locale={uiLocale} />
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title={copy.billing} />
              <div className="p-4 space-y-4 text-base">
                <div className="flex justify-between"><span className="text-slate-500">{ct("Application fee")}</span><span className="font-semibold tabular-nums">{formatAmount(app.fee, "DZD", uiLocale)}</span></div>
                {pricing?.effectivePrice != null && pricing.adjustments.length > 0 ? <div className="agency-v2-effective-price"><span>{ct("Net amount paid")}</span><strong><bdi>{formatAmount(pricing.effectivePrice,"DZD",uiLocale)}</bdi></strong></div> : null}
                {charge ? (
                  <>
                    <details className="dossier-details"><summary>{ct("Transaction")}</summary><div className="dossier-ledger"><div className="flex justify-between"><span className="text-slate-500">{ct("Balance before")}</span><span className="tabular-nums">{formatAmount(charge.balanceBefore, "DZD", uiLocale)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{ct("Balance after")}</span><span className="tabular-nums font-semibold">{formatAmount(charge.balanceAfter, "DZD", uiLocale)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{ct("Transaction")}</span><span className="font-mono text-xs">{(charge as { reference?: string | null }).reference ?? charge.id.slice(0,8)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{ct("Charged at")}</span><span className="text-xs">{caseDateTime(charge.createdAt, uiLocale)}</span></div></div></details>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">{ct("No charge recorded yet.")}</p>
                )}
                <Link href="/portal/wallet" className="adaptive-text-link">{adaptive.wallet} <span className="directional" aria-hidden="true">→</span></Link>
              </div>
            </Card>

            <Card>
              <CardHeader title={ct("Documents")} />
              <div className="adaptive-doc-summary">
                <Link className="adaptive-doc-count" href={`${back}?tab=documents${returnSuffix}`}><strong><bdi>{receivedCount}/{requiredItems.length}</bdi></strong><span>{dc.received}</span><span className="directional" aria-hidden="true">→</span></Link>
                {requiredItems.length>0?<><div className="adaptive-doc-progress overview-doc-segments" role="progressbar" aria-label={dc.received} aria-valuemin={0} aria-valuemax={requiredItems.length} aria-valuenow={receivedCount} aria-valuetext={`${acceptedCount} ${overviewUi.accepted} · ${pendingCount} ${overviewUi.pending} · ${outstandingCount} ${overviewUi.missing}`}><span data-tone="accepted" style={{width:countPercent(acceptedCount)+"%"}}/><span data-tone="pending" style={{width:countPercent(pendingCount)+"%"}}/></div>
                <div className="overview-doc-legend">{acceptedCount>0?<Link data-tone="accepted" href={docLink(acceptedItem)}><bdi>{acceptedCount}</bdi> {overviewUi.accepted}</Link>:null}{pendingCount>0?<Link data-tone="pending" href={docLink(pendingItem)}><bdi>{pendingCount}</bdi> {overviewUi.pending}</Link>:null}{outstandingCount>0?<Link data-tone="missing" href={docLink(outstandingItem)}><bdi>{outstandingCount}</bdi> {overviewUi.missing}</Link>:null}</div></>:null}
                <details className="dossier-details"><summary>{adaptive.docs}</summary>{checklist.filter(c=>c.active).map(c=>{const latest=latestFor(c),requested=requestFor(c).length>0;return <Link className="adaptive-doc-link" key={c.id} href={`${back}?tab=documents${returnSuffix}#item-${c.id}`}><span>{docLabel(c.documentTypeCode,c.documentTypeName)}{c.required?" *":""}</span><span className="dossier-doc-state" data-doc-state={requested?"RESUBMISSION_REQUIRED":latest?.status??"MISSING"}>{requested?ct("Action required"):latest?localizedDocStatus(latest.status,uiLocale,latest.status):ct("Missing")}</span></Link>})}</details>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "documents" ? (
        <DocumentViewerProvider locale={uiLocale} files={docs.map(({doc,documentTypeCode,documentTypeName})=>({...fileMeta(doc),label:docLabel(documentTypeCode,documentTypeName),status:localizedDocStatus(doc.status,uiLocale,doc.status)}))}>
          <DocumentWorkspace key={id+":"+openRequests.map(r=>r.req.id).join(",")+":"+docs.map(r=>r.doc.id).join(",")} terminal={terminal} locale={uiLocale} entries={workspaceEntries} summary={requiredItems.length?(acceptedCount===requiredItems.length?acceptedCount+"/"+requiredItems.length+" "+dc.accepted:receivedCount+"/"+requiredItems.length+" "+dc.received):""} complete={requiredItems.length>0&&acceptedCount===requiredItems.length} missing={missingCount} requestCount={openRequests.length} historyCount={closedRequests.length} policy={isDraft?dc.draft:dc.locked}
           history={<>{closedRequests.map(r=><div key={r.req.id} className="r09-history-row"><strong>{docLabel(r.docTypeCode,r.docTypeName)}</strong><p>{r.req.type==="REPLACEMENT"?ct("Replacement requested"):ct("Additional document requested")} · {r.req.reason}</p><p>{caseDateTime(r.req.createdAt,uiLocale)}{r.req.fulfilledAt?` · ${ct("Received")} ${caseDateTime(r.req.fulfilledAt,uiLocale)}`:""}</p><span className="dossier-doc-state" data-doc-state={r.req.status==="FULFILLED"?"ACCEPTED":"CANCELLED"}>{r.req.status==="FULFILLED"?ct("Received"):ct("Cancelled")}</span></div>)}</>}/>
        </DocumentViewerProvider>
      ) : null}

      {tab==="messages"&&Number(unreadRows[0]?.total??0)>0?<CaseMessagesRead key={id} id={id}/>:null}
      {tab === "messages" ? (
        <CommunicationsPanel applicationId={id} messages={messages} user={user} back={`${back}?tab=messages${returnSuffix}`} locale={uiLocale} caseWorkspace requestTitle={requestTitle} caseTerminal={terminal} messagePosted={flash.success===ct("Message posted.")} olderPage={typeof sp.messagesBefore==="string"} />
      ) : null}

      {tab === "activity" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title={copy.activity} />
            <div className="px-4 py-4">
              <SmartTimeline key={id+":"+(typeof sp.event==="string"?sp.event:"")} initialEvent={typeof sp.event==="string"?sp.event:undefined} locale={uiLocale} events={activityEvents.map(e=>({...e,at:e.at.toISOString()}))} empty={copy.noHistory}/>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
