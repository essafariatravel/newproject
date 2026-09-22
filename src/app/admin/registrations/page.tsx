import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import {
  distinctRegistrationCountries,
  listRegistrations,
  pendingRegistrationCount,
} from "@/lib/registrations";
import { flashFrom } from "@/lib/action-helpers";
import { formatDateTime } from "@/lib/format";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import { StatusBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "MORE_INFORMATION_REQUIRED", label: "More information required" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

export default async function AdminRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await pageUser();
  if (!hasPermission(user, "registrations.view")) {
    return (
      <>
        <PageHeader title="Agency Registrations" />
        <div className="card"><EmptyState title="Not authorized" /></div>
      </>
    );
  }
  const flash = flashFrom(sp);
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const country = typeof sp.country === "string" ? sp.country : undefined;
  const page = typeof sp.page === "string" ? Number(sp.page) : 1;

  const [data, pending, countries] = await Promise.all([
    listRegistrations({ q, status, country, page: Number.isFinite(page) ? page : 1 }),
    pendingRegistrationCount(),
    distinctRegistrationCountries(),
  ]);

  return (
    <>
      <PageHeader
        title="Agency Registrations"
        subtitle="Public partnership applications from the ESSAFARIA website — review, approve or reject."
        actions={
          pending > 0 ? (
            <span className="badge bg-amber-50 text-amber-700">
              {pending} pending
            </span>
          ) : (
            <span className="badge bg-emerald-50 text-emerald-700">Queue clear</span>
          )
        }
      />
      <Flash {...flash} />

      <FilterBar
        action="/admin/registrations"
        fields={[
          { name: "q", label: "Search", type: "text", value: q, placeholder: "Company, reference, email, CR number…" },
          { name: "status", label: "Status", type: "select", value: status, options: STATUS_OPTIONS },
          {
            name: "country",
            label: "Country",
            type: "select",
            value: country,
            options: countries.map((c) => ({ value: c, label: c })),
          },
        ]}
      />

      {data.rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No registrations found"
            body="Partnership applications submitted on the public website will appear here for review."
          />
        </div>
      ) : (
        <TableWrap>
          <thead className="border-b border-slate-100 bg-ivory-50/60">
            <tr>
              <th className="th">Company</th>
              <th className="th">Country</th>
              <th className="th">Contact</th>
              <th className="th">Submitted</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((r) => (
              <tr key={r.id} className="tr-hover">
                <td className="td">
                  <Link href={`/admin/registrations/${r.id}`} className="block font-medium text-navy-900 hover:underline">
                    {r.legalName}
                  </Link>
                  <span className="block text-xs text-slate-400">
                    {r.tradingName ? `${r.tradingName} · ` : ""}
                    <span className="font-mono">{r.reference}</span>
                  </span>
                </td>
                <td className="td">{r.country}</td>
                <td className="td">
                  <span className="block">{r.contactFirstName} {r.contactLastName}</span>
                  <span className="block text-xs text-slate-400">{r.contactEmail}</span>
                </td>
                <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.createdAt)}</td>
                <td className="td"><StatusBadge code={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Pagination
        page={data.page}
        pageCount={data.pageCount}
        total={data.total}
        basePath="/admin/registrations"
        query={{ q, status, country }}
      />
    </>
  );
}
