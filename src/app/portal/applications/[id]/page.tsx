import { CancellationActions, CancellationPanel } from "@/components/cancellation-panel";
import { listApplicationCancellations } from "@/lib/application-cancellations";
import { configName } from "@/lib/config-localization";
import Link from "next/link";
import { notFound } from "next/navigation";
import { portalPageUser } from "@/lib/page-auth";
import { getApplicationDetail, getEmbassyApplicability } from "@/lib/queries";
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
import { safeCaseReturn, processingDuration, caseDateTime, usableCaseDocument } from "../case-workspace";
import { CopyCaseReference } from "../copy-case-reference";
import { hasPermission } from "@/lib/rbac";
import { DocumentViewerProvider, DocumentPreviewButton } from "../document-viewer";
import { DocumentWorkspace, type DocumentWorkspaceEntry } from "../document-workspace";
import { LiveCaseDuration } from "../live-case-duration";
import { readCaseVfsReference } from "@/lib/case-vfs-reference";
import { CaseMessagesRead } from "../case-messages-read";
import { CaseNavigation } from "../case-navigation";
import { SmartTimeline } from "../smart-timeline";
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
  const firstRequest=openRequests[0];
  const actionHref=`${back}?tab=documents${returnSuffix}${firstRequest?"#request-"+firstRequest.req.id:""}`;
  const requestTitle=firstRequest?docLabel(firstRequest.docTypeCode,firstRequest.docTypeName):undefined;
  const activityEvents=[
    ...history.map(h=>({key:"status-"+h.history.id,at:h.history.createdAt,kind:"status" as const,title:localizedStatusName(h.toStatus.code,h.toStatus.name,uiLocale),code:h.toStatus.code,reason:h.history.reason?(h.toStatus.code==="SUBMITTED"&&h.history.reason==="Request submitted"?ct("Request submitted"):h.history.reason):null,href:null as string|null})),
    ...docRequests.flatMap(r=>{
      const title=docLabel(r.docTypeCode,r.docTypeName);
      const href=`${back}?tab=documents${returnSuffix}${r.req.status==="OPEN"?"#request-"+r.req.id:""}`;
      return [{key:"request-"+r.req.id,at:r.req.createdAt,kind:"request" as const,title:r.req.type==="REPLACEMENT"?adaptive.replacement:adaptive.request,code:"RESUBMISSION_REQUIRED",reason:title+(r.req.reason?" · "+r.req.reason:""),href},...(r.req.fulfilledAt?[{key:"received-"+r.req.id,at:r.req.fulfilledAt,kind:"received" as const,title:adaptive.receivedEvent,code:"UPLOADED",reason:title,href:`${back}?tab=documents${returnSuffix}`}]:[])];
    }),
    ...messages.map(({message})=>({key:"message-"+message.id,at:message.createdAt,kind:"message" as const,title:({fr:"Message échangé",en:"Message exchanged",ar:"تم تبادل رسالة"}[uiLocale]),code:"MESSAGE",reason:null,href:`${back}?tab=messages${returnSuffix}`}))
  ].sort((a,b)=>b.at.getTime()-a.at.getTime()||a.key.localeCompare(b.key));
  const latestKnown=detail.caseActivity??app.updatedAt;
  const existingFiles=docs.map(({doc})=>({name:doc.originalFilename,size:doc.sizeBytes}));
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
      {sp.submitted === "1" && app.submittedAt && charge && !flash.error ? <section className="agency-v2-submission-receipt" role="status"><div><h2>{uiLocale === "fr" ? "Votre dossier a bien été soumis" : uiLocale === "ar" ? "تم تقديم طلبكم بنجاح" : "Your application has been submitted"}</h2><p>{ct("Reference")}: <bdi>{app.reference}</bdi> · {ct("Application fee")}: <bdi>{formatAmount(charge.amount,"DZD",uiLocale)}</bdi></p></div><Link href={`${back}?tab=documents${returnSuffix}`} className="btn-secondary">{ct("Documents")}</Link></section> : null}
      <CancellationPanel rows={cancellations} staff={false} locale={uiLocale}/>

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
            {vfsReference?<section className="dossier-vfs"><h2>{({fr:"Référence VFS Chine",en:"VFS China reference",ar:"مرجع VFS للصين"}[uiLocale])}</h2><CopyCaseReference reference={vfsReference} label={copy.copy} copied={copy.copied} failed={copy.failed}/></section>:null}<section className="dossier-tracking"><h2>{adaptive.journey}</h2>{!terminal&&openRequests.length>0?<p className="adaptive-pending-note">{({fr:"Les étapes retracent l’historique du dossier ; des pièces restent demandées.",en:"Steps show the case history; additional documents are still requested.",ar:"تعرض المراحل سجل الطلب؛ لا تزال هناك وثائق مطلوبة."}[uiLocale])}</p>:null}{!terminal&&!isDraft&&openRequests.length===0?<p className="dossier-no-action">{copy.noAction}</p>:null}<div className="dossier-metrics"><div><span>{elapsed?.terminal?copy.duration:copy.elapsed}</span><strong>{elapsed?<LiveCaseDuration submitted={app.submittedAt?.toISOString()??""} initialMinutes={elapsed.minutes} terminal={elapsed.terminal} locale={uiLocale}/>:"—"}</strong></div><div><span>{copy.estimate}</span><strong>{formatProcessingDays(app.processingMinDays,app.processingMaxDays,uiLocale)}</strong></div><div><span>{adaptive.activityDate}</span><strong>{caseDateTime(latestKnown??app.updatedAt,uiLocale)}</strong></div></div></section>
                {app.submittedAt ? <section className="agency-v2-journey" aria-label={ct("Progress")}>
                  <h3 className="sr-only">{ct("Progress")}</h3>
                  <ol data-testid="application-progress">
                    {progress.filter(step=>detail.statusCode!=="CANCELLED"||step.at!==null).map(step=>(
                      <li key={step.key} data-step={step.key} data-state={step.state} aria-current={step.state==="current"?"step":undefined}>
                        <span className="agency-v2-journey-marker" aria-hidden="true">{step.state==="done"?"✓":step.state==="current"?"●":""}</span>
                        <div><strong>{ct(step.label)}</strong>{step.at&&step.state!=="pending"?<time dateTime={step.at.toISOString()}>{caseDateTime(step.at,uiLocale)}</time>:<span>{step.state==="pending"?(uiLocale==="fr"?"À venir":uiLocale==="ar"?"لاحقًا":"Upcoming"):(uiLocale==="fr"?"En cours":uiLocale==="ar"?"قيد المعالجة":"In progress")}</span>}</div>
                      </li>
                    ))}
                    {detail.statusCode==="CANCELLED"?<li data-state="done"><span className="agency-v2-journey-marker" aria-hidden="true">✓</span><div><StatusBadge code={detail.statusCode} name={detail.statusName}/><time>{caseDateTime(app.completedAt,uiLocale)}</time></div></li>:null}
                  </ol>
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
                <div className="adaptive-doc-progress" role="progressbar" aria-label={dc.received} aria-valuemin={0} aria-valuemax={Math.max(1,requiredItems.length)} aria-valuenow={receivedCount}><span style={{width:(requiredItems.length?receivedCount/requiredItems.length*100:0)+"%"}}/></div>
                <p>{acceptedCount} {adaptive.accepted} · {Math.max(0,receivedCount-acceptedCount)} {adaptive.received}</p>
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
        <CommunicationsPanel applicationId={id} messages={messages} user={user} back={`${back}?tab=messages${returnSuffix}`} locale={uiLocale} caseWorkspace requestTitle={requestTitle} caseTerminal={terminal} olderPage={typeof sp.messagesBefore==="string"} />
      ) : null}

      {tab === "activity" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title={copy.activity} />
            <div className="px-4 py-4">
              <SmartTimeline key={id} locale={uiLocale} events={activityEvents.map(e=>({...e,at:e.at.toISOString()}))} empty={copy.noHistory}/>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
