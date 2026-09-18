import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listAuditLogs } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { formatDateTime } from "@/lib/format";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const staff = await pageUser();
  if (!hasPermission(staff, "audit.view")) {
    return (
      <>
        <PageHeader title="Audit Logs" />
        <div className="card"><EmptyState title="Not authorized" /></div>
      </>
    );
  }
  const flash = flashFrom(sp);
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = Number(sp.page ?? "1") || 1;
  const result = await listAuditLogs({ q, page });

  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Immutable record of sensitive actions. Audit logs cannot be modified through the application." />
      <Flash {...flash} />

      <FilterBar action="/admin/audit" fields={[{ name: "q", label: "Search", type: "text", value: q, placeholder: "Action, entity or actor email…" }]} />

      {result.rows.length === 0 ? (
        <div className="card"><EmptyState title="No audit entries found" /></div>
      ) : (
        <>
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">Time</th>
                <th className="th">Actor</th>
                <th className="th">Role</th>
                <th className="th">Agency</th>
                <th className="th">Action</th>
                <th className="th">Entity</th>
                <th className="th">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map(({ log, agencyName }) => (
                <tr key={log.id} className="tr-hover">
                  <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(log.createdAt)}</td>
                  <td className="td max-w-[160px] truncate text-xs">{log.actorEmail ?? "system"}</td>
                  <td className="td text-xs">{log.actorRole?.replaceAll("_", " ") ?? "—"}</td>
                  <td className="td max-w-[140px] truncate text-xs">{agencyName ?? "—"}</td>
                  <td className="td">
                    <span className="badge bg-navy-900/5 text-navy-800">{log.action.replaceAll("_", " ")}</span>
                  </td>
                  <td className="td text-xs text-slate-500">{log.entity}{log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ""}</td>
                  <td className="td max-w-[220px]">
                    {log.metadata ? (
                      <code className="block truncate text-[11px] text-slate-500" title={JSON.stringify(log.metadata)}>
                        {JSON.stringify(log.metadata)}
                      </code>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} basePath="/admin/audit" query={{ q }} />
        </>
      )}
    </>
  );
}
