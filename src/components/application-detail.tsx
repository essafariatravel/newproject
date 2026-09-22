import type { ChecklistItem, Applicant, Application } from "@/db/schema";
import { formatDateTime, formatAmount, personName, bytes } from "@/lib/format";
import type { DocumentRow } from "@/db/schema";
import { Progress } from "@/components/ui";
import { DocStatusBadge, StatusBadge } from "@/components/badges";
import { ConfirmButton, SubmitButton } from "@/components/forms";
import {
  reviewDocumentAction,
  uploadDocumentAction,
  uploadResubmissionAction,
  deleteDocumentAction,
} from "@/app/actions/documents";
import { postMessageAction } from "@/app/actions/communications";
import type { AuthUser } from "@/lib/types";
import { DOCUMENT_REVIEW_ROLES } from "@/lib/types";

/* ------------------------------- checklist ------------------------------- */

export function ChecklistTable(props: {
  items: ChecklistItem[];
  documents: Array<{ doc: DocumentRow; documentTypeName: string; applicantName: string | null }>;
  applicationId: string;
  user: AuthUser;
  applicants: Applicant[];
  back: string;
}) {
  const { user } = props;
  const canUpload = Boolean(user.agencyId) || DOCUMENT_REVIEW_ROLES.includes(user.role);
  const requiredItems = props.items.filter((i) => i.required && i.active);
  const requiredDone = requiredItems.filter((i) =>
    props.documents.some(
      (d) => d.doc.checklistItemId === i.id && ["UPLOADED", "UNDER_REVIEW", "ACCEPTED"].includes(d.doc.status),
    ),
  ).length;
  const optionalItems = props.items.filter((i) => !i.required && i.active);
  const optionalDone = optionalItems.filter((i) =>
    props.documents.some(
      (d) => d.doc.checklistItemId === i.id && ["UPLOADED", "UNDER_REVIEW", "ACCEPTED"].includes(d.doc.status),
    ),
  ).length;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div>
          <p className="text-sm font-medium text-navy-900">
            Required documents: {requiredDone} / {requiredItems.length} complete
          </p>
          <p className="text-xs text-slate-500">
            Optional: {optionalDone}/{optionalItems.length} · Checklist generated from the visa requirements at application creation
          </p>
        </div>
        <Progress done={requiredDone} total={requiredItems.length} />
      </div>

      <div className="card divide-y divide-slate-100">
        {props.items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">No checklist configured for this visa type.</p>
        ) : (
          props.items.map((item) => {
            const docs = props.documents.filter((d) => d.doc.checklistItemId === item.id);
            const satisfied = docs.some((d) => ["UPLOADED", "UNDER_REVIEW", "ACCEPTED"].includes(d.doc.status));
            const rejected = docs.some((d) => ["REJECTED", "RESUBMISSION_REQUIRED"].includes(d.doc.status));
            return (
              <div key={item.id} className={`px-4 py-3 ${item.active ? "" : "opacity-50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-navy-900">
                      {item.documentTypeName}{" "}
                      {item.required ? (
                        <span className="badge bg-red-100 text-red-700">Required</span>
                      ) : (
                        <span className="badge bg-slate-100 text-slate-500">Optional</span>
                      )}
                      {!item.active ? <span className="badge bg-slate-200 text-slate-500">Requirement removed</span> : null}
                    </p>
                    {item.notes ? <p className="mt-0.5 text-xs text-slate-500">{item.notes}</p> : null}
                  </div>
                  <span className={`badge ${satisfied ? "bg-emerald-100 text-emerald-800" : rejected ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
                    {satisfied ? "Provided" : rejected ? "Action needed" : "Missing"}
                  </span>
                </div>
                {docs.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {docs.map((d) => (
                      <li key={d.doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-ivory-50 px-3 py-1.5 text-xs">
                        <span className="flex items-center gap-2">
                          <a href={`/api/documents/${d.doc.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-navy-800 underline-offset-2 hover:underline">
                            {d.doc.originalFilename}
                          </a>
                          <span className="text-slate-400">v{d.doc.version} · {bytes(d.doc.sizeBytes)}</span>
                          <DocStatusBadge status={d.doc.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canUpload && item.active && item.documentTypeId ? (
                  <UploadFormInline
                    applicationId={props.applicationId}
                    checklistItemId={item.id}
                    documentTypeId={item.documentTypeId}
                    applicants={props.applicants}
                    back={props.back}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function UploadFormInline(props: {
  applicationId: string;
  checklistItemId: string;
  documentTypeId: string;
  applicants: Applicant[];
  back: string;
}) {
  return (
    <form action={uploadDocumentAction} className="mt-2.5 flex flex-wrap items-center gap-2">
      <input type="hidden" name="applicationId" value={props.applicationId} />
      <input type="hidden" name="checklistItemId" value={props.checklistItemId} />
      <input type="hidden" name="documentTypeId" value={props.documentTypeId} />
      <input
        type="file"
        name="file"
        required
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
        className="max-w-full text-xs file:mr-2 file:rounded-full file:border-0 file:bg-iris-600 file:px-2.5 file:py-1.5 file:text-xs file:text-white"
      />
      {props.applicants.length > 1 ? (
        <select name="applicantId" className="input max-w-[180px] py-1.5 text-xs">
          <option value="">Applicant…</option>
          {props.applicants.map((a) => (
            <option key={a.id} value={a.id}>
              {personName(a)}
            </option>
          ))}
        </select>
      ) : props.applicants.length === 1 ? (
        <input type="hidden" name="applicantId" value={props.applicants[0]!.id} />
      ) : null}
      <input type="hidden" name="back" value={props.back} />
      <SubmitButton className="btn-secondary btn-sm" pendingLabel="Uploading…">
        Upload
      </SubmitButton>
    </form>
  );
}

/* ------------------------------- documents ------------------------------- */

export function DocumentList(props: {
  documents: Array<{ doc: DocumentRow; documentTypeName: string; applicantName: string | null }>;
  user: AuthUser;
  applicationId: string;
  isDraft: boolean;
}) {
  const isStaff = DOCUMENT_REVIEW_ROLES.includes(props.user.role);
  if (props.documents.length === 0) {
    return (
      <div className="card px-4 py-8 text-center text-sm text-slate-500">
        No documents uploaded yet.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {props.documents.map(({ doc, documentTypeName, applicantName }) => (
        <div key={doc.id} className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-900">
                <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                  {doc.originalFilename}
                </a>
                <DocStatusBadge status={doc.status} />
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {documentTypeName}
                {applicantName ? ` · ${applicantName}` : ""} · v{doc.version} · {bytes(doc.sizeBytes)} · uploaded {formatDateTime(doc.createdAt)}
              </p>
              {doc.rejectionReason ? (
                <p className="mt-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                  Reason: {doc.rejectionReason}
                </p>
              ) : null}
              {doc.reviewNotes ? <p className="mt-1 text-xs text-slate-500">Reviewer note: {doc.reviewNotes}</p> : null}
            </div>
            {props.user.agencyId && props.isDraft ? (
              <form action={deleteDocumentAction}>
                <input type="hidden" name="documentId" value={doc.id} />
                <input type="hidden" name="applicationId" value={props.applicationId} />
                <input type="hidden" name="back" value={`/portal/applications/${props.applicationId}`} />
                <ConfirmButton
                  message={`Remove "${doc.originalFilename}"?`}
                  className="btn-danger btn-sm"
                >
                  Remove
                </ConfirmButton>
              </form>
            ) : null}
          </div>

          {isStaff ? (
            <form action={reviewDocumentAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
              <input type="hidden" name="documentId" value={doc.id} />
              <input type="hidden" name="applicationId" value={props.applicationId} />
              <div>
                <label className="label" htmlFor={`st-${doc.id}`}>Set status</label>
                <select id={`st-${doc.id}`} name="status" defaultValue={doc.status} className="input w-44 py-1.5 text-xs">
                  <option value="UNDER_REVIEW">Under review</option>
                  <option value="ACCEPTED">Accept</option>
                  <option value="REJECTED">Reject</option>
                  <option value="RESUBMISSION_REQUIRED">Resubmission required</option>
                </select>
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="label" htmlFor={`rn-${doc.id}`}>Reviewer note (internal)</label>
                <input id={`rn-${doc.id}`} name="reviewNotes" className="input py-1.5 text-xs" placeholder="Optional" />
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="label" htmlFor={`rr-${doc.id}`}>Reason (mandatory for reject / resubmit)</label>
                <input id={`rr-${doc.id}`} name="rejectionReason" className="input py-1.5 text-xs" placeholder="Visible to the agency" />
              </div>
              <SubmitButton className="btn-primary btn-sm" pendingLabel="Saving…">Save review</SubmitButton>
            </form>
          ) : ["REJECTED", "RESUBMISSION_REQUIRED"].includes(doc.status) && props.user.agencyId ? (
            <form action={uploadResubmissionAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <input type="hidden" name="applicationId" value={props.applicationId} />
              <input type="hidden" name="originalDocumentId" value={doc.id} />
              <input
                type="file"
                name="file"
                required
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                className="text-xs file:mr-2 file:rounded-full file:border-0 file:bg-iris-600 file:px-2.5 file:py-1.5 file:text-xs file:text-white"
              />
              <SubmitButton className="btn-gold btn-sm" pendingLabel="Submitting…">Resubmit corrected file</SubmitButton>
            </form>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- communications ---------------------------- */

export function CommunicationsPanel(props: {
  applicationId: string;
  messages: Array<{ message: { id: string; body: string; visibility: string; createdAt: Date }; authorName: string; authorRole: string }>;
  user: AuthUser;
  back: string;
}) {
  const isStaff = !props.user.agencyId;
  return (
    <div className="space-y-4">
      <div className="card divide-y divide-slate-100">
        {props.messages.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No messages on this application yet.</p>
        ) : (
          props.messages.map(({ message, authorName, authorRole }) => (
            <div key={message.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-navy-900">
                  {authorName} <span className="font-normal text-slate-400">· {authorRole.replaceAll("_", " ")}</span>
                  {isStaff ? (
                    <span className={`badge ml-2 ${message.visibility === "INTERNAL" ? "bg-slate-200 text-slate-600" : "bg-teal-100 text-teal-700"}`}>
                      {message.visibility === "INTERNAL" ? "Internal note" : "Visible to agency"}
                    </span>
                  ) : null}
                </p>
                <span className="text-[11px] text-slate-400">{formatDateTime(message.createdAt)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">{message.body}</p>
            </div>
          ))
        )}
      </div>

      <form action={postMessageAction} className="card p-4">
        <input type="hidden" name="applicationId" value={props.applicationId} />
        <input type="hidden" name="back" value={props.back} />
        <label htmlFor="msg-body" className="label">New message</label>
        <textarea id="msg-body" name="body" rows={3} required className="input" placeholder="Write a message…" />
        <div className="mt-2.5 flex items-center justify-between gap-3">
          {isStaff ? (
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" name="visibility" value="INTERNAL" className="h-3.5 w-3.5" />
              Internal note (not visible to the agency)
            </label>
          ) : (
            <p className="text-xs text-slate-400">Messages are visible to both your agency and ESSAFARIA staff.</p>
          )}
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Posting…">Post message</SubmitButton>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------ fee summary ------------------------------ */

export function BillingSummary(props: {
  application: Application;
  charge: { amount: string; balanceBefore: string; balanceAfter: string; createdAt: Date; type: string } | null;
}) {
  const app = props.application;
  return (
    <div className="card">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-navy-900">Billing</h2>
      </div>
      <div className="space-y-2 px-4 py-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Application fee (snapshot)</span>
          <span className="font-medium tabular-nums">{formatAmount(app.fee, app.currency)}</span>
        </div>
        {props.charge ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Charge type</span>
              <span className="badge bg-navy-900/5 text-navy-800">{props.charge.type.replaceAll("_", " ")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Balance before → after</span>
              <span className="tabular-nums">
                {props.charge.balanceBefore} → {props.charge.balanceAfter} {app.currency}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Charged at</span>
              <span>{formatDateTime(props.charge.createdAt)}</span>
            </div>
          </>
        ) : (
          <p className="rounded-md bg-ivory-100 px-3 py-2 text-xs text-slate-500">
            No wallet charge yet — the fee is debited automatically when the application is submitted.
          </p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- activity ------------------------------- */

export function ActivityTimeline(props: {
  history: Array<{ history: { id: string; reason: string | null; createdAt: Date }; toStatus: { code: string; name: string } }>;
}) {
  if (props.history.length === 0) {
    return (
      <div className="card px-4 py-8 text-center text-sm text-slate-500">No status history recorded yet.</div>
    );
  }
  return (
    <div className="card px-4 py-4">
      <ol className="relative space-y-5 border-l border-slate-200 pl-5">
        {props.history.map((h) => (
          <li key={h.history.id} className="relative">
            <span className="absolute -left-[26.5px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-gold-400" />
            <p className="text-sm text-navy-900">
              → <StatusBadge code={h.toStatus.code} name={h.toStatus.name} />
            </p>
            {h.history.reason ? <p className="mt-1 text-xs text-slate-500">Reason: {h.history.reason}</p> : null}
            <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(h.history.createdAt)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* -------------------- Phase 2.2 §17 — staff price adjustments -------------------- */

import type { ApplicationPricing } from "@/lib/price-adjustments";

/**
 * Read-only pricing dossier (original + history + effective) shared by the
 * admin Billing tab and the portal "effective price" block.
 */
export function PriceAdjustmentHistory(props: {
  pricing: ApplicationPricing;
  formatLabel?: (t: "DISCOUNT" | "SURCHARGE" | "REFUND") => string;
}) {
  const p = props.pricing;
  if (!p.submittedPrice) return null;
  const currency = p.submittedCurrency ?? "";
  const label = props.formatLabel ?? ((t: "DISCOUNT" | "SURCHARGE" | "REFUND") => t.replace("_", " "));
  return (
    <div className="card">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-navy-900">Price snapshot &amp; adjustments</h2>
      </div>
      <div className="space-y-2 px-4 py-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Original submitted price</span>
          <span className="font-medium tabular-nums">{formatAmount(p.submittedPrice, currency)}</span>
        </div>
        {p.adjustments.length === 0 ? (
          <p className="rounded-md bg-ivory-100 px-3 py-2 text-xs text-slate-500">
            No commercial adjustment on this application.
          </p>
        ) : (
          <>
            {p.adjustments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                <div>
                  <span className={`badge ${a.type === "SURCHARGE" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>
                    {label(a.type)}
                  </span>
                  <span className="ml-2 text-xs text-slate-400">{a.reason}</span>
                </div>
                <span className={`whitespace-nowrap tabular-nums ${a.type === "SURCHARGE" ? "text-red-700" : "text-emerald-700"}`}>
                  {a.type === "SURCHARGE" ? "+" : "−"}{Number(a.amount).toFixed(2)} {a.currency}
                </span>
              </div>
            ))}
          </>
        )}
        <div className="flex items-center justify-between border-t border-slate-200 pt-2 font-semibold text-navy-900">
          <span>Effective price</span>
          <span className="tabular-nums">{p.effectivePrice ? formatAmount(p.effectivePrice, currency) : "—"}</span>
        </div>
      </div>
    </div>
  );
}
