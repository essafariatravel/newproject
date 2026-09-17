import Link from "next/link";
import { portalPageUser } from "@/lib/page-auth";
import { listApplicants } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { formatDate, personName } from "@/lib/format";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

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
  const flash = flashFrom(sp);
  const page = Number(sp.page ?? "1") || 1;
  const result = await listApplicants({ q: sp.q, page, agencyId: user.agencyId });

  return (
    <>
      <PageHeader title="Applicants" subtitle="Travellers on your agency's applications." />
      <Flash {...flash} />

      <FilterBar action="/portal/applicants" fields={[{ name: "q", label: "Search", type: "text", value: sp.q, placeholder: "Name or passport…" }]} />

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
                <th className="th">Application</th>
                <th className="th">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map(({ applicant, applicationReference, applicationId }) => (
                <tr key={applicant.id} className="tr-hover">
                  <td className="td font-medium text-navy-900">{personName(applicant)}</td>
                  <td className="td tabular-nums">
                    {applicant.passportNumber}
                    <span className="block text-[11px] text-slate-400">exp. {formatDate(applicant.passportExpiryDate)}</span>
                  </td>
                  <td className="td">{applicant.nationality}</td>
                  <td className="td">
                    <Link href={`/portal/applications/${applicationId}`} className="text-navy-800 hover:underline">
                      {applicationReference}
                    </Link>
                  </td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">{formatDate(applicant.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} basePath="/portal/applicants" query={{ q: sp.q }} />
        </>
      )}
    </>
  );
}
