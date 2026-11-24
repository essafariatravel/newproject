import type { UiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { formatAmount, formatDateTime } from "@/lib/format";
import type { CancellationRow } from "@/lib/application-cancellations";
import { CancellationActionMenu, type CancellationLabels } from "@/components/cancellation-actions";

type Props={id:string;rows:CancellationRow[];eligible:boolean;staff:boolean;netPaid:string|null;locale:UiLocale;reference:string;summary:string;walletBalance?:string|null};
export function CancellationActions({id,rows,eligible,staff,netPaid,locale,reference,summary,walletBalance}:Props){
 const t=contentT(locale);
 const pending=rows.find(r=>r.status==="PENDING");
 if(!eligible||(!staff&&pending))return null;
 const labels:CancellationLabels={
 actions:t("Actions"),request:t("Request cancellation"),review:t("Review cancellation"),direct:t("Cancel application directly"),close:t("Close"),keep:t("Keep my application"),
 requestBody:t("The dossier remains open. ESSAFARIA will review your request; no refund is guaranteed before approval."),
 reviewBody:t("Review the cancellation request before closing the application."),directBody:t("You can cancel this application directly, with or without a refund."),
 reason:t("Cancellation reason"),decisionReason:t("Decision reason"),maximum:t(staff?"Maximum refundable amount":"Net amount paid"),
 refund:t("Refund amount (DZD)"),retained:t("Amount retained"),currentBalance:t("Wallet balance"),projectedBalance:t("Estimated wallet balance after refund"),
 noRefund:t("No refund"),full:t("Full refund"),approve:t("Approve cancellation"),refuse:t("Refuse cancellation"),refuseBody:t("I confirm the refusal. No refund will be issued."),
 confirm:t("I confirm this cancellation and the exact refund amount."),confirmRefusal:t("I confirm the refusal. No refund will be issued."),
 submit:t("Request cancellation"),submitApproval:t("Confirm cancellation and refund"),submitRefusal:t("Refuse cancellation"),pending:t("Working…"),
 requestReason:t("Cancellation reason"),estimate:t("Estimate based on the current balance. Other transactions may change it."),unavailable:t("The payment ledger requires reconciliation before cancellation.")
 };
 return <CancellationActionMenu key={pending?.id??"direct"} id={id} staff={staff} requestId={pending?.id??null} requestReason={pending?.request_reason??null} netPaid={netPaid} walletBalance={walletBalance??null} reference={reference} summary={summary} locale={locale} labels={labels}/>;
}

export function CancellationPanel({rows,staff,locale}:Pick<Props,"rows"|"staff"|"locale">){
 const t=contentT(locale);
 if(!rows.length)return null;
 const latest=rows[0]!;
 const statusLabel=(status:CancellationRow["status"])=>t({PENDING:"Cancellation pending",APPROVED:"Cancellation approved",REFUSED:"Cancellation refused"}[status]);
 return <section id="cancellation" className="cancellation-state my-4 scroll-mt-24" aria-label={t("Application cancellation")}>
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="flex items-start gap-3">
    <svg aria-hidden="true" className={"mt-0.5 h-5 w-5 shrink-0 "+(latest.status==="PENDING"?"text-amber-700":latest.status==="APPROVED"?"text-emerald-700":"text-slate-500")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/>{latest.status==="PENDING"?<path d="M12 7v5l3 2"/>:latest.status==="APPROVED"?<path d="m8 12 3 3 5-6"/>:<path d="m9 9 6 6m0-6-6 6"/>}</svg>
    <div><h2 className="text-base font-semibold text-navy-900">{statusLabel(latest.status)}</h2>
    <p className="mt-1 text-sm text-slate-600">{latest.status==="PENDING"?t(staff?"Review the cancellation request before closing the application.":"ESSAFARIA is reviewing your cancellation request."):latest.status==="REFUSED"?t("The application remains open. No refund was issued."):latest.refund_amount!==null&&Number(latest.refund_amount)>0?t("Refund credited to the agency wallet."):t("No refund")}</p></div>
   </div>
   {latest.refund_amount!==null&&Number(latest.refund_amount)>0?<strong className="text-lg text-emerald-700 tabular-nums" dir="ltr">+ {formatAmount(latest.refund_amount,"DZD",locale)}</strong>:null}
  </div>
  <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-navy-900">{t("View cancellation history")}</summary>
   <ol className="ms-2 border-s border-line ps-4 space-y-4">
    {rows.map(r=><li key={r.id} className="relative pb-3"><span aria-hidden="true" className="absolute -start-[21px] top-1 h-2.5 w-2.5 rounded-full border border-slate-400 bg-white"/>
     <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{statusLabel(r.status)}</p><time className="text-xs text-slate-500">{formatDateTime(r.requested_at,locale)}</time></div>
     <p className="mt-1 text-xs text-slate-500">{t(r.origin==="STAFF"?"Initiated by ESSAFARIA":"Requested by the agency")}</p>
     <p className="mt-1 whitespace-pre-wrap break-words"><bdi>{r.request_reason}</bdi></p>
     {r.decision_reason?<div className="mt-2 border-s border-line ps-3"><p className="text-xs font-semibold text-slate-500">{t("Decision reason")}</p><p className="whitespace-pre-wrap break-words"><bdi>{r.decision_reason}</bdi></p><p className="text-xs text-slate-500">{formatDateTime(r.decided_at,locale)}</p></div>:null}
     {r.refund_amount!==null?<p className="mt-2 font-semibold">{t("Refund amount (DZD)")} : <bdi>{formatAmount(r.refund_amount,"DZD",locale)}</bdi></p>:null}
    </li>)}
   </ol>
  </details>
 </section>;
}
