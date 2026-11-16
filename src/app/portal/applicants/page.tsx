import Link from "next/link";
import { portalPageUser } from "@/lib/page-auth";
import { listApplicants } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { formatDate, personName } from "@/lib/format";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { NavigableTableRow } from "@/components/navigable-table-row";

export const dynamic = "force-dynamic";

export default async function PortalApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) sp[k] = typeof v === "string" ? v : undefined;
  const user = await portalPageUser();
  const locale = await getUiLocale();
  const ct = contentT(locale);
  const flash = flashFrom(sp);
  const page = Number(sp.page ?? "1") || 1;
  const result = await listApplicants({ q: sp.q, page, agencyId: user.agencyId });

  return (
    <>
      <PageHeader title={ct("Applicants")} subtitle={ct("Travellers on your agency's applications.")} />
      <Flash {...flash} />

      <FilterBar locale={locale} action="/portal/applicants" fields={[{ name: "q", label: ct("Search"), type: "text", value: sp.q, placeholder: ct("Name or passport…") }]} />

      {result.rows.length === 0 ? (
        <div className="card"><EmptyState title={ct("No applicants found")} /></div>
      ) : (
        <>
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">{ct("Name")}</th>
                <th className="th">{ct("Passport")}</th>
                <th className="th">{ct("Nationality")}</th>
                <th className="th">{ct("Application")}</th>
                <th className="th">{ct("Added")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map(({ applicant, applicationReference, applicationId }) => (
                <NavigableTableRow key={applicant.id} href={`/portal/applications/${applicationId}`} className="tr-hover">
                  <td className="td"><Link href={`/portal/applications/${applicationId}`} className="font-semibold text-navy-900 hover:underline">{personName(applicant)}</Link></td>
                  <td className="td tabular-nums">
                    {applicant.passportNumber}
                    <span className="block text-xs text-slate-600">{ct("Passport expiry")} · {formatDate(applicant.passportExpiryDate, locale)}</span>
                  </td>
                  <td className="td">{applicant.nationality}</td>
                  <td className="td">
                    <Link href={`/portal/applications/${applicationId}`} className="text-navy-800 hover:underline">
                      {applicationReference}
                    </Link>
                  </td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">{formatDate(applicant.createdAt, locale)}</td>
                </NavigableTableRow>
              ))}
            </tbody>
          </TableWrap>
          <Pagination locale={locale} page={result.page} pageCount={result.pageCount} total={result.total} basePath="/portal/applicants" query={{ q: sp.q }} />
        </>
      )}
    </>
  );
}
