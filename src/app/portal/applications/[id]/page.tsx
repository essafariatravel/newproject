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
import { getUiLocale, localizedDocTypeName, localizedDocStatus } from "@/lib/ui-i18n";
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
import { safeCaseReturn, processingDuration, caseDateTime, usableCaseDocument } from "../case-workspace";
import { CopyCaseReference } from "../copy-case-reference";
import { hasPermission } from "@/lib/rbac";
import { DocumentViewerProvider, DocumentPreviewButton } from "../document-viewer";
import { LiveCaseDuration } from "../live-case-duration";
import { CaseNavigation } from "../case-navigation";
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

  const [applicants, docs, checklist, history, messages, charge, decisionDocs, docRequests,cancellations,embassyApplicability,pricing,uiLocale,unreadRows] =
    await Promise.all([
      listApplicantsForApplication(id),
      tab==="overview"||tab==="documents"?listDocumentsForApplication(id):Promise.resolve([]),
      tab==="overview"||tab==="documents"?getChecklist(id):Promise.resolve([]),
      tab==="overview"||tab==="activity"?getStatusHistory(id):Promise.resolve([]),
      tab==="messages"?listCommunications(id, user,sp.messagesBefore):Promise.resolve([]),
      tab==="overview"||sp.submitted==="1"?findTransactionByApplication(id):Promise.resolve(null),
      tab==="overview"&&["APPROVED","REJECTED"].includes(detail.statusCode)?getDecisionDocuments(id):Promise.resolve([]),
      listDocumentRequests(id),
      listApplicationCancellations(id,user),
      tab==="overview"?getEmbassyApplicability(app.visaTypeId,app.visaRuleSnapshot):Promise.resolve(null),
      app.submittedAt?getApplicationPricing(id):Promise.resolve(null),
      getUiLocale(sp),
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
  const fulfilledRequests = docRequests.filter((r) => r.req.status === "FULFILLED");
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
  return (
    <div className="essafaria-cases dossier-workspace" dir={uiLocale==="ar"?"rtl":"ltr"}>
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
      <Flash {...flash} />
      {sp.submitted === "1" && app.submittedAt && charge && !flash.error ? <section className="agency-v2-submission-receipt" role="status"><div><h2>{uiLocale === "fr" ? "Votre dossier a bien été soumis" : uiLocale === "ar" ? "تم تقديم طلبكم بنجاح" : "Your application has been submitted"}</h2><p>{ct("Reference")}: <bdi>{app.reference}</bdi> · {ct("Application fee")}: <bdi>{formatAmount(charge.amount,"DZD",uiLocale)}</bdi></p></div><Link href={`${back}?tab=documents${returnSuffix}`} className="btn-secondary">{ct("Documents")}</Link></section> : null}
      <CancellationPanel rows={cancellations} staff={false} locale={uiLocale}/>

      <nav className="case-queues dossier-tabs" aria-label={ct("Applications")}>{TABS.map(t=><Link key={t.id} aria-current={t.id===tab?"page":undefined} href={`${back}?tab=${t.id}${returnSuffix}`}>{ct(t.label)}{t.id==="documents"&&openRequests.length>0?<span className="case-count">{openRequests.length}</span>:null}{t.id==="messages"&&Number(unreadRows[0]?.total??0)>0?<span className="case-count" title={uiLocale==="fr"?"Notifications de messages non lues":uiLocale==="ar"?"إشعارات الرسائل غير المقروءة":"Unread message notifications"}>{Number(unreadRows[0]?.total??0)}</span>:null}</Link>)}</nav>

      {(openRequests.length>0||isDraft)&&!terminal&&tab!=="documents"?<section className="dossier-attention" aria-labelledby="agency-next-action">
        <p id="agency-next-action" className="agency-v2-section-label font-semibold text-slate-600">{ct("Next action")}</p>
        {openRequests.length > 0 ? (
          <>
            <p className="mt-2 text-base font-semibold text-navy-900">{ct("Action required")} — {openRequests.length} {ct("document(s) requested")}</p>
            <ul className="mt-2 space-y-1 text-base text-slate-600">
              {openRequests.map((r) => (
                <li key={r.req.id}>• {localizedDocTypeName(r.docTypeCode, r.docTypeName, uiLocale)}: {r.req.reason}</li>
              ))}
            </ul>
            <Link href={`${back}?tab=documents${returnSuffix}#request-${openRequests[0]?.req.id}`} className="btn-primary btn-sm mt-4">{ct(canUpload?"Upload requested documents":"Open documents")}</Link>
          </>
        ) : isDraft ? (
          <>
            <p className="mt-2 text-base text-navy-900">{ct("Review the dossier details and required documents.")}</p>
            <Link href={`${back}?tab=documents${returnSuffix}`} className="btn-secondary btn-sm mt-4">{ct("Open documents")}</Link>
          </>
        ) : (
          <p className="mt-2 text-base text-navy-900">{ct("No action is required from your agency right now.")}</p>
        )}
      </section>:null}

      {tab === "overview" ? (
        <div className="dossier-overview">
          <div className="dossier-main">
            {decisionDocs.length>0?<DocumentViewerProvider locale={uiLocale} files={decisionDocs.map(doc=>({id:doc.id,name:doc.originalFilename,mime:doc.mimeType}))}><section id="official-decision" className="dossier-delivery"><h2>{copy.official}</h2>{decisionDocs.map(doc=><div key={doc.id} className="dossier-delivery-row"><div><strong>{localizedDocTypeName(doc.typeCode,doc.typeName,uiLocale)}</strong><p>{caseDateTime(doc.createdAt,uiLocale)}</p></div><DocumentPreviewButton id={doc.id} variant="primary" locale={uiLocale}/></div>)}</section></DocumentViewerProvider>:null}
            <section className="dossier-tracking"><h2>{copy.tracking}</h2>{!terminal&&!isDraft&&openRequests.length===0?<p className="dossier-no-action">{copy.noAction}</p>:null}<div className="dossier-metrics"><div><span>{elapsed?.terminal?copy.duration:copy.elapsed}</span><strong>{elapsed?<LiveCaseDuration submitted={app.submittedAt?.toISOString()??""} initialMinutes={elapsed.minutes} terminal={elapsed.terminal} locale={uiLocale}/>:"—"}</strong></div><div><span>{copy.estimate}</span><strong>{formatProcessingDays(app.processingMinDays,app.processingMaxDays,uiLocale)}</strong></div><div><span>{ct("Last updated")}</span><strong>{caseDateTime(app.updatedAt,uiLocale)}</strong></div></div></section>
                {app.submittedAt ? <section className="agency-v2-journey" aria-label={ct("Progress")}>
                  <h3>{ct("Progress")}</h3>
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
              <summary>{ct("Application overview")}</summary>
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
                <Link href="/portal/wallet" className="btn-secondary btn-sm mt-2 w-full text-center">{ct("View wallet")}</Link>
              </div>
            </Card>

            <Card>
              <CardHeader title={ct("Documents")} />
              <div className="px-4 py-4 text-base">
                <p className="text-xs text-slate-500">{checklist.filter(c=>c.required&&c.active&&usableCaseDocument(documentGroups.byItem.get(c.id)?.[0]?.doc.status,openRequests.some(r=>r.req.checklistItemId===c.id||(!r.req.checklistItemId&&r.req.documentTypeId===c.documentTypeId)))).length}/{checklist.filter(c=>c.required&&c.active).length} {({fr:"pièces requises reçues",en:"required items received",ar:"الوثائق المطلوبة المستلمة"}[uiLocale])} · {docs.length} {({fr:"fichiers",en:"files",ar:"ملفات"}[uiLocale])}</p>
                <div className="mt-2 space-y-2">
                  {checklist.filter(c=>c.active).map((c) => {
                    const latest=documentGroups.byItem.get(c.id)?.[0]?.doc;
                    const requested=openRequests.some(r=>r.req.checklistItemId===c.id||(!r.req.checklistItemId&&r.req.documentTypeId===c.documentTypeId));
                    const hasDoc=usableCaseDocument(latest?.status,requested);
                    return (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="dossier-document-name">{localizedDocTypeName(c.documentTypeCode, c.documentTypeName, uiLocale)} {c.required ? "*" : ""}</span>
                        <span className={hasDoc ? "text-emerald-600" : "text-amber-600"}>{hasDoc ? "✓" : "—"}</span>
                      </div>
                    );
                  })}
                </div>
                <Link href={`${back}?tab=documents${returnSuffix}`} className="btn-secondary btn-sm mt-4">{ct("Open documents")}</Link>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "documents" ? (
        <DocumentViewerProvider locale={uiLocale} files={docs.map(({doc})=>({id:doc.id,name:doc.originalFilename,mime:doc.mimeType}))}><div className="dossier-documents space-y-4">
          {openRequests.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader title={ct("Action required")} subtitle={ct("ESSAFARIA requested replacement or additional documents")} />
              <div className="px-4 py-4 space-y-4">
                {openRequests.map((r) => (
                  <div key={r.req.id} id={`request-${r.req.id}`} className="scroll-mt-24 rounded-xl border border-amber-200 bg-white p-4">
                    <p id={`request-document-label-${r.req.id}`} className="font-semibold text-navy-900">{localizedDocTypeName(r.docTypeCode, r.docTypeName, uiLocale)} — {r.req.type === "REPLACEMENT" ? ct("Replacement requested") : ct("Additional document requested")}</p>
                    <p className="mt-1 text-base text-slate-600">{ct("Reason")}: {r.req.reason}</p>
                    {canUpload?<form action={uploadDocumentAction} encType="multipart/form-data" className="mt-4 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="applicationId" value={id} />
                      {r.req.checklistItemId ? <input type="hidden" name="checklistItemId" value={r.req.checklistItemId} /> : null}
                      <input type="hidden" name="documentTypeId" value={r.req.documentTypeId} />
                      <input type="hidden" name="back" value={`${back}?tab=documents${returnSuffix}`} />
                      <input type="file" name="file" aria-labelledby={`request-document-label-${r.req.id}`} required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="text-xs file:me-2 file:rounded-md file:border-0 file:bg-iris-600 file:px-4 file:py-2 file:text-xs file:text-white" />
                      <button type="submit" className="btn-primary btn-sm">{ct("Upload replacement")}</button>
                    </form>:null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={ct("Documents")} subtitle={isDraft ? ct("Upload required documents") : ct("Submitted documents are locked. Only requested replacements can be uploaded.")} />
            <div className="divide-y divide-slate-100">
              {checklist.map((item) => {
                const itemDocs = documentGroups.byItem.get(item.id) ?? [];
                const latest = itemDocs[0];
                const hasOpenRequest = openRequests.some((r) => r.req.checklistItemId === item.id || (!r.req.checklistItemId&&r.req.documentTypeId === item.documentTypeId));
                return (
                  <div key={item.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p id={`checklist-document-label-${item.id}`} className="font-semibold text-navy-900">{localizedDocTypeName(item.documentTypeCode, item.documentTypeName, uiLocale)} {item.required ? <span className="badge bg-rose-50 text-rose-600 text-xs">{ct("Required")}</span> : <span className="badge bg-slate-100 text-slate-500 text-xs">{ct("Optional")}</span>}</p>
                        {item.notes ? <p className="mt-1 text-xs text-slate-500">{item.notes}</p> : null}
                        {isDraft||hasOpenRequest?<p className="mt-1 text-xs text-slate-400">{ct("PDF, JPEG, PNG, WEBP, DOC, DOCX · 2 MB max")}</p>:null}
                      </div>
                      {latest?<span className="dossier-doc-state" data-doc-state={latest.doc.status}>{localizedDocStatus(latest.doc.status,uiLocale,latest.doc.status)}</span>:<span className="dossier-doc-state" data-doc-state="MISSING">{ct("Missing")}</span>}
                      {latest && fulfilledRequests.some((r) => r.req.fulfilledDocumentId === latest.doc.id) ? (
                        <span className="badge bg-teal-50 text-teal-700">{ct("Received")}</span>
                      ) : null}
                    </div>
                    {itemDocs.length > 0 ? (
                      <ul className="mt-4 space-y-2">
                        {itemDocs.map(({ doc }) => (
                          <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ivory-50 px-4 py-2 text-xs">
                            <span className="flex min-w-0 flex-wrap items-center gap-2">
                              <DocumentPreviewButton id={doc.id}>{doc.originalFilename}</DocumentPreviewButton>
                              <span className="text-slate-400">v{doc.version} · {bytes(doc.sizeBytes)} · {caseDateTime(doc.createdAt, uiLocale)}</span>
                            </span>
                            <DocumentPreviewButton id={doc.id} variant="button" locale={uiLocale}/>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {isDraft && canUpload ? (
                      <form action={uploadDocumentAction} encType="multipart/form-data" className="mt-4 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="applicationId" value={id} />
                        <input type="hidden" name="checklistItemId" value={item.id} />
                        <input type="hidden" name="back" value={`${back}?tab=documents${returnSuffix}`} />
                        <input type="file" name="file" aria-labelledby={`checklist-document-label-${item.id}`} required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="text-xs file:me-2 file:rounded-md file:border-0 file:bg-iris-600 file:px-4 file:py-2 file:text-xs file:text-white" />
                        <button type="submit" className="btn-secondary btn-sm">{latest ? ct("Replace") : ct("Upload")}</button>
                      </form>
                    ) : hasOpenRequest ? (
                      <p className="mt-2 text-xs text-amber-700">{ct("Upload enabled via action required above.")}</p>
                    ) : (
                      null
                    )}
                  </div>
                );
              })}
              {checklist.length === 0 ? <p className="px-4 py-6 text-base text-slate-500">{ct("No document requirements for this visa.")}</p> : null}
            </div>
          </Card>

          {documentGroups.unassigned.length > 0 ? (
            <Card>
              <CardHeader title={ct("Other documents")} />
              <div className="divide-y divide-slate-100">
                {documentGroups.unassigned.map(({ doc }) => (
                  <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <DocumentPreviewButton id={doc.id}>{doc.originalFilename}</DocumentPreviewButton>
                      <span className="text-slate-400">v{doc.version} · {bytes(doc.sizeBytes)} · {caseDateTime(doc.createdAt, uiLocale)}</span>
                    </span>
                    <DocumentPreviewButton id={doc.id} variant="button" locale={uiLocale}/>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {docRequests.length > 0 ? (
            <Card>
              <CardHeader title={ct("Document requests")} subtitle={ct("Everything ESSAFARIA asked you for, and what happened next.")} />
              <div className="divide-y divide-slate-100 text-xs">
                {docRequests.map((r) => {
                  const open = r.req.status === "OPEN";
                  return (
                    <div key={r.req.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span className={`badge ${open ? "bg-amber-100 text-amber-700" : r.req.status === "FULFILLED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {open ? ct("Awaiting your upload") : r.req.status === "FULFILLED" ? ct("Received") : ct("Cancelled")}
                        </span>
                        <span className="font-semibold text-navy-900">
                          {r.req.type === "REPLACEMENT" ? ct("Replacement requested") : ct("Additional document requested")}
                        </span>
                        <span className="text-slate-500">{localizedDocTypeName(r.docTypeCode, r.docTypeName, uiLocale)}</span>
                      </span>
                      <span className="text-slate-500">
                        {caseDateTime(r.req.createdAt, uiLocale)}
                        {r.req.fulfilledAt ? ` · ${ct("Received")} ${caseDateTime(r.req.fulfilledAt, uiLocale)}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div></DocumentViewerProvider>
      ) : null}

      {tab === "messages" ? (
        <CommunicationsPanel applicationId={id} messages={messages} user={user} back={`${back}?tab=messages${returnSuffix}`} locale={uiLocale} caseWorkspace olderPage={typeof sp.messagesBefore==="string"} />
      ) : null}

      {tab === "activity" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title={copy.activity} />
            <div className="px-4 py-4">
              {history.length===0?<p className="dossier-muted">{copy.noHistory}</p>:<ol className="dossier-activity">{history.map(h=><li key={h.history.id}><div><span className="case-state" data-status={h.toStatus.code}><StatusBadge code={h.toStatus.code} name={h.toStatus.name}/></span>{h.history.reason?<p>{h.toStatus.code==="SUBMITTED"&&h.history.reason==="Request submitted"?ct("Request submitted"):h.history.reason}</p>:null}</div><time dateTime={h.history.createdAt.toISOString()}>{caseDateTime(h.history.createdAt,uiLocale)}</time></li>)}</ol>}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
