import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { searchApplications } from "@/lib/queries";
import { listAgencies, activeVisaOptions, listStatuses, listPriorities } from "@/lib/applications-exports";
import { flashFrom } from "@/lib/action-helpers";
import { formatDate } from "@/lib/format";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { EmptyState, Flash, PageHeader, PriorityBadge, StatusBadge, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) sp[k] = typeof v === "string" ? v : undefined;
  const user = await pageUser();
  const flash = flashFrom(sp);

  const [result, agencies, visaOptions, statuses, priorities] = await Promise.all([
    searchApplications(user, {
      q: sp.q,
      agencyId: sp.agency,
      visaTypeId: sp.visa,
      statusCode: sp.status,
      priorityCode: sp.priority,
      dateFrom: sp.from,
      dateTo: sp.to,
      page: Number(sp.page ?? "1") || 1,
    }),
    hasPermission(user, "agencies.view") ? listAgencies() : Promise.resolve([]),
    activeVisaOptions(),
    listStatuses(true),
    listPriorities(true),
  ]);

  return (
    <>
      <PageHeader title="Applications" subtitle="All visa applications across partner agencies." />
      <Flash {...flash} />

      <FilterBar
        action="/admin/applications"
        fields={[
          { name: "q", label: "Search", type: "text", value: sp.q, placeholder: "Reference, applicant, passport…" },
          {
            name: "agency",
            label: "Agency",
            type: "select",
            value: sp.agency,
            options: agencies.map((a) => ({ value: a.agency.id, label: a.agency.tradingName ?? a.agency.legalName })),
          },
          {
            name: "visa",
            label: "Visa type",
            type: "select",
            value: sp.visa,
            options: visaOptions.map((v) => ({ value: v.id, label: v.label })),
          },
          { name: "status", label: "Status", type: "select", value: sp.status, options: statuses.map((s) => ({ value: s.code, label: s.name })) },
          { name: "priority", label: "Priority", type: "select", value: sp.priority, options: priorities.map((p) => ({ value: p.code, label: p.name })) },
          { name: "from", label: "From", type: "date", value: sp.from },
          { name: "to", label: "To", type: "date", value: sp.to },
        ]}
      />

      {result.rows.length === 0 ? (
        <div className="card">
          <EmptyState title="No applications found" body="Try adjusting the filters, or wait for agencies to submit applications." />
        </div>
      ) : (
        <>
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">Reference</th>
                <th className="th">Agency</th>
                <th className="th">Applicants</th>
                <th className="th">Visa / Country</th>
                <th className="th">Fee</th>
                <th className="th">Priority</th>
                <th className="th">Status</th>
                <th className="th">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map((r) => (
                <tr key={r.app.id} className="tr-hover">
                  <td className="td">
                    <Link href={`/admin/applications/${r.app.id}`} className="font-medium text-navy-900 hover:underline">
                      {r.app.reference}
                    </Link>
                  </td>
                  <td className="td max-w-[160px] truncate">{r.agencyName}</td>
                  <td className="td">
                    <span className="block max-w-[180px] truncate text-xs" title={r.applicantSummary ?? ""}>
                      {r.applicantSummary ?? "—"}
                    </span>
                  </td>
                  <td className="td">
                    <span className="block">{r.app.countryName}</span>
                    <span className="block text-xs text-slate-400">{r.app.visaTypeName}</span>
                  </td>
                  <td className="td whitespace-nowrap tabular-nums">
                    {r.app.fee} {r.app.currency}
                  </td>
                  <td className="td">
                    <PriorityBadge name={r.priorityName} weight={r.priorityWeight} />
                  </td>
                  <td className="td">
                    <StatusBadge code={r.statusCode} name={r.statusName} />
                  </td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">
                    {r.app.submittedAt ? formatDate(r.app.submittedAt) : "— (draft)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            basePath="/admin/applications"
            query={{ q: sp.q, agency: sp.agency, visa: sp.visa, status: sp.status, priority: sp.priority, from: sp.from, to: sp.to }}
          />
        </>
      )}
    </>
  );
}
