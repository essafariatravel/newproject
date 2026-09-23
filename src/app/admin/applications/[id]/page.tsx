import Link from "next/link";
import { notFound } from "next/navigation";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { getApplicationDetail } from "@/lib/queries";
import {
  allowedNextStatuses,
  decisionOutcomesForStatus,
  getChecklist,
  getDecisionDocuments,
  getStatusHistory,
} from "@/lib/applications";
import { listApplicantsForApplication, listDocumentsForApplication } from "@/lib/documents";
import { listDocumentRequests } from "@/lib/document-requests";
import { findTransactionByApplication } from "@/lib/wallet";
import { listCommunications } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { getUiLocale, localizedStatusName, localizedDocTypeName } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { formatAmount, formatDateTime } from "@/lib/format";
import { nationalityLabel } from "@/lib/nationalities";
import { OVERRIDE_ROLES } from "@/lib/types";
import { staffDirectory } from "@/app/actions/communications";
import {
  assignOfficerAction,
  changeStatusAction,
  recordDecisionAction,
  updateInternalNotesAction,
} from "@/app/actions/applications";
import { requestAdditionalDocumentAction, requestReplacementAction } from "@/app/actions/documents";
import { SubmitButton } from "@/components/forms";
import { Card, CardHeader, Flash, PageHeader, Tabs } from "@/components/ui";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import {
  ActivityTimeline,
  CommunicationsPanel,
  PriceAdjustmentHistory,
} from "@/components/application-detail";
import { getApplicationPricing } from "@/lib/price-adjustments";
import { applyPriceAdjustmentAction } from "@/app/actions/pricing";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "overview", label: "Dossier" },
  { id: "documents", label: "Documents" },
  { id: "billing", label: "Billing" },
  { id: "communications", label: "Communications" },
  { id: "activity", label: "Activity" },
];

export default async function AdminApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && TABS.some((t) => t.id === sp.tab) ? sp.tab : "overview";
  const user = await pageUser();
  const detail = await getApplicationDetail(id, user);
  if (!detail) notFound();
  const app = detail.app;

  const canAdjustPrice = hasPermission(user, "applications.pricing.adjust");
  const idempotencyKey = `adj-${id}-${Math.random().toString(36).slice(2, 14)}`;

  const back = `/admin/applications/${id}`;
  const [applicants, docs, checklist, history, messages, charge, nextStatuses, officers, decisionDocs, pricing, docRequests] =
    await Promise.all([
      listApplicantsForApplication(id),
      listDocumentsForApplication(id),
      getChecklist(id),
      getStatusHistory(id),
      listCommunications(id, user),
      findTransactionByApplication(id),
      allowedNextStatuses(app.statusId, user.role),
      hasPermission(user, "applications.assign") ? staffDirectory() : Promise.resolve([]),
      getDecisionDocuments(id),
      getApplicationPricing(id),
      listDocumentRequests(id),
    ]);

  const selectableStatuses = nextStatuses.filter((s) => !["APPROVED", "REJECTED"].includes(s.status.code));
  const allowedDecisionOutcomes = decisionOutcomesForStatus(detail.statusCode);
  const canStatusChange = hasPermission(user, "applications.status.change");
  const canReview = hasPermission(user, "applications.review");
  const _canOverride = hasPermission(user, "applications.submit.override") && OVERRIDE_ROLES.includes(user.role);
  const flash = flashFrom(sp);
  const uiLocale = await getUiLocale();
  const ct = contentT(uiLocale);
  const applicant = applicants[0];
  const _openRequests = docRequests.filter((r) => r.req.status === "OPEN");

  return (
    <>
      <PageHeader
        title={app.reference}
        subtitle={`${app.countryName} · ${app.visaTypeName} — ${detail.agencyName ?? ""}`}
        actions={
          <>
            <StatusBadge code={detail.statusCode} name={detail.statusName} />
            <PriorityBadge name={detail.priorityName} weight={detail.priorityWeight} />
            <Link href="/admin/applications" className="btn-secondary btn-sm">← All applications</Link>
          </>
        }
      />
      <Flash {...flash} />
      <Tabs tabs={TABS.map((t) => ({ ...t, label: ct(t.label), href: `${back}?tab=${t.id}` }))} current={tab} />

      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardHeader title={ct("Dossier")} />
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct("Applicant")}</p>
                  <p className="mt-1 font-semibold text-navy-900">{applicant?.fullName || `${applicant?.firstName ?? ""} ${applicant?.lastName ?? ""}`.trim() || "—"}</p>
                  <p className="text-xs text-slate-500">{ct("Nationality")}: {applicant ? nationalityLabel(applicant.nationality, uiLocale) : "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct("Agency")}</p>
                  <p className="mt-1 font-medium text-navy-900">{detail.agencyName}</p>
                  <p className="text-xs text-slate-500">{app.reference} · {formatDateTime(app.submittedAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct("Destination")}</p>
                  <p className="mt-1 font-medium text-navy-900">{app.countryName}</p>
                  <p className="text-xs text-slate-500">{app.visaTypeName} · {app.categoryName}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{ct("Fee")}</p>
                  <p className="mt-1 font-semibold tabular-nums">{formatAmount(app.fee, "DZD", uiLocale)}</p>
                  <p className="text-xs text-slate-500">{ct("Processing time")}: {app.processingMinDays}–{app.processingMaxDays} {ct("days")}</p>
                </div>
              </div>
            </Card>

            {canStatusChange ? (
              <Card>
                <CardHeader title={ct("Workflow")} subtitle={ct("Direct transition IN_PROCESS → APPROVED/REJECTED via decision only. Routine transitions validated.")} />
                <form action={changeStatusAction} className="flex flex-wrap items-end gap-3 px-4 py-4">
                  <input type="hidden" name="applicationId" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <div>
                    <label className="label">{ct("Change status to")}</label>
                    <select name="toStatusCode" className="input w-56" required>
                      {selectableStatuses.length === 0 ? <option value="">{ct("No routine transitions available")}</option> : null}
                      {selectableStatuses.map((s) => (
                        <option key={s.status.id} value={s.status.code}>{s.status.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-[220px] flex-1">
                    <label className="label">{ct("Reason (recommended)")}</label>
                    <input name="reason" className="input" placeholder={ct("Why is the status changing?")} />
                  </div>
                  <SubmitButton className="btn-primary" pendingLabel="Updating…">{ct("Update status")}</SubmitButton>
                </form>
              </Card>
            ) : null}

            {canReview ? (
              <Card className="border-navy-200">
                <CardHeader title={ct("Final decision")} subtitle={ct("Upload embassy outcome and record atomically — the only path to APPROVED/REJECTED.")} />
                {decisionDocs.length > 0 ? (
                  <ul className="space-y-2 px-4 py-3 text-sm">
                    {decisionDocs.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-ivory-50/60 px-3 py-2">
                        <div>
                          <p className="font-medium text-navy-900">{localizedDocTypeName(d.typeCode, d.typeName, uiLocale)}</p>
                          <p className="text-xs text-slate-500">{formatDateTime(d.createdAt)} · {d.status}</p>
                        </div>
                        <a href={`/api/documents/${d.id}`} className="btn-secondary btn-sm">{ct("Download")}</a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 pt-1 text-xs text-slate-500">{ct("No decision document recorded yet.")}</p>
                )}
                {allowedDecisionOutcomes.length > 0 ? (
                  <form action={recordDecisionAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-3 px-4 py-4">
                    <input type="hidden" name="applicationId" value={id} />
                    <input type="hidden" name="back" value={back} />
                    <div>
                      <label className="label">{ct("Outcome")}</label>
                      <select name="outcome" className="input w-44" required>
                        {allowedDecisionOutcomes.map((o) => (
                          <option key={o} value={o}>{localizedStatusName(o, o, uiLocale)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-[260px] flex-1">
                      <label className="label">{ct("Decision document (PDF/JPG/PNG, mandatory)")}</label>
                      <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required className="input" />
                    </div>
                    <SubmitButton className="btn-primary" pendingLabel="Recording…">{ct("Record decision")}</SubmitButton>
                  </form>
                ) : (
                  <p className="px-4 pb-4 text-xs text-slate-500">{["APPROVED","REJECTED","COMPLETED","CANCELLED"].includes(detail.statusCode) ? ct("File closed.") : ct("Decisions unlock in Processing / Awaiting Decision.")}</p>
                )}
              </Card>
            ) : null}

            {canReview ? (
              <Card>
                <CardHeader title={ct("Internal notes")} subtitle={ct("Never visible to the agency.")} />
                <form action={updateInternalNotesAction} className="px-4 py-4">
                  <input type="hidden" name="applicationId" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <textarea name="internalNotes" rows={3} defaultValue={app.internalNotes ?? ""} className="input" placeholder={ct("Case-officer notes…")} />
                  <div className="mt-2.5"><SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">{ct("Save notes")}</SubmitButton></div>
                </form>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            {hasPermission(user, "applications.assign") ? (
              <Card>
                <CardHeader title={ct("Case officer")} />
                <form action={assignOfficerAction} className="flex items-end gap-2 px-4 py-4">
                  <input type="hidden" name="applicationId" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <div className="flex-1">
                    <label className="label">{ct("Assigned to")}</label>
                    <select name="assignedTo" defaultValue={app.assignedTo ?? ""} className="input">
                      <option value="">{ct("Unassigned")}</option>
                      {officers.map((o) => (
                        <option key={o.id} value={o.id}>{o.name} ({o.role.replaceAll("_"," ")})</option>
                      ))}
                    </select>
                  </div>
                  <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">Save</SubmitButton>
                </form>
              </Card>
            ) : null}

            <Card>
              <CardHeader title={ct("Billing")} />
              <div className="p-4 text-sm space-y-2">
                <div className="flex justify-between"><span className="text-slate-500">{ct("Fee")}</span><span className="font-medium tabular-nums">{formatAmount(app.fee, "DZD", uiLocale)}</span></div>
                {charge ? (
                  <>
                    <div className="flex justify-between"><span className="text-slate-500">{ct("Charged")}</span><span className="tabular-nums">{formatAmount(charge.amount, "DZD", uiLocale)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">{ct("Balance after")}</span><span className="tabular-nums">{formatAmount(charge.balanceAfter, "DZD", uiLocale)}</span></div>
                  </>
                ) : null}
                {app.overrideReason ? <p className="text-xs text-amber-700">Override: {app.overrideReason}</p> : null}
              </div>
            </Card>

            {pricing ? <PriceAdjustmentHistory pricing={pricing} locale={uiLocale} /> : null}

            {canAdjustPrice && pricing?.submittedPrice ? (
              <Card>
                <CardHeader title={ct("Adjust price")} subtitle={ct("Immutable adjustment + compensating wallet entry")} />
                <form action={applyPriceAdjustmentAction} className="grid grid-cols-1 gap-3 p-4">
                  <input type="hidden" name="applicationId" value={id} />
                  <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
                  <div>
                    <label className="label">{ct("Type")} *</label>
                    <select name="type" required className="input" defaultValue="DISCOUNT">
                      <option value="DISCOUNT">{ct("Discount")}</option>
                      <option value="REFUND">{ct("Refund")}</option>
                      <option value="SURCHARGE">{ct("Surcharge")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">{ct("Amount (DZD)")} *</label>
                    <input name="amount" required inputMode="decimal" className="input" placeholder="2000.00" />
                  </div>
                  <div>
                    <label className="label">{ct("Reason")} *</label>
                    <input name="reason" required minLength={8} className="input" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input name="confirm" type="checkbox" required className="h-4 w-4 rounded border-slate-300" />
                    <label className="text-xs text-slate-700">{ct("I confirm this commercial adjustment")}</label>
                  </div>
                  <SubmitButton className="btn-primary btn-sm" pendingLabel="Applying…">{ct("Apply adjustment")}</SubmitButton>
                </form>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title={ct("Documents")} subtitle={`${docs.length} ${ct("uploaded")} · ${checklist.length} ${ct("requirements")}`} />
            <div className="divide-y divide-slate-100">
              {checklist.map((item) => {
                const itemDocs = docs.filter((d) => d.doc.checklistItemId === item.id).sort((a,b) => b.doc.version - a.doc.version);
                const latest = itemDocs[0];
                return (
                  <div key={item.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-navy-900">{item.documentTypeName} {item.required ? <span className="badge bg-rose-50 text-rose-600 text-[10px]">Required</span> : null}</p>
                        {item.notes ? <p className="mt-0.5 text-xs text-slate-500">{item.notes}</p> : null}
                      </div>
                      {latest ? <span className="badge bg-emerald-50 text-emerald-700">Uploaded</span> : <span className="badge bg-amber-50 text-amber-700">Missing</span>}
                    </div>
                    {itemDocs.length > 0 ? (
                      <ul className="mt-3 space-y-1.5">
                        {itemDocs.map(({ doc, applicantName }) => (
                          <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ivory-50 px-3 py-2 text-xs">
                            <span className="flex items-center gap-2 min-w-0">
                              <a href={`/api/documents/${doc.id}`} target="_blank" className="font-medium truncate hover:underline">{doc.originalFilename}</a>
                              <span className="text-slate-400">v{doc.version} · {doc.status} · {formatDateTime(doc.createdAt)}</span>
                              {applicantName ? <span className="text-slate-500">· {applicantName}</span> : null}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <a href={`/api/documents/${doc.id}`} className="btn-secondary btn-xs">Preview</a>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <form action={requestReplacementAction} className="mt-3 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="applicationId" value={id} />
                      <input type="hidden" name="checklistItemId" value={item.id} />
                      <input type="hidden" name="back" value={`${back}?tab=documents`} />
                      <div className="flex-1 min-w-[180px]">
                        <input name="reason" required minLength={5} placeholder={ct("Reason to request replacement")} className="input text-xs" />
                      </div>
                      <SubmitButton className="btn-secondary btn-xs" pendingLabel="…">{ct("Request replacement")}</SubmitButton>
                    </form>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title={ct("Request additional document")} subtitle={ct("Creates an extra requirement and notifies agency")} />
            <form action={requestAdditionalDocumentAction} className="flex flex-wrap items-end gap-3 p-4">
              <input type="hidden" name="applicationId" value={id} />
              <input type="hidden" name="back" value={`${back}?tab=documents`} />
              <div className="min-w-[200px] flex-1">
                <label className="label">{ct("Document type")} *</label>
                <select name="documentTypeId" required className="input">
                  <option value="">{ct("Select type")}</option>
                  {checklist.filter((c) => c.documentTypeId).map((c) => (
                    <option key={c.documentTypeId!} value={c.documentTypeId!}>{c.documentTypeName}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[240px] flex-1">
                <label className="label">{ct("Reason")} *</label>
                <input name="reason" required minLength={5} className="input" placeholder={ct("Embassy requested additional…")} />
              </div>
              <SubmitButton className="btn-primary btn-sm" pendingLabel="Requesting…">{ct("Request additional")}</SubmitButton>
            </form>
          </Card>

          {docRequests.length > 0 ? (
            <Card>
              <CardHeader title={ct("Document requests history")} />
              <div className="divide-y divide-slate-100 text-xs">
                {docRequests.map((r) => (
                  <div key={r.req.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span><span className={`badge ${r.req.status === "OPEN" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{r.req.status}</span> {r.req.type} · {r.docTypeName}</span>
                    <span className="text-slate-500">{r.req.reason} · {formatDateTime(r.req.createdAt)}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "billing" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={ct("Billing")} />
            <div className="p-4 text-sm space-y-2">
              <div className="flex justify-between"><span className="text-slate-500">{ct("Fee")}</span><span className="font-medium tabular-nums">{formatAmount(app.fee, "DZD", uiLocale)}</span></div>
              {charge ? (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">{ct("Amount")}</span><span>{formatAmount(charge.amount, "DZD", uiLocale)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">{ct("Balance before")}</span><span>{formatAmount(charge.balanceBefore, "DZD", uiLocale)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">{ct("Balance after")}</span><span>{formatAmount(charge.balanceAfter, "DZD", uiLocale)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">{ct("Reference")}</span><span className="font-mono text-xs">{(charge as { reference?: string | null }).reference ?? charge.id.slice(0,8)}</span></div>
                </>
              ) : <p className="text-xs text-slate-500">{ct("No charge recorded")}</p>}
            </div>
          </Card>
          {pricing ? <PriceAdjustmentHistory pricing={pricing} locale={uiLocale} /> : null}
        </div>
      ) : null}

      {tab === "communications" ? (
        <CommunicationsPanel applicationId={id} messages={messages} user={user} back={`${back}?tab=communications`} locale={uiLocale} />
      ) : null}

      {tab === "activity" ? (
        <div className="space-y-4">
          <ActivityTimeline history={history} locale={uiLocale} />
        </div>
      ) : null}
    </>
  );
}
