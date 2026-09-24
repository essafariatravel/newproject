import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { hasPermission } from "@/lib/rbac";
import { listApplicants } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { formatDate, personName } from "@/lib/format";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await pageUser();
  const uiLocale = await getUiLocale();
  if (!hasPermission(user, "applicants.view.all")) {
    return (
      <>
        <PageHeader title="Applicants" />
        <div className="card"><EmptyState title="Not authorized" /></div>
      </>
    );
  }
  const flash = flashFrom(sp);
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = Number(sp.page ?? "1") || 1;
  const result = await listApplicants({ q, page });

  return (
    <>
      <PageHeader title="Applicants" subtitle="Travellers across all applications." />
      <Flash {...flash} />

      <FilterBar
        action="/admin/applicants"
        fields={[{ name: "q", label: "Search", type: "text", value: q, placeholder: "Name or passport number…" }]}
      />

      {result.rows.length === 0 ? (
        <div className="card"><EmptyState title="No applicants found" /></div>
      ) : (
        <>
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">Name</th>
                <th className="th">Passport</th>
                <th className="th">Nationality</th>
                <th className="th">DOB</th>
                <th className="th">Application</th>
                <th className="th">Agency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map(({ applicant, applicationReference, applicationId, agencyName }) => (
                <tr key={applicant.id} className="tr-hover">
                  <td className="td font-medium text-navy-900">{personName(applicant)}</td>
                  <td className="td tabular-nums">
                    {applicant.passportNumber}
                    <span className="block text-[11px] text-slate-400">exp. {formatDate(applicant.passportExpiryDate, uiLocale)}</span>
                  </td>
                  <td className="td">{applicant.nationality}</td>
                  <td className="td whitespace-nowrap">{formatDate(applicant.dateOfBirth, uiLocale)}</td>
                  <td className="td">
                    <Link href={`/admin/applications/${applicationId}`} className="text-navy-800 hover:underline">
                      {applicationReference}
                    </Link>
                  </td>
                  <td className="td max-w-[160px] truncate">{agencyName}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} basePath="/admin/applicants" query={{ q }} />
        </>
      )}
    </>
  );
}
