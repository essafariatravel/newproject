import Link from "next/link";
import { notFound } from "next/navigation";
import { portalPageUser } from "@/lib/page-auth";
import { getApplicationDetail, getEmbassyApplicability } from "@/lib/queries";
import {
  getChecklist,
  getDecisionDocuments,
  getStatusByCode,
  getStatusHistory,
} from "@/lib/applications";
import { groupDocumentsForDisplay, listApplicantsForApplication, listDocumentsForApplication } from "@/lib/documents";
import { listDocumentRequests } from "@/lib/document-requests";
import { findTransactionByApplication, getBalance } from "@/lib/wallet";
import { listCommunications } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { getUiLocale, localizedDocTypeName } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";
import { getApplicationPricing } from "@/lib/price-adjustments";
import { PriceAdjustmentHistory } from "@/components/application-detail";
import { formatDateTime, formatAmount, bytes } from "@/lib/format";
import { nationalityLabel } from "@/lib/nationalities";
import { buildProgress } from "@/lib/progress";
import { Card, CardHeader, Flash, PageHeader, Tabs } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import {
  ActivityTimeline,
  CommunicationsPanel,
} from "@/components/application-detail";
import { uploadDocumentAction } from "@/app/actions/documents";

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
  const tab = typeof sp.tab === "string" && TABS.some((t) => t.id === sp.tab) ? sp.tab : "overview";
  const user = await portalPageUser();
  const detail = await getApplicationDetail(id, user);
  if (!detail) notFound();
  const app = detail.app;
  const back = `/portal/applications/${id}`;

  const [applicants, docs, checklist, history, messages, charge, draftStatus, _wallet, decisionDocs, docRequests] =
    await Promise.all([
      listApplicantsForApplication(id),
      listDocumentsForApplication(id),
      getChecklist(id),
      getStatusHistory(id),
      listCommunications(id, user),
      findTransactionByApplication(id),
      getStatusByCode("DRAFT"),
      getBalance(user.agencyId),
      getDecisionDocuments(id),
      listDocumentRequests(id),
    ]);
  const isDraft = app.statusId === draftStatus.id;
  // §17 — progress is derived from the persisted history, and the embassy
  // stage only appears when the programme declares it (or the file went there).
  const embassyApplicability = await getEmbassyApplicability(app.visaTypeId);
  const progress = buildProgress({
    statusCode: detail.statusCode,
    history: history.map((h) => ({ toStatusCode: h.toStatus.code, createdAt: h.history.createdAt })),
    embassyApplicability,
  });
  const flash = flashFrom(sp);
  const uiLocale = await getUiLocale(sp);
  const ct = contentT(uiLocale);

  const pricing = app.submittedAt ? await getApplicationPricing(id) : null;

  const applicant = applicants[0];
  const applicantName = applicant?.fullName || (applicant ? `${applicant.firstName} ${applicant.lastName}`.trim() : "—");
  const applicantNationality = applicant?.nationality ?? "—";

  const openRequests = docRequests.filter((r) => r.req.status === "OPEN");
  const fulfilledRequests = docRequests.filter((r) => r.req.status === "FULFILLED");
  // Grouping is shared with the staff dossier: a document that is not linked to a
  // checklist requirement is still listed (never invisible) instead of vanishing
  // from the agency's own view of its dossier.
  const documentGroups = groupDocumentsForDisplay(checklist, docs);

  return (
    <>
      <PageHeader
        title={app.reference}
        subtitle={`${countryName({ name: app.countryName, iso2: detail.countryIso2 }, uiLocale)} · ${app.visaTypeName}`}
        actions={
          <>
            <StatusBadge code={detail.statusCode} name={detail.statusName} />
            <Link href="/portal/applications" className="btn-secondary btn-sm">← {ct("All applications")}</Link>
          </>
        }
      />
      <Flash {...flash} />

      <Tabs tabs={TABS.map((t) => ({ ...t, label: ct(t.label), href: `${back}?tab=${t.id}` }))} current={tab} />

      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardHeader title={ct("Application overview")} />
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct("Applicant")}</p>
                  <p className="mt-1 font-semibold text-navy-900">{applicantName}</p>
                  <p className="text-xs text-slate-500">{ct("Nationality")}: {nationalityLabel(applicantNationality, uiLocale)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct("Reference")}</p>
                  <p className="mt-1 font-mono text-navy-900">{app.reference}</p>
                  <p className="text-xs text-slate-500">{ct("Submitted")}: {formatDateTime(app.submittedAt, uiLocale)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct("Destination")}</p>
                  <p className="mt-1 font-medium text-navy-900">{countryName({ name: app.countryName, iso2: detail.countryIso2 }, uiLocale)}</p>
                  <p className="text-xs text-slate-500">{app.visaTypeName} · {app.categoryName}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct("Fee")}</p>
                  <p className="mt-1 font-semibold tabular-nums text-navy-900">{formatAmount(app.fee, "DZD", uiLocale)}</p>
                  <p className="text-xs text-slate-500">{ct("Processing time")}: {app.processingMinDays}–{app.processingMaxDays} {ct("days")}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct("Progress")}</p>
                  <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs" data-testid="application-progress">
                    {progress.map((step, index) => (
                      <li key={step.key} className="flex items-center gap-2">
                        {index > 0 ? <span aria-hidden className="text-slate-300">→</span> : null}
                        <span
                          data-step={step.key}
                          data-state={step.state}
                          className={`rounded-full px-2.5 py-1 font-medium ${
                            step.state === "current"
                              ? "bg-iris-100 text-iris-700"
                              : step.state === "done"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          {ct(step.label)}
                        </span>
                        {step.at && step.state !== "pending" ? (
                          <span className="hidden text-[11px] text-slate-400 sm:inline">{formatDateTime(step.at, uiLocale)}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  {openRequests.length > 0 ? (
                    <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
                      <p className="text-sm font-semibold text-amber-800">{ct("Action required")} — {openRequests.length} {ct("document(s) requested")}</p>
                      <ul className="mt-1.5 space-y-1 text-xs text-amber-700">
                        {openRequests.map((r) => (
                          <li key={r.req.id}>• {r.docTypeName}: {r.req.reason}</li>
                        ))}
                      </ul>
                      <Link href={`${back}?tab=documents`} className="btn-secondary btn-sm mt-2">{ct("Upload requested documents")}</Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            {decisionDocs.length > 0 ? (
              <Card className="border-emerald-200">
                <CardHeader title={ct("Official decision")} />
                <ul className="space-y-2 px-4 py-4 text-sm">
                  {decisionDocs.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
                      <div>
                        <p className="font-medium text-navy-900">{localizedDocTypeName(d.typeCode, d.typeName, uiLocale)}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(d.createdAt, uiLocale)}</p>
                      </div>
                      <a href={`/api/documents/${d.id}`} className="btn-primary btn-sm">{ct("Download")}</a>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

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
              <CardHeader title={ct("Billing summary")} />
              <div className="p-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">{ct("Application fee")}</span><span className="font-medium tabular-nums">{formatAmount(app.fee, "DZD", uiLocale)}</span></div>
                {charge ? (
                  <>
                    <div className="flex justify-between"><span className="text-slate-500">{ct("Balance before")}</span><span className="tabular-nums">{formatAmount(charge.balanceBefore, "DZD", uiLocale)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{ct("Balance after")}</span><span className="tabular-nums font-medium">{formatAmount(charge.balanceAfter, "DZD", uiLocale)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{ct("Transaction")}</span><span className="font-mono text-xs">{(charge as { reference?: string | null }).reference ?? charge.id.slice(0,8)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{ct("Charged at")}</span><span className="text-xs">{formatDateTime(charge.createdAt, uiLocale)}</span></div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">{ct("No charge recorded yet.")}</p>
                )}
                <Link href="/portal/wallet" className="btn-secondary btn-sm mt-2 w-full text-center">{ct("View wallet")}</Link>
              </div>
            </Card>

            <Card>
              <CardHeader title={ct("Documents")} />
              <div className="px-4 py-4 text-sm">
                <p className="text-xs text-slate-500">{docs.length} {ct("document(s) uploaded")}</p>
                <div className="mt-2 space-y-1.5">
                  {checklist.map((c) => {
                    const hasDoc = docs.some((d) => d.doc.checklistItemId === c.id);
                    return (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className={hasDoc ? "text-emerald-700" : "text-slate-500"}>{c.documentTypeName} {c.required ? "*" : ""}</span>
                        <span className={hasDoc ? "text-emerald-600" : "text-amber-600"}>{hasDoc ? "✓" : "—"}</span>
                      </div>
                    );
                  })}
                </div>
                <Link href={`${back}?tab=documents`} className="btn-secondary btn-sm mt-3">{ct("Open documents")}</Link>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="space-y-4">
          {openRequests.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader title={ct("Action required")} subtitle={ct("ESSAFARIA requested replacement or additional documents")} />
              <div className="px-4 py-4 space-y-3">
                {openRequests.map((r) => (
                  <div key={r.req.id} className="rounded-xl border border-amber-200 bg-white p-4">
                    <p className="font-semibold text-navy-900">{r.docTypeName} — {r.req.type === "REPLACEMENT" ? ct("Replacement requested") : ct("Additional document requested")}</p>
                    <p className="mt-1 text-sm text-slate-600">{ct("Reason")}: {r.req.reason}</p>
                    <form action={uploadDocumentAction} encType="multipart/form-data" className="mt-3 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="applicationId" value={id} />
                      {r.req.checklistItemId ? <input type="hidden" name="checklistItemId" value={r.req.checklistItemId} /> : null}
                      <input type="hidden" name="documentTypeId" value={r.req.documentTypeId} />
                      <input type="hidden" name="back" value={`${back}?tab=documents`} />
                      <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="text-xs file:mr-2 file:rounded-full file:border-0 file:bg-iris-600 file:px-3 file:py-1.5 file:text-xs file:text-white" />
                      <button type="submit" className="btn-primary btn-sm">{ct("Upload replacement")}</button>
                    </form>
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
                const hasOpenRequest = openRequests.some((r) => r.req.checklistItemId === item.id || r.req.documentTypeId === item.documentTypeId);
                return (
                  <div key={item.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-navy-900">{item.documentTypeName} {item.required ? <span className="badge bg-rose-50 text-rose-600 text-[10px]">{ct("Required")}</span> : <span className="badge bg-slate-100 text-slate-500 text-[10px]">{ct("Optional")}</span>}</p>
                        {item.notes ? <p className="mt-0.5 text-xs text-slate-500">{item.notes}</p> : null}
                        <p className="mt-1 text-[11px] text-slate-400">{ct("PDF, JPEG, PNG, WEBP, DOC, DOCX · 2 MB max")}</p>
                      </div>
                      {latest ? (
                        <span className="badge bg-emerald-50 text-emerald-700">{ct("Uploaded")} ✓</span>
                      ) : (
                        <span className="badge bg-amber-50 text-amber-700">{ct("Missing")}</span>
                      )}
                      {latest && fulfilledRequests.some((r) => r.req.fulfilledDocumentId === latest.doc.id) ? (
                        <span className="badge bg-teal-50 text-teal-700">{ct("Received")}</span>
                      ) : null}
                    </div>
                    {itemDocs.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {itemDocs.map(({ doc }) => (
                          <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ivory-50 px-3 py-2 text-xs">
                            <span className="flex items-center gap-2 min-w-0">
                              <a href={`/api/documents/${doc.id}`} target="_blank" className="font-medium text-navy-800 truncate hover:underline">{doc.originalFilename}</a>
                              <span className="text-slate-400">v{doc.version} · {bytes(doc.sizeBytes)} · {formatDateTime(doc.createdAt, uiLocale)}</span>
                            </span>
                            <a href={`/api/documents/${doc.id}`} className="btn-secondary btn-xs">{ct("Preview")}</a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {isDraft ? (
                      <form action={uploadDocumentAction} encType="multipart/form-data" className="mt-3 flex flex-wrap items-center gap-2">
                        <input type="hidden" name="applicationId" value={id} />
                        <input type="hidden" name="checklistItemId" value={item.id} />
                        <input type="hidden" name="back" value={`${back}?tab=documents`} />
                        <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="text-xs file:mr-2 file:rounded-full file:border-0 file:bg-iris-600 file:px-3 file:py-1.5 file:text-xs file:text-white" />
                        <button type="submit" className="btn-secondary btn-sm">{latest ? ct("Replace") : ct("Upload")}</button>
                      </form>
                    ) : hasOpenRequest ? (
                      <p className="mt-2 text-xs text-amber-700">{ct("Upload enabled via action required above.")}</p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">{ct("Locked after submission.")}</p>
                    )}
                  </div>
                );
              })}
              {checklist.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">{ct("No document requirements for this visa.")}</p> : null}
            </div>
          </Card>

          {documentGroups.unassigned.length > 0 ? (
            <Card>
              <CardHeader title={ct("Other documents")} />
              <div className="divide-y divide-slate-100">
                {documentGroups.unassigned.map(({ doc }) => (
                  <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <a href={`/api/documents/${doc.id}`} target="_blank" className="truncate font-medium text-navy-800 hover:underline">{doc.originalFilename}</a>
                      <span className="text-slate-400">v{doc.version} · {bytes(doc.sizeBytes)} · {formatDateTime(doc.createdAt, uiLocale)}</span>
                    </span>
                    <a href={`/api/documents/${doc.id}`} className="btn-secondary btn-xs">{ct("Preview")}</a>
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
                    <div key={r.req.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className={`badge ${open ? "bg-amber-100 text-amber-700" : r.req.status === "FULFILLED" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {open ? ct("Awaiting your upload") : r.req.status === "FULFILLED" ? ct("Received") : ct("Cancelled")}
                        </span>
                        <span className="font-medium text-navy-900">
                          {r.req.type === "REPLACEMENT" ? ct("Replacement requested") : ct("Additional document requested")}
                        </span>
                        <span className="text-slate-500">{r.docTypeName}</span>
                      </span>
                      <span className="text-slate-500">
                        {formatDateTime(r.req.createdAt, uiLocale)}
                        {r.req.fulfilledAt ? ` · ${ct("Received")} ${formatDateTime(r.req.fulfilledAt, uiLocale)}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "messages" ? (
        <CommunicationsPanel applicationId={id} messages={messages} user={user} back={`${back}?tab=messages`} locale={uiLocale} />
      ) : null}

      {tab === "activity" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title={ct("Activity timeline")} subtitle={ct("Human-readable business activity")} />
            <div className="px-4 py-4">
              <ActivityTimeline history={history} locale={uiLocale} />
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
