import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencyRegistrationRequests } from "@/db/schema";
import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { hasPermission } from "@/lib/rbac";
import { getRegistrationDetail,getRegistrationDuplicateCandidates } from "@/lib/registrations";
import { registrationCopy,registrationReviewCopy } from "@/lib/i18n";
import { flashFrom } from "@/lib/action-helpers";
import { formatDateTime,bytes } from "@/lib/format";
import { approveRegistrationAction,rejectRegistrationAction,startRegistrationReviewAction,addRegistrationNoteAction } from "@/app/actions/registration-admin";
import { ConfirmButton,SubmitButton } from "@/components/forms";
import { Card,CardHeader,Flash,KeyValue,PageHeader } from "@/components/ui";
import { AccessLinkForm } from "@/components/access-link-form";
import { RegistrationReviewForm } from "@/components/registration-review-form";
export const dynamic = "force-dynamic";

type ConsentVersion =
  | number
  | { id?: string; version?: number; effectiveAt?: string };

function consentEvidence(
  value: ConsentVersion | undefined,
  locale: string | undefined,
): string {
  if (typeof value === "number") return `v${value}${locale ? ` (${locale})` : ""}`;
  if (!value) return "";
  const version = value.version ? `v${value.version}` : "version recorded";
  const id = value.id ? ` · ${value.id}` : "";
  const effective = value.effectiveAt ? ` · effective ${value.effectiveAt.slice(0, 10)}` : "";
  return `${version}${locale ? ` (${locale})` : ""}${effective}${id}`;
}
export default async function AdminRegistrationDetailPage({params,searchParams}: {params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {id}=await params;const sp=await searchParams;const staff=await pageUser();
  if(!hasPermission(staff,"registrations.view")) notFound();
  const detail=await getRegistrationDetail(id);if(!detail) notFound();
  const locale=await getUiLocale();const copy=registrationReviewCopy(locale);const publicCopy=registrationCopy(locale);
  const {registration:reg,documents,history,agency,adminUser}=detail;
  const consentVersions=reg.legalConsentVersions as {terms?:ConsentVersion;privacy?:ConsentVersion;locale?:string};
  const [duplicates,requests]=await Promise.all([getRegistrationDuplicateCandidates(id,staff),db.select().from(agencyRegistrationRequests).where(eq(agencyRegistrationRequests.registrationId,id))]);
  const canDecide=hasPermission(staff,"registrations.manage");const isOpen=["PENDING","UNDER_REVIEW","MORE_INFORMATION_REQUIRED"].includes(reg.status);
  const labels:Record<string,string>={PENDING:copy.pending,UNDER_REVIEW:copy.review,MORE_INFORMATION_REQUIRED:copy.requested,APPROVED:copy.approved,REJECTED:copy.rejected};
  return <>
    <PageHeader title={reg.legalName} subtitle={`${reg.reference} · ${formatDateTime(reg.createdAt,locale)}`} actions={<><span className="badge bg-slate-100 text-slate-700">{labels[reg.status]}</span><Link href="/admin/registrations" className="btn-secondary btn-sm"><span className="directional-arrow" aria-hidden>←</span>{copy.all}</Link></>}/>
    <Flash {...flashFrom(sp)}/>
    {duplicates.length>0 && isOpen ? <section className="mb-4 border-s-2 border-amber-500 bg-amber-50 p-4"><h2 className="text-sm font-semibold text-amber-900">{copy.duplicates}</h2><p className="mt-1 text-xs leading-relaxed text-amber-800">{copy.duplicateHelp}</p><ul className="mt-4 space-y-2 text-sm">{duplicates.map((match)=><li key={`${match.kind}-${match.id}`}><Link href={match.kind==="agency" ? `/admin/agencies/${match.id}` : `/admin/registrations/${match.id}`} className="font-medium underline">{match.name}</Link><span className="ms-2 text-xs text-slate-600">{match.signals.map((signal)=>signal==="email" ? copy.email : signal==="phone" ? copy.phone : publicCopy.fields.legalName?.label).join(" · ")}</span></li>)}</ul></section> : null}
    {agency ? <section className="mb-4 border-s-2 border-emerald-500 bg-emerald-50 p-4"><Link href={`/admin/agencies/${agency.id}`} className="text-sm font-semibold text-emerald-900 underline">{copy.approved} · {agency.legalName}</Link>{adminUser ? <p className="mt-2 text-sm">{copy.username}: <bdi className="font-mono font-semibold">{adminUser.username}</bdi></p> : null}</section> : null}
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <Card><CardHeader title={copy.company}/><KeyValue items={[{label:publicCopy.fields.legalName!.label,value:reg.legalName},{label:copy.contact,value:`${reg.contactFirstName} ${reg.contactLastName}`.trim()},{label:copy.email,value:<bdi>{reg.email}</bdi>},{label:copy.phone,value:<bdi>{reg.phone}</bdi>},...(reg.city?[{label:copy.city,value:reg.city}]:[]),...(reg.addressLine?[{label:copy.address,value:reg.addressLine}]:[])]}/></Card>
        <Card><CardHeader title={copy.documents}/>{documents.length ? <ul className="divide-y divide-line px-4">{documents.map((doc)=><li key={doc.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="text-sm font-medium text-navy-900">{requests.find((request)=>request.documentId===doc.id)?.label ?? publicCopy.docCategories[doc.category]?.label}</p><p className="mt-1 text-xs text-slate-500"><bdi>{doc.originalFilename}</bdi> · {bytes(doc.sizeBytes)} · {formatDateTime(doc.createdAt,locale)}</p></div><a href={`/api/registrations/${id}/documents/${doc.id}`} className="btn-secondary btn-sm">{copy.view}</a></li>)}</ul> : <p className="px-4 pb-4 text-sm text-slate-500">{copy.noDocs}</p>}{requests.some((request)=>request.status==="OPEN") ? <ul className="border-t border-line p-4 text-xs text-slate-600">{requests.filter((request)=>request.status==="OPEN").map((request)=><li key={request.id}>{copy.requested}: {request.label}</li>)}</ul> : null}</Card>
        <details className="border-t border-line pt-4"><summary className="cursor-pointer text-sm font-semibold text-navy-900">{copy.consent}</summary><KeyValue items={[{label:copy.submitted,value:formatDateTime(reg.consentedAt,locale)},{label:publicCopy.termsLink,value:reg.termsAccepted ? `✓${consentEvidence(consentVersions.terms,consentVersions.locale) ? ` · ${consentEvidence(consentVersions.terms,consentVersions.locale)}` : ""}` : "—"},{label:publicCopy.privacyLink,value:reg.privacyAcknowledged ? `✓${consentEvidence(consentVersions.privacy,consentVersions.locale) ? ` · ${consentEvidence(consentVersions.privacy,consentVersions.locale)}` : ""}` : "—"}]}/></details>
        {(reg.commercialRegistrationNumber || reg.taxId || reg.licenceNumber || reg.website || reg.message) ? <details className="border-t border-line pt-4"><summary className="cursor-pointer text-sm font-semibold text-navy-900">{copy.company}</summary><KeyValue items={[{label:publicCopy.fields.commercialRegistrationNumber!.label,value:reg.commercialRegistrationNumber},{label:publicCopy.fields.taxId!.label,value:reg.taxId},{label:publicCopy.fields.licenceNumber!.label,value:reg.licenceNumber},{label:publicCopy.fields.website!.label,value:reg.website},{label:publicCopy.fields.message!.label,value:reg.message}]}/></details> : null}
        <section className="border-t border-line pt-4"><h2 className="text-sm font-semibold text-navy-900">{copy.history}</h2><ol className="mt-4 space-y-4">{history.map((entry)=><li key={entry.id} className="border-s border-line ps-4"><p className="text-xs font-medium text-navy-900">{entry.kind==="NOTE" ? copy.note : labels[entry.toStatus??""]??copy.review}</p><p className="text-xs text-slate-500">{formatDateTime(entry.createdAt,locale)}{entry.actorName?` · ${entry.actorName}`:""}</p>{entry.note ? <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">{entry.note.startsWith("Administrative document received: ") ? copy.received : entry.note}</p> : null}</li>)}</ol></section>
      </div>
      <div className="space-y-4">
        {canDecide && reg.status!=="APPROVED" ? <Card><CardHeader title={copy.decision}/><div className="space-y-4 px-4 pb-4">{reg.status!=="UNDER_REVIEW" ? <form action={startRegistrationReviewAction}><input type="hidden" name="id" value={id}/><SubmitButton className="btn-secondary w-full" pendingLabel={copy.starting}>{copy.start}</SubmitButton></form> : null}{isOpen ? <><form action={approveRegistrationAction}><input type="hidden" name="id" value={id}/><ConfirmButton className="btn-primary w-full" message={`${copy.approve}: ${reg.legalName}?`}>{copy.approve}</ConfirmButton></form><form action={rejectRegistrationAction} className="space-y-2"><input type="hidden" name="id" value={id}/><label htmlFor="review-rejection" className="label">{copy.reason}</label><textarea id="review-rejection" name="reason" required minLength={10} maxLength={2000} rows={3} className="input"/><ConfirmButton className="btn-danger w-full" message={`${copy.reject}: ${reg.legalName}?`}>{copy.reject}</ConfirmButton></form></> : null}</div></Card> : null}
        {canDecide && ["UNDER_REVIEW","MORE_INFORMATION_REQUIRED"].includes(reg.status) ? <Card><CardHeader title={copy.request}/><div className="px-4 pb-4"><RegistrationReviewForm id={id} locale={locale}/></div></Card> : null}
        {reg.status==="APPROVED" && staff.role==="SUPER_ADMIN" ? <Card><CardHeader title={copy.activation}/><div className="px-4 pb-4">{adminUser ? <AccessLinkForm userId={adminUser.id} purpose="ACTIVATION" locale={locale}/> : null}<p className="mt-2 text-xs leading-relaxed text-slate-500">{copy.activationHelp}</p></div></Card> : null}
        {canDecide ? <Card><CardHeader title={copy.note}/><div className="px-4 pb-4"><p className="whitespace-pre-line text-xs leading-relaxed text-slate-600">{reg.internalNotes}</p><form action={addRegistrationNoteAction} className="mt-4 space-y-2"><input type="hidden" name="id" value={id}/><label htmlFor="review-note" className="label">{copy.note}</label><textarea id="review-note" name="note" required minLength={3} maxLength={2000} rows={3} className="input"/><SubmitButton className="btn-secondary btn-sm" pendingLabel={copy.saving}>{copy.addNote}</SubmitButton></form></div></Card> : null}
      </div>
    </div>
  </>;
}
