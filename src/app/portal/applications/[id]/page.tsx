import { formatProcessingDays } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { portalPageUser } from "@/lib/page-auth";
import { getApplicationDetail } from "@/lib/queries";
import {
  allowedNextStatuses,
  checklistProgress,
  getChecklist,
  getDecisionDocuments,
  getStatusByCode,
  getStatusHistory,
} from "@/lib/applications";
import { listApplicantsForApplication, listDocumentsForApplication } from "@/lib/documents";
import { findTransactionByApplication, getBalance, formatMoney } from "@/lib/wallet";
import { listCommunications } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { getUiLocale, localizedDocTypeName } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { formatDate, formatDateTime, personName } from "@/lib/format";
import {
  addApplicantAction,
  cancelDraftAction,
  removeApplicantAction,
  submissionGateFor,
  submitApplicationAction,
  updateApplicantAction,
} from "@/app/actions/applications";
import { SubmitButton } from "@/components/forms";
import { Card, CardHeader, EmptyState, Flash, KeyValue, PageHeader, Progress, Tabs } from "@/components/ui";
import { DocStatusBadge, StatusBadge } from "@/components/badges";
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
  { id: "communications", label: "Messages" },
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

  const [applicants, docs, checklist, history, messages, charge, gate, draftStatus, wallet, progress, nextStatuses, decisionDocs] =
    await Promise.all([
      listApplicantsForApplication(id),
      listDocumentsForApplication(id),
      getChecklist(id),
      getStatusHistory(id),
      listCommunications(id, user),
      findTransactionByApplication(id),
      submissionGateFor(id),
      getStatusByCode("DRAFT"),
      getBalance(user.agencyId),
      checklistProgress(id),
      allowedNextStatuses(app.statusId, user.role),
      getDecisionDocuments(id),
    ]);
  const isDraft = app.statusId === draftStatus.id;
  const flash = flashFrom(sp);
  const uiLocale = await getUiLocale();
  const ct = contentT(await getUiLocale());
  const fee = Number(app.fee);
  const balance = Number(wallet.balance);
  const canAfford = balance >= fee;
  const canCancel = nextStatuses.some((s) => s.status.code === "CANCELLED");

  return (
    <>
      <PageHeader
        title={app.reference}
        subtitle={`${app.countryName} · ${app.categoryName} · ${app.visaTypeName}`}
        actions={
          <>
            <StatusBadge code={detail.statusCode} name={detail.statusName} />
            <Link href="/portal/applications" className="btn-secondary btn-sm">← All applications</Link>
          </>
        }
      />
      <Flash {...flash} />

      <Tabs tabs={TABS.map((t) => ({ ...t, href: `${back}?tab=${t.id}` }))} current={tab} />

      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardHeader title={ct("Application")} />
              <KeyValue
                items={[
                  { label: ct("Reference"), value: app.reference },
                  { label: ct("Visa type"), value: `${app.visaTypeName} (${app.visaTypeCode})` },
                  { label: ct("Category"), value: app.categoryName },
                  { label: ct("Country"), value: app.countryName },
                  { label: ct("Fee"), value: `${app.fee} ${app.currency}` },
                  { label: ct("Processing time"), value: formatProcessingDays(app.processingMinDays, app.processingMaxDays) },
                  { label: ct("Applicants"), value: String(applicants.length) },
                  { label: ct("Required documents"), value: `${progress.requiredComplete}/${progress.requiredTotal} ${ct("provided")}` },
                  { label: ct("Created"), value: formatDateTime(app.createdAt) },
                  { label: ct("Submitted"), value: formatDateTime(app.submittedAt) },
                  { label: ct("Your notes"), value: app.agencyNotes ?? "—" },
                ]}
              />
            </Card>

            {decisionDocs.length > 0 ? (
              <Card className="border-emerald-200">
                <CardHeader
                  title={ct("Official decision")}
                  subtitle={ct("Issued after submission and review — the embassy outcome, accepted and downloadable as PDF.")}
                />
                <ul className="space-y-2 px-4 py-4 text-sm">
                  {decisionDocs.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
                      <div>
                        <p className="font-medium text-navy-900">{localizedDocTypeName(d.typeCode, d.typeName, uiLocale)}</p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(d.createdAt)} ·{" "}
                          <span className="badge bg-emerald-100 text-emerald-800">{d.status}</span>
                        </p>
                      </div>
                      <a href={`/api/documents/${d.id}`} className="btn-primary btn-sm">{ct("Download")}</a>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {isDraft ? (
              <Card>
                <CardHeader
                  title={ct("Review & submit")}
                  subtitle={ct("Verify everything below. Submitting charges your wallet once and starts ESSAFARIA processing.")}
                />
                <div className="px-4 py-4">
                  <dl className="mb-4 grid grid-cols-1 gap-x-6 gap-y-2 rounded-md bg-ivory-50 p-4 text-sm sm:grid-cols-2">
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">{ct("Visa type")}</dt><dd className="font-medium">{app.visaTypeName}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">{ct("Processing time")}</dt><dd className="font-medium">{formatProcessingDays(app.processingMinDays, app.processingMaxDays)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">Applicants</dt><dd className="font-medium">{applicants.length}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">{ct("Required documents")}</dt><dd className="font-medium">{progress.requiredComplete}/{progress.requiredTotal} provided</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">{ct("Fee")}</dt><dd className="font-medium tabular-nums">{formatMoney(app.fee, app.currency)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">{ct("Total charge")}</dt><dd className="font-semibold tabular-nums">{formatMoney(app.fee, app.currency)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-slate-500">{ct("Wallet balance now")}</dt><dd className="tabular-nums">{formatMoney(wallet.balance, wallet.currency)}</dd></div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">{ct("Balance after charge")}</dt>
                      <dd className={`tabular-nums ${canAfford ? "text-emerald-700" : "text-red-600"}`}>
                        {canAfford ? formatMoney((balance - fee).toFixed(2), wallet.currency) : "insufficient funds"}
                      </dd>
                    </div>
                  </dl>

                  {!gate.ok ? (
                    <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Submission is blocked until all required documents are uploaded: {gate.missing.join(", ")}.
                    </p>
                  ) : null}
                  {applicants.length === 0 ? (
                    <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Add at least one applicant before submitting.
                    </p>
                  ) : null}
                  {!canAfford ? (
                    <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                      Wallet balance is too low for this application ({formatMoney(app.fee, app.currency)} required). Request a top-up from ESSAFARIA.
                    </p>
                  ) : null}

                  <form action={submitApplicationAction}>
                    <input type="hidden" name="applicationId" value={id} />
                    <input type="hidden" name="back" value={back} />
                    <SubmitButton
                      className="btn-gold"
                      pendingLabel="Submitting & charging wallet…"
                      disabled={!gate.ok || applicants.length === 0 || !canAfford}
                    >
                      Submit application & pay {formatMoney(app.fee, app.currency)}
                    </SubmitButton>
                  </form>
                </div>
              </Card>
            ) : null}

            {canCancel ? (
              <Card>
                <CardHeader title={ct("Cancel application")} subtitle={ct("Drafts can be cancelled free of charge. Cancelled files cannot be reopened.")} />
                <form action={cancelDraftAction} className="flex flex-wrap items-end gap-3 px-4 py-4">
                  <input type="hidden" name="applicationId" value={id} />
                  <input type="hidden" name="back" value={back} />
                  <div className="min-w-[240px] flex-1">
                    <label className="label" htmlFor="cancel-reason">{ct("Reason")}</label>
                    <input id="cancel-reason" name="reason" className="input" placeholder={ct("Client cancelled the trip")} />
                  </div>
                  <SubmitButton className="btn-danger" pendingLabel="Cancelling…">{ct("Cancel application")}</SubmitButton>
                </form>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            <BillingSummary application={app} charge={charge} />
            <Card>
              <CardHeader title={ct("Documents")} />
              <div className="px-4 py-4">
                <Progress done={progress.requiredComplete} total={progress.requiredTotal} />
                <p className="mt-2 text-xs text-slate-500">
                  {gate.ok
                    ? "All required documents provided."
                    : `Missing: ${gate.missing.join(", ")}`}
                </p>
                <Link href={`${back}?tab=checklist`} className="btn-secondary btn-sm mt-3">{ct("Open checklist")}</Link>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "applicants" ? (
        <div className="space-y-4">
          {applicants.map((a) => (
            <Card key={a.id}>
              <CardHeader
                title={personName(a)}
                subtitle={`Passport ${a.passportNumber}`}
                actions={
                  isDraft ? (
                    <form action={removeApplicantAction}>
                      <input type="hidden" name="applicantId" value={a.id} />
                      <input type="hidden" name="applicationId" value={id} />
                      <input type="hidden" name="back" value={`${back}?tab=applicants`} />
                      <SubmitButton className="btn-danger btn-sm" pendingLabel="…">{ct("Remove")}</SubmitButton>
                    </form>
                  ) : undefined
                }
              />
              {isDraft ? (
                <form action={updateApplicantAction} className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-3">
                  <input type="hidden" name="applicantId" value={a.id} />
                  <input type="hidden" name="applicationId" value={id} />
                  <input type="hidden" name="back" value={`${back}?tab=applicants`} />
                  <div><label className="label">{ct("First name")}</label><input name="firstName" defaultValue={a.firstName} required className="input" /></div>
                  <div><label className="label">{ct("Middle name")}</label><input name="middleName" defaultValue={a.middleName ?? ""} className="input" /></div>
                  <div><label className="label">{ct("Last name")}</label><input name="lastName" defaultValue={a.lastName} required className="input" /></div>
                  <div><label className="label">{ct("Date of birth")}</label><input name="dateOfBirth" type="date" defaultValue={a.dateOfBirth} required className="input" /></div>
                  <div>
                    <label className="label">{ct("Gender")}</label>
                    <select name="gender" defaultValue={a.gender ?? ""} className="input">
                      <option value="">—</option>
                      <option value="MALE">{ct("Male")}</option>
                      <option value="FEMALE">{ct("Female")}</option>
                      <option value="OTHER">{ct("Other")}</option>
                    </select>
                  </div>
                  <div><label className="label">{ct("Nationality")}</label><input name="nationality" defaultValue={a.nationality} required className="input" /></div>
                  <div><label className="label">{ct("Passport number")}</label><input name="passportNumber" defaultValue={a.passportNumber} required className="input" /></div>
                  <div><label className="label">{ct("Passport issue date")}</label><input name="passportIssueDate" type="date" defaultValue={a.passportIssueDate ?? ""} className="input" /></div>
                  <div><label className="label">{ct("Passport expiry")}</label><input name="passportExpiryDate" type="date" defaultValue={a.passportExpiryDate} required className="input" /></div>
                  <div><label className="label">{ct("Email")}</label><input name="email" type="email" defaultValue={a.email ?? ""} className="input" /></div>
                  <div><label className="label">{ct("Phone")}</label><input name="phone" defaultValue={a.phone ?? ""} className="input" /></div>
                  <div><label className="label">{ct("City")}</label><input name="city" defaultValue={a.city ?? ""} className="input" /></div>
                  <div className="sm:col-span-2"><label className="label">{ct("Address")}</label><input name="addressLine" defaultValue={a.addressLine ?? ""} className="input" /></div>
                  <div><label className="label">{ct("Country")}</label><input name="country" defaultValue={a.country ?? ""} className="input" /></div>
                  <div className="sm:col-span-3"><SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">{ct("Save applicant")}</SubmitButton></div>
                </form>
              ) : (
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
              )}
            </Card>
          ))}

          {isDraft ? (
            <Card>
              <CardHeader title={ct("Add applicant")} />
              <form action={addApplicantAction} className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-3">
                <input type="hidden" name="applicationId" value={id} />
                <input type="hidden" name="back" value={`${back}?tab=applicants`} />
                <div><label className="label">First name *</label><input name="firstName" required className="input" /></div>
                <div><label className="label">{ct("Middle name")}</label><input name="middleName" className="input" /></div>
                <div><label className="label">Last name *</label><input name="lastName" required className="input" /></div>
                <div><label className="label">Date of birth *</label><input name="dateOfBirth" type="date" required className="input" /></div>
                <div>
                  <label className="label">{ct("Gender")}</label>
                  <select name="gender" className="input">
                    <option value="">—</option>
                    <option value="MALE">{ct("Male")}</option>
                    <option value="FEMALE">{ct("Female")}</option>
                    <option value="OTHER">{ct("Other")}</option>
                  </select>
                </div>
                <div><label className="label">Nationality *</label><input name="nationality" required className="input" /></div>
                <div><label className="label">Passport number *</label><input name="passportNumber" required className="input" /></div>
                <div><label className="label">{ct("Passport issue date")}</label><input name="passportIssueDate" type="date" className="input" /></div>
                <div><label className="label">Passport expiry *</label><input name="passportExpiryDate" type="date" required className="input" /></div>
                <div><label className="label">{ct("Email")}</label><input name="email" type="email" className="input" /></div>
                <div><label className="label">{ct("Phone")}</label><input name="phone" className="input" /></div>
                <div><label className="label">{ct("City")}</label><input name="city" className="input" /></div>
                <div className="sm:col-span-2"><label className="label">{ct("Address")}</label><input name="addressLine" className="input" /></div>
                <div><label className="label">{ct("Country")}</label><input name="country" className="input" /></div>
                <div className="sm:col-span-3"><SubmitButton className="btn-primary" pendingLabel="Adding…">{ct("Add applicant")}</SubmitButton></div>
              </form>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "documents" ? <DocumentList documents={docs} user={user} applicationId={id} isDraft={isDraft} /> : null}

      {tab === "checklist" ? (
        <div className="space-y-4">
          <ChecklistTable items={checklist} documents={docs} applicationId={id} user={user} applicants={applicants} back={back} />
          {!isDraft && docs.length === 0 ? (
            <Card><EmptyState title={ct("No documents uploaded")} /></Card>
          ) : null}
        </div>
      ) : null}

      {tab === "billing" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BillingSummary application={app} charge={charge} />
          <Card>
            <CardHeader title={ct("Current wallet")} />
            <div className="px-4 py-4">
              <p className="font-serif text-2xl text-navy-900 tabular-nums">{formatMoney(wallet.balance, wallet.currency)}</p>
              <Link href="/portal/wallet" className="btn-secondary btn-sm mt-3">{ct("Open wallet & transactions")}</Link>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "communications" ? (
        <CommunicationsPanel applicationId={id} messages={messages} user={user} back={`${back}?tab=communications`} />
      ) : null}

      {tab === "activity" ? (
        <div className="space-y-4">
          <ActivityTimeline history={history} />
          {docs.some((d) => d.doc.status === "REJECTED" || d.doc.status === "RESUBMISSION_REQUIRED") ? (
            <Card>
              <CardHeader title={ct("Documents needing attention")} />
              <ul className="divide-y divide-slate-100 px-4">
                {docs
                  .filter((d) => d.doc.status === "REJECTED" || d.doc.status === "RESUBMISSION_REQUIRED")
                  .map(({ doc }) => (
                    <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="text-sm">{doc.originalFilename}</span>
                      <span className="flex items-center gap-2">
                        <DocStatusBadge status={doc.status} />
                        <Link href={`${back}?tab=documents`} className="btn-secondary btn-sm">{ct("Resubmit")}</Link>
                      </span>
                    </li>
                  ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
