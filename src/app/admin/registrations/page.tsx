import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { hasPermission } from "@/lib/rbac";
import { listRegistrations,pendingRegistrationCount } from "@/lib/registrations";
import { registrationReviewCopy } from "@/lib/i18n";
import { NavigableTableRow } from "@/components/navigable-table-row";
import { flashFrom } from "@/lib/action-helpers";
import { formatDateTime } from "@/lib/format";
import { FilterBar,Pagination } from "@/components/app-widgets";
import { EmptyState,Flash,PageHeader,TableWrap } from "@/components/ui";
export const dynamic="force-dynamic";
export default async function AdminRegistrationsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const sp=await searchParams;const user=await pageUser();const locale=await getUiLocale();const copy=registrationReviewCopy(locale);
  if(!hasPermission(user,"registrations.view")) return <EmptyState title={copy.empty}/>;
  const q=typeof sp.q==="string" ? sp.q : undefined;const status=typeof sp.status==="string" ? sp.status : undefined;const page=typeof sp.page==="string" ? Number(sp.page) : 1;
  const [data,pending]=await Promise.all([listRegistrations({q,status,page:Number.isFinite(page)?page:1}),pendingRegistrationCount()]);
  const labels:Record<string,string>={PENDING:copy.pending,UNDER_REVIEW:copy.review,MORE_INFORMATION_REQUIRED:copy.requested,APPROVED:copy.approved,REJECTED:copy.rejected};
  return <><PageHeader title={copy.title} subtitle={copy.queue} actions={<span className="text-xs text-slate-500">{pending} · {copy.pending}</span>}/><Flash {...flashFrom(sp)}/><FilterBar action="/admin/registrations" locale={locale} fields={[{name:"q",label:copy.search,type:"text",value:q},{name:"status",label:copy.status,type:"select",value:status,options:Object.entries(labels).map(([value,label])=>({value,label}))}]}/>{!data.rows.length ? <EmptyState title={copy.empty}/> : <TableWrap><thead><tr><th className="th">{copy.company}</th><th className="th">{copy.contact}</th><th className="th">{copy.submitted}</th><th className="th">{copy.status}</th></tr></thead><tbody className="divide-y divide-line">{data.rows.map((reg)=><NavigableTableRow key={reg.id} href={`/admin/registrations/${reg.id}`} className="tr-hover"><td className="td"><Link href={`/admin/registrations/${reg.id}`} className="font-semibold text-navy-900">{reg.legalName}</Link><bdi className="block text-xs text-slate-500">{reg.reference}</bdi></td><td className="td"><span className="block">{reg.contactFirstName} {reg.contactLastName}</span><bdi className="block text-xs text-slate-500">{reg.email}</bdi></td><td className="td text-xs">{formatDateTime(reg.createdAt,locale)}</td><td className="td text-xs">{labels[reg.status]}</td></NavigableTableRow>)}</tbody></TableWrap>}<Pagination locale={locale} page={data.page} pageCount={data.pageCount} total={data.total} basePath="/admin/registrations" query={{q,status}}/></>;
}
