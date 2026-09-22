import { formatProcessingDays } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { applicants as applicantsTb } from "@/db/schema";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { getApplicationDetail } from "@/lib/queries";
import {
  allowedNextStatuses,
  decisionOutcomesForStatus,
  getChecklist,
  getDecisionDocuments,
  getStatusByCode,
  getStatusHistory,
} from "@/lib/applications";
import { listApplicantsForApplication, listDocumentsForApplication } from "@/lib/documents";
import { findTransactionByApplication } from "@/lib/wallet";
import { listCommunications } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { getUiLocale, localizedStatusName, localizedDocTypeName } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { formatDate, formatDateTime, personName } from "@/lib/format";
import { OVERRIDE_ROLES, type AuthUser } from "@/lib/types";
import { staffDirectory } from "@/app/actions/communications";
import {
  assignOfficerAction,
  changeStatusAction,
  recordDecisionAction,
  submissionGateFor,
  updateInternalNotesAction,
} from "@/app/actions/applications";
import { SubmitButton } from "@/components/forms";
import { Card, CardHeader, Flash, KeyValue, PageHeader, Tabs,  } from "@/components/ui";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import {
  ActivityTimeline,
  BillingSummary,
  ChecklistTable,
  CommunicationsPanel,
  DocumentList,
} from "@/components/application-detail";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "applicants", label: "Applicants" },
  { id: "documents", label: "Documents" },
  { id: "checklist", label: "Checklist" },
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

  const back = `/admin/applications/${id}`;
  const [applicants, docs, checklist, history, messages, charge, gate, nextStatuses, draftStatus, officers, decisionDocs] =
    await Promise.all([
      listApplicantsForApplication(id),
      listDocumentsForApplication(id),
      getChecklist(id),
      getStatusHistory(id),
      listCommunications(id, user),
      findTransactionByApplication(id),
      submissionGateFor(id),
      allowedNextStatuses(app.statusId, user.role),
      getStatusByCode("DRAFT"),
      hasPermission(user, "applications.assign") ? staffDirectory() : Promise.resolve([]),
      getDecisionDocuments(id),
    ]);
  // PHASE 2.1: final outcomes are never offered as bare status changes —
  // they require the decision-document workflow below.
  const selectableStatuses = nextStatuses.filter((s) => !["APPROVED", "REJECTED"].includes(s.status.code));
  const allowedDecisionOutcomes = decisionOutcomesForStatus(detail.statusCode);
  const isDraft = app.statusId === draftStatus.id;
  const canStatusChange = hasPermission(user, "applications.status.change");
  const canReview = hasPermission(user, "applications.review");
  const canOverride = hasPermission(user, "applications.submit.override") && OVERRIDE_ROLES.includes(user.role);
  const flash = flashFrom(sp);
  const uiLocale = await getUiLocale();
  const ct = contentT(uiLocale);

  return (
    <>
      <PageHeader
        title={app.reference}
        subtitle={`${app.countryName} · ${app.categoryName} · ${app.visaTypeName} — ${detail.agencyName ?? ""}`}
        actions={
          <>
            <StatusBadge code={detail.statusCode} name={detail.statusName} />
            <PriorityBadge name={detail.priorityName} weight={detail.priorityWeight} />
            <Link href="/admin/applications" className="btn-secondary btn-sm">
              ← All applications
            </Link>
          </>
        }
      />
      <Flash {...flash} />

      <Tabs tabs={TABS.map((t) => ({ ...t, href: `${back}?tab=${t.id}` }))} current={tab} />

      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardHeader title="Application" />
              <KeyValue
                items={[
                  { label: "Reference", value: app.reference },
                  { label: "Agency", value: detail.agencyName },
                  { label: "Country", value: app.countryName },
                  { label: "Visa type", value: `${app.visaTypeName} (${app.visaTypeCode})` },
                  { label: "Category", value: app.categoryName },
                  { label: "Fee (snapshot)", value: `${app.fee} ${app.currency}` },
                  { label: "Processing time", value: formatProcessingDays(app.processingMinDays, app.processingMaxDays) },
                  { label: "Created", value: formatDateTime(app.createdAt) },
                  { label: "Submitted", value: formatDateTime(app.submittedAt) },
                  { label: "Applicants", value: String(applicants.length) },
                  {
                    label: "Documents",
                    value: `${docs.length} uploaded · ${gate.missing.length} required missing`,
                  },
                  {
                    label: "Gate",
                    value: gate.ok ? (
                      <span className="text-emerald-700">Ready (all required documents present)</span>
                    ) : (
                      <span className="text-amber-700">Blocked — missing: {gate.missing.join(", ")}</span>
                    ),
                  },
                ]}
              />
            </Card>

            {canStatusChange ? (
              <Card>
                <CardHeader title={ct("Workflow")} subtitle={ct("Status changes are validated, logged and notify the agency.")} />
                <form action={changeStatusAction} className="flex flex-wrap items-end gap-3 px-4 py-4">
                  <input type="hidden" name="applicationId" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <div>
                    <label className="label" htmlFor="toStatus">{ct("Change status to")}</label>
                    <select id="toStatus" name="toStatusCode" className="input w-56" required>
                      {selectableStatuses.length === 0 ? <option value="">No routine transitions available</option> : null}
                      {selectableStatuses.map((s) => (
                        <option key={s.status.id} value={s.status.code}>
                          {s.status.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-[220px] flex-1">
                    <label className="label" htmlFor="reason">Reason (recommended)</label>
                    <input id="reason" name="reason" className="input" placeholder={ct("Why is the status changing?")} />
                  </div>
                  <SubmitButton className="btn-primary" pendingLabel="Updating…">
                    {ct("Update status")}
                  </SubmitButton>
                </form>
              </Card>
            ) : null}

            {isDraft && gate.missing.length > 0 && canOverride ? (
              <Card className="border-amber-300">
                <CardHeader title={ct("Submission gate override")} subtitle={ct("The agency cannot submit while documents are missing. Staff may override with a mandatory reason.")} />
                <form action={submitWithOverrideAdminAction} className="flex flex-wrap items-end gap-3 px-4 py-4">
                  <input type="hidden" name="applicationId" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <div className="min-w-[260px] flex-1">
                    <label className="label" htmlFor="overrideReason">{ct("Override reason (mandatory, min 10 chars)")}</label>
                    <input id="overrideReason" name="overrideReason" className="input" minLength={10} required placeholder={ct("Why is this file allowed through without all documents?")} />
                  </div>
                  <SubmitButton className="btn-gold" pendingLabel="Submitting…">Submit with override</SubmitButton>
                </form>
              </Card>
            ) : null}

            {canReview ? (
              <Card className="border-navy-200">
                <CardHeader
                  title={ct("Final decision")}
                  subtitle="Upload the embassy outcome and record it atomically: accepted document + status change + agency notification. This is the only path to approved/refused/rejected."
                />
                {decisionDocs.length > 0 ? (
                  <ul className="space-y-2 px-4 py-3 text-sm">
                    {decisionDocs.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-ivory-50/60 px-3 py-2">
                        <div>
                          <p className="font-medium text-navy-900">{localizedDocTypeName(d.typeCode, d.typeName, uiLocale)}</p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(d.createdAt)} · <span className="badge bg-emerald-100 text-emerald-800">{d.status}</span>
                          </p>
                        </div>
                        <a href={`/api/documents/${d.id}`} className="btn-secondary btn-sm">Download PDF/document</a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 pt-1 text-xs text-slate-500">{ct("No decision document recorded yet.")}</p>
                )}
                {canReview && allowedDecisionOutcomes.length > 0 ? (
                  <form action={recordDecisionAction} className="flex flex-wrap items-end gap-3 px-4 py-4">
                    <input type="hidden" name="applicationId" value={id} />
                    <input type="hidden" name="back" value={back} />
                    <div>
                      <label className="label" htmlFor="outcome">{ct("Outcome")}</label>
                      <select id="outcome" name="outcome" className="input w-44" required>
                        {allowedDecisionOutcomes.map((o) => (
                          <option key={o} value={o}>{localizedStatusName(o, o, uiLocale)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-[260px] flex-1">
                      <label className="label" htmlFor="decision-file">{ct("Decision document (PDF/JPG/PNG, mandatory)")}</label>
                      <input id="decision-file" name="file" type="file" accept="application/pdf,image/jpeg,image/png" required className="input" />
                    </div>
                    <SubmitButton className="btn-primary" pendingLabel="Recording decision…">Record decision</SubmitButton>
                  </form>
                ) : (
                  <p className="px-4 pb-4 text-xs text-slate-500">
                    {["APPROVED", "REJECTED", "COMPLETED", "CANCELLED"].includes(detail.statusCode)
                      ? "The file is closed — no further decision can be recorded."
                      : "Decisions unlock once the file is in Processing / Awaiting Decision. Approvals are double-gated: move the file to Awaiting Decision first."}
                  </p>
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
                  <div className="mt-2.5">
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">{ct("Save notes")}</SubmitButton>
                  </div>
                </form>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            {hasPermission(user, "applications.assign") ? (
              <Card>
                <CardHeader title="Case officer" />
                <form action={assignOfficerAction} className="flex items-end gap-2 px-4 py-4">
                  <input type="hidden" name="applicationId" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <div className="flex-1">
                    <label className="label" htmlFor="assignedTo">Assigned to</label>
                    <select id="assignedTo" name="assignedTo" defaultValue={app.assignedTo ?? ""} className="input">
                      <option value="">Unassigned</option>
                      {officers.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} ({o.role.replaceAll("_", " ")})
                        </option>
                      ))}
                    </select>
                  </div>
                  <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">Save</SubmitButton>
                </form>
              </Card>
            ) : null}
            <BillingSummary application={app} charge={charge} />
          </div>
        </div>
      ) : null}

      {tab === "applicants" ? <ApplicantsTab applicants={applicants} /> : null}

      {tab === "documents" ? (
        <DocumentList documents={docs} user={user} applicationId={id} isDraft={isDraft} />
      ) : null}

      {tab === "checklist" ? (
        <ChecklistTable
          items={checklist}
          documents={docs}
          applicationId={id}
          user={user}
          applicants={applicants}
          back={back}
        />
      ) : null}

      {tab === "billing" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BillingSummary application={app} charge={charge} />
          {app.overrideReason ? (
            <Card>
              <CardHeader title="Submission override" />
              <p className="px-4 py-4 text-sm text-slate-700">
                This file was submitted by staff override. Reason: “{app.overrideReason}”
              </p>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "communications" ? (
        <CommunicationsPanel applicationId={id} messages={messages} user={user} back={`${back}?tab=communications`} />
      ) : null}

      {tab === "activity" ? <ActivityTimeline history={history} /> : null}
    </>
  );
}

function ApplicantsTab({ applicants }: { applicants: Array<typeof applicantsTb.$inferSelect> }) {
  if (applicants.length === 0) {
    return (
      <Card>
        <p className="px-4 py-10 text-center text-sm text-slate-500">No applicants on this application yet.</p>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {applicants.map((a) => (
        <Card key={a.id}>
          <CardHeader title={personName(a)} subtitle={`Passport ${a.passportNumber}`} />
          <KeyValue
            items={[
              { label: "Date of birth", value: formatDate(a.dateOfBirth) },
              { label: "Gender", value: a.gender ?? "—" },
              { label: "Nationality", value: a.nationality },
              { label: "Passport expiry", value: formatDate(a.passportExpiryDate) },
              { label: "Email", value: a.email ?? "—" },
              { label: "Phone", value: a.phone ?? "—" },
            ]}
          />
        </Card>
      ))}
    </div>
  );
}

/* Staff-side override submit (wraps the shared submission service). */
import { submitApplication } from "@/lib/applications";
import { runAction } from "@/lib/action-helpers";
import { revalidatePath } from "next/cache";

async function submitWithOverrideAdminAction(formData: FormData): Promise<void> {
  "use server";
  const applicationId = String(formData.get("applicationId"));
  const back = String(formData.get("back") ?? `/admin/applications/${applicationId}`);
  await runAction(back, async () => {
    const user: AuthUser = await pageUser();
    const result = await submitApplication({
      applicationId,
      actor: user,
      overrideReason: String(formData.get("overrideReason") ?? ""),
    });
    revalidatePath(back);
    revalidatePath("/admin");
    return `Application ${result.reference} submitted with override. Wallet charged — new balance ${result.charge.balanceAfter}.`;
  });
}
