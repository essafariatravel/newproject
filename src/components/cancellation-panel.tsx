import type { UiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { formatAmount, formatDateTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import type { CancellationRow } from "@/lib/application-cancellations";
import { requestCancellationAction, decideCancellationAction } from "@/app/actions/cancellations";

export function CancellationPanel({id,rows,eligible,staff,netPaid,locale}:{
 id:string;rows:CancellationRow[];eligible:boolean;staff:boolean;netPaid:string|null;locale:UiLocale;
}){
 const t=contentT(locale);
 const pending=rows.find(r=>r.status==="PENDING");
 if(!eligible&&!rows.length)return null;
 const statusLabel=(status:CancellationRow["status"])=>t({PENDING:"Cancellation pending",APPROVED:"Cancellation approved",REFUSED:"Cancellation refused"}[status]);
 return <section id="cancellation" className="my-4 scroll-mt-20" aria-label={t("Application cancellation")}>
 <Card>
 <CardHeader title={t("Application cancellation")} subtitle={t("Cancellation and refund decisions are recorded in the application history.")}/>
 <div className="space-y-4 p-4">
 {rows.length>0?<ul className="divide-y divide-line">{rows.map(r=><li key={r.id} className="space-y-2 py-3">
  <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-navy-900">{statusLabel(r.status)}</p><p className="text-xs text-slate-500">{formatDateTime(r.requested_at,locale)}</p></div>
  <p className="text-sm text-slate-500">{t(r.origin==="STAFF"?"Initiated by ESSAFARIA":"Requested by the agency")}</p>
  <p className="whitespace-pre-wrap break-words text-sm text-navy-900"><bdi>{r.request_reason}</bdi></p>
  {r.decision_reason?<div className="border-s-2 border-line ps-3 text-sm"><p className="font-semibold">{t("Decision reason")}</p><p className="whitespace-pre-wrap break-words"><bdi>{r.decision_reason}</bdi></p>{r.decided_at?<p className="text-xs text-slate-500">{formatDateTime(r.decided_at,locale)}</p>:null}</div>:null}
  {r.refund_amount!==null?<p className="text-sm font-semibold">{t("Refund amount (DZD)")} : {formatAmount(r.refund_amount,"DZD",locale)}</p>:null}
 </li>)}</ul>:null}
 {eligible&&!staff&&!pending?<form action={requestCancellationAction} className="space-y-3">
 <input type="hidden" name="applicationId" value={id}/>
 <p className="text-sm text-slate-600">{t("Request cancellation after submission. The application remains open until ESSAFARIA decides.")}</p>
 <label className="label" htmlFor="cancellation-reason">{t("Cancellation reason")} *</label>
 <textarea id="cancellation-reason" name="reason" required minLength={8} maxLength={1000} rows={3} className="input"/>
 <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">{t("Request cancellation")}</SubmitButton>
 </form>:null}
 {!staff&&pending?<p role="status" className="text-sm text-amber-800">{t("ESSAFARIA is reviewing your cancellation request.")}</p>:null}
 {eligible&&staff?<div className="space-y-4">
 <p className="text-sm text-slate-600">{t(pending?"Review the cancellation request before closing the application.":"You can cancel this application directly, with or without a refund.")}</p>
 {netPaid!==null?<p className="font-semibold tabular-nums">{t("Maximum refundable amount")} : {formatAmount(netPaid,"DZD",locale)}</p>:null}
 <form action={decideCancellationAction} className="space-y-3 rounded-lg border border-line p-4">
 <input type="hidden" name="applicationId" value={id}/><input type="hidden" name="requestId" value={pending?.id??""}/><input type="hidden" name="decision" value="APPROVED"/>
 <p className="font-semibold">{t(pending?"Approve cancellation":"Cancel application directly")}</p>
 <label className="label" htmlFor="cancel-refund">{t("Refund amount (DZD)")} *</label>
 <input id="cancel-refund" type="number" inputMode="decimal" min="0" max={netPaid??undefined} step="0.01" name="refundAmount" required className="input" placeholder="0.00"/>
 <p className="text-xs text-slate-600">{t("Enter 0 for no refund, or choose a partial or full refund. The agency wallet is credited only once.")}</p>
 <label className="label" htmlFor="cancel-approve-reason">{t("Decision reason")} *</label>
 <textarea id="cancel-approve-reason" name="reason" required minLength={8} maxLength={1000} rows={3} className="input"/>
 <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" required/><span>{t("I confirm this cancellation and the exact refund amount.")}</span></label>
 <SubmitButton className="btn-primary btn-sm" pendingLabel="…">{t("Confirm cancellation and refund")}</SubmitButton>
 </form>
 {pending?<form action={decideCancellationAction} className="space-y-3 rounded-lg border border-line p-4">
 <input type="hidden" name="applicationId" value={id}/><input type="hidden" name="requestId" value={pending.id}/><input type="hidden" name="decision" value="REFUSED"/>
 <p className="font-semibold">{t("Refuse cancellation")}</p>
 <label className="label" htmlFor="cancel-refuse-reason">{t("Decision reason")} *</label>
 <textarea id="cancel-refuse-reason" name="reason" required minLength={8} maxLength={1000} rows={3} className="input"/>
 <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" required/><span>{t("I confirm the refusal. No refund will be issued.")}</span></label>
 <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">{t("Refuse cancellation")}</SubmitButton>
 </form>:null}
 </div>:null}
 </div>
 </Card>
 </section>;
}
