import Link from "next/link";
import { notFound } from "next/navigation";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { getRegistrationDetail } from "@/lib/registrations";
import { flashFrom } from "@/lib/action-helpers";
import { formatDateTime, bytes } from "@/lib/format";
import {
  approveRegistrationAction,
  rejectRegistrationAction,
  requestRegistrationInfoAction,
  startRegistrationReviewAction,
  addRegistrationNoteAction,
  generateActivationLinkAction,
} from "@/app/actions/registration-admin";
import { ConfirmButton, SubmitButton } from "@/components/forms";
import { Card, CardHeader, Flash, KeyValue, PageHeader, StatusBadge, EmptyState } from "@/components/ui";
import { LOCALE_NAMES, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const DOC_CATEGORY_LABELS: Record<string, string> = {
  COMMERCIAL_REGISTRATION: "Commercial registration",
  AGENCY_LICENCE: "Agency licence / accreditation",
  TAX_DOCUMENT: "Tax / company document",
  OTHER: "Other supporting document",
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  TRAVEL_AGENCY: "Travel Agency",
  TOUR_OPERATOR: "Tour Operator",
  VISA_AGENCY: "Visa Agency",
  CORPORATE_TRAVEL: "Corporate Travel",
  WHOLESALER: "Wholesaler",
  OTHER: "Other",
};

function historyLabel(entry: { kind: string; fromStatus: string | null; toStatus: string | null }): string {
  if (entry.kind === "NOTE") return "Internal note";
  if (entry.kind === "INFO_REQUEST") return "More information requested";
  if (!entry.fromStatus) return "Application submitted";
  return `${entry.fromStatus.replaceAll("_", " ")} → ${(entry.toStatus ?? "").replaceAll("_", " ")}`;
}

export default async function AdminRegistrationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const staff = await pageUser();
  if (!hasPermission(staff, "registrations.view")) notFound();

  const detail = await getRegistrationDetail(id);
  if (!detail) notFound();
  const { registration: reg, documents, history, agency, adminUser } = detail;

  const flash = flashFrom(sp);
  const canDecide = hasPermission(staff, "registrations.manage");
  const isOpen = ["PENDING", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"].includes(reg.status);
  const activationLink = typeof sp.activation === "string" ? sp.activation : null;

  return (
    <>
      <PageHeader
        title={reg.legalName}
        subtitle={`${reg.reference} · submitted ${formatDateTime(reg.createdAt)}`}
        actions={
          <>
            <StatusBadge code={reg.status} />
            <Link href="/admin/registrations" className="btn-secondary btn-sm">← All registrations</Link>
          </>
        }
      />
      <Flash {...flash} />

      {/* Decision outcomes */}
      {reg.status === "APPROVED" && agency ? (
        <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          <p className="font-semibold">
            Approved — agency and Agency Admin provisioned.
          </p>
          <p className="mt-1">
            Decided {formatDateTime(reg.decidedAt)} · Agency:{" "}
            <Link href={`/admin/agencies/${agency.id}`} className="font-semibold underline underline-offset-2">
              {agency.legalName}
            </Link>
            {adminUser ? <> · Administrator: {adminUser.name} ({adminUser.email})</> : null}
          </p>
        </div>
      ) : null}
      {reg.status === "REJECTED" ? (
        <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
          <p className="font-semibold">Rejected — no agency, portal access or wallet credit was created.</p>
          <p className="mt-1">Decided {formatDateTime(reg.decidedAt)} · Reason: {reg.rejectionReason}</p>
        </div>
      ) : null}
      {activationLink ? (
        <div className="mb-4 rounded-2xl border border-gold-200 bg-gold-50 px-5 py-4">
          <p className="text-sm font-semibold text-gold-700">
            Activation link — copy it now and share it securely with the partner. It is single-use, expires in 72 hours, and revokes any previous link.
          </p>
          <code className="mt-2 block break-all rounded-xl border border-gold-200 bg-white px-4 py-3 text-xs text-navy-900">
            {activationLink}
          </code>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Company information" />
            <KeyValue
              items={[
                { label: "Legal name", value: reg.legalName },
                { label: "Trading name", value: reg.tradingName },
                { label: "Country", value: reg.country },
                { label: "Wilaya / Region", value: reg.region },
                { label: "City", value: reg.city },
                { label: "Address", value: reg.addressLine },
                { label: "Business phone", value: reg.phone },
                { label: "Professional email", value: reg.email },
                { label: "Website", value: reg.website },
                { label: "Commercial registration", value: reg.commercialRegistrationNumber },
                { label: "Tax / fiscal ID", value: reg.taxId },
                { label: "Licence / accreditation", value: reg.licenceNumber },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Primary contact" />
            <KeyValue
              items={[
                { label: "Name", value: `${reg.contactFirstName} ${reg.contactLastName}` },
                { label: "Position", value: reg.contactPosition },
                { label: "Professional email", value: reg.contactEmail },
                { label: "Phone / WhatsApp", value: reg.contactPhone },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Business profile" />
            <KeyValue
              items={[
                { label: "Business type", value: BUSINESS_TYPE_LABELS[reg.businessType] ?? reg.businessType },
                { label: "Est. monthly visa volume", value: reg.monthlyVolume },
                { label: "Main destinations / markets", value: reg.mainMarkets },
              ]}
            />
            {reg.message ? (
              <div className="border-t border-line/70 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Message</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{reg.message}</p>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Uploaded documents" subtitle="Stored in private storage; downloads are staff-only and audited." />
            {documents.length === 0 ? (
              <EmptyState title="No documents uploaded" body="The applicant did not attach company documents." />
            ) : (
              <ul className="divide-y divide-slate-100 px-5">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy-900">{DOC_CATEGORY_LABELS[doc.category] ?? doc.category}</p>
                      <p className="truncate text-xs text-slate-400">
                        {doc.originalFilename} · {bytes(doc.sizeBytes)} · {formatDateTime(doc.createdAt)}
                      </p>
                    </div>
                    <a
                      href={`/api/registrations/${reg.id}/documents/${doc.id}`}
                      className="btn-secondary btn-sm"
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Consent & submission metadata" />
            <KeyValue
              items={[
                { label: "Terms of Service", value: reg.termsAccepted ? "Accepted" : "—" },
                { label: "Privacy Notice", value: reg.privacyAcknowledged ? "Acknowledged" : "—" },
                { label: "Accuracy confirmed", value: reg.infoConfirmed ? "Confirmed" : "—" },
                { label: "Consented at", value: formatDateTime(reg.consentedAt) },
                { label: "Form language", value: LOCALE_NAMES[resolveLocale(reg.locale)] },
                { label: "Review started", value: formatDateTime(reg.reviewedAt) },
              ]}
            />
          </Card>
        </div>

        {/* Right column — decisions, notes, history */}
        <div className="space-y-4">
          {canDecide ? (
            <Card>
              <CardHeader title="Decision" subtitle="Every action is audited." />
              <div className="space-y-4 px-5 py-4">
                {reg.status !== "APPROVED" && reg.status !== "UNDER_REVIEW" ? (
                  <form action={startRegistrationReviewAction}>
                    <input type="hidden" name="id" value={reg.id} />
                    <SubmitButton className="btn-secondary w-full" pendingLabel="Starting…">
                      Start review
                    </SubmitButton>
                  </form>
                ) : null}
                {reg.status === "PENDING" || reg.status === "UNDER_REVIEW" ? (
                  <form action={requestRegistrationInfoAction} className="space-y-2">
                    <input type="hidden" name="id" value={reg.id} />
                    <textarea name="note" rows={2} required minLength={10} className="input" placeholder="Information required from the applicant (min 10 characters)…" />
                    <SubmitButton className="btn-secondary w-full" pendingLabel="Sending…">
                      Request more information
                    </SubmitButton>
                  </form>
                ) : null}
                {isOpen ? (
                  <form action={approveRegistrationAction}>
                    <input type="hidden" name="id" value={reg.id} />
                    <ConfirmButton
                      message={`Approve "${reg.legalName}"?\n\nThis creates the agency and its Agency Admin account (role AGENCY_ADMIN) in a single, idempotent operation. No wallet credit is granted.`}
                      className="btn-primary w-full"
                    >
                      Approve registration
                    </ConfirmButton>
                  </form>
                ) : null}
                {isOpen ? (
                  <form action={rejectRegistrationAction} className="space-y-2">
                    <input type="hidden" name="id" value={reg.id} />
                    <textarea name="reason" rows={2} required minLength={10} className="input" placeholder="Rejection reason (mandatory, min 10 characters)…" />
                    <ConfirmButton
                      message={`Reject "${reg.legalName}"?\n\nThe applicant receives no agency, no portal access and no wallet credit. The record remains stored for audit.`}
                      className="btn-danger w-full"
                    >
                      Reject registration
                    </ConfirmButton>
                  </form>
                ) : null}
                {reg.status === "APPROVED" ? (
                  <form action={generateActivationLinkAction}>
                    <input type="hidden" name="id" value={reg.id} />
                    <SubmitButton className="btn-gold w-full" pendingLabel="Generating…">
                      Generate activation link
                    </SubmitButton>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                      Single-use link for {adminUser?.email ?? "the Agency Admin"} — lets them set their password. Generating a new link revokes previous ones.
                    </p>
                  </form>
                ) : null}
                {reg.status === "REJECTED" ? (
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    Rejected applications stay read-only for historical/audit purposes. You may start review again to reopen the application.
                  </p>
                ) : null}
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Decision" />
              <p className="px-5 py-4 text-xs leading-relaxed text-slate-400">
                Only ESSAFARIA administrators (SUPER_ADMIN / ADMIN) can review, approve or reject registrations.
              </p>
            </Card>
          )}

          {canDecide ? (
            <Card>
              <CardHeader title="Internal notes" />
              <div className="px-5 py-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                  {reg.internalNotes ?? "—"}
                </p>
                <form action={addRegistrationNoteAction} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={reg.id} />
                  <textarea name="note" rows={2} required minLength={3} className="input" placeholder="Add an internal note (staff only)…" />
                  <SubmitButton className="btn-secondary btn-sm" pendingLabel="Adding…">Add note</SubmitButton>
                </form>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="History" />
            {history.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">No history yet.</p>
            ) : (
              <ol className="space-y-0 px-5 py-4">
                {history.map((entry) => (
                  <li key={entry.id} className="relative border-l border-line pb-4 ps-4 last:pb-0">
                    <span className="absolute -start-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-gold-400" />
                    <p className="text-xs font-semibold text-navy-900">{historyLabel(entry)}</p>
                    <p className="text-[11px] text-slate-400">
                      {formatDateTime(entry.createdAt)}
                      {entry.actorName ? ` · ${entry.actorName}` : ""}
                    </p>
                    {entry.note ? (
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-500">{entry.note}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
