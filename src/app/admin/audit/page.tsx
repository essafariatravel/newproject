import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { hasPermission } from "@/lib/rbac";
import { listAuditLogs, resolvePageSize } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { formatDateTime } from "@/lib/format";
import { FilterBar, Pagination, PageSizeSelector } from "@/components/app-widgets";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Audit metadata is stored as JSON, but it is read by humans: render it as
 * plain "key: value" pairs, shorten identifiers that add no meaning, and never
 * print braces, quotes or a full UUID (§audit human-readable).
 */
function fmtValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value)) return `#${value.slice(0, 8)}`;
    return value.replaceAll("_", " ");
  }
  if (Array.isArray(value)) return value.map(fmtValue).join(", ");
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k.replaceAll("_", " ")}: ${fmtValue(v)}`).join(" · ");
  return String(value);
}

function readableMetadata(metadata: unknown): React.ReactNode {
  if (!metadata || typeof metadata !== "object") return <span className="text-xs text-slate-400">—</span>;
  const entries = Object.entries(metadata as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className="block text-[11px] leading-relaxed text-slate-500">
      {entries.map(([key, value]) => (
        <span key={key} className="mr-2 inline-block whitespace-nowrap">
          <span className="text-slate-400">{key.replaceAll("_", " ")}</span> {fmtValue(value)}
        </span>
      ))}
    </span>
  );
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const staff = await pageUser();
  const uiLocale = await getUiLocale();
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
  const per = resolvePageSize(sp.per);
  const result = await listAuditLogs({ q, page, pageSize: per });

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
                  <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(log.createdAt, uiLocale)}</td>
                  <td className="td max-w-[160px] truncate text-xs">{log.actorEmail ?? "system"}</td>
                  <td className="td text-xs">{log.actorRole?.replaceAll("_", " ") ?? "—"}</td>
                  <td className="td max-w-[140px] truncate text-xs">{agencyName ?? "—"}</td>
                  <td className="td">
                    <span className="badge bg-navy-900/5 text-navy-800">{log.action.replaceAll("_", " ")}</span>
                  </td>
                  <td className="td text-xs text-slate-500">{log.entity}{log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ""}</td>
                  <td className="td max-w-[260px]">
                    {readableMetadata(log.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination locale={uiLocale} page={result.page} pageCount={result.pageCount} total={result.total} basePath="/admin/audit" query={{ q, per: String(per) }} />
        </>
      )}
      <div className="mt-2 flex justify-end">
        <PageSizeSelector locale={uiLocale} pageSize={per} basePath="/admin/audit" query={{ q }} />
      </div>
    </>
  );
}
