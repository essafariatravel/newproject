import { contentT } from "@/lib/i18n-content";
import { businessLabel } from "@/lib/business-labels";
import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { hasPermission } from "@/lib/rbac";
import { listAgencies, listAuditLogs, listUsers, resolvePageSize } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { formatDateTime } from "@/lib/format";
import { FilterBar, Pagination, PageSizeSelector } from "@/components/app-widgets";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

const ENTITY_LABELS: Record<string, string> = {
  application: "Application", applicant: "Applicant", agency: "Agency", user: "User",
  document: "Document", document_request: "Document request", communication: "Messages",
  wallet: "Wallet", wallet_transaction: "Wallet transaction", wallet_topup_request: "Top-up request",
  registration: "Registration", agency_registration: "Registration", country: "Country",
  visa_category: "Visa category", visa_type: "Visa type", visa_requirement: "Visa requirement",
  document_type: "Document type", currency: "Currency", priority: "Priority", status: "Status",
  status_transition: "Status transition", site_settings: "Settings",
};

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
        <span key={key} className="me-2 inline-block whitespace-nowrap">
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
  const ct = contentT(uiLocale);
  if (!hasPermission(staff, "audit.view")) {
    return (
      <>
        <PageHeader title={ct("Audit Logs")} />
        <div className="card"><EmptyState title={ct("Not authorized")} /></div>
      </>
    );
  }
  const flash = flashFrom(sp);
  const value = (key: string) => typeof sp[key] === "string" ? sp[key] as string : undefined;
  const query = { q: value("q"), actor: value("actor"), action: value("action"), entity: value("entity"), agency: value("agency"), from: value("from"), to: value("to") };
  const page = Number(value("page") ?? "1");
  const per = resolvePageSize(sp.per);
  const [result, actors, agencies] = await Promise.all([
    listAuditLogs({ q: query.q, actorId: query.actor, action: query.action, entity: query.entity, agencyId: query.agency, from: query.from, to: query.to, page, pageSize: per }),
    listUsers(),
    listAgencies(),
  ]);
  const entityLabel = (entity: string) => ct(ENTITY_LABELS[entity] ?? "Other");
  const actionOptions = [...new Map(result.filterOptions.map(({ action, entity }) => [action, { value: action, label: `${businessLabel(action, uiLocale)} · ${entityLabel(entity)}` }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, uiLocale));
  const entityOptions = [...new Set(result.filterOptions.map(({ entity }) => entity))]
    .map((entity) => ({ value: entity, label: entityLabel(entity) }))
    .sort((a, b) => a.label.localeCompare(b.label, uiLocale));

  return (
    <>
      <PageHeader title={ct("Audit Logs")} subtitle={ct("Immutable record of sensitive actions. Audit logs cannot be modified through the application.")} />
      <Flash {...flash} />
      {result.filterError ? <Flash error={ct(result.filterError)} /> : null}

      <FilterBar locale={uiLocale} action="/admin/audit" hidden={{ per: String(per) }} fields={[
        { name: "q", label: ct("Search"), type: "text", value: query.q, placeholder: ct("Action, entity or actor email…") },
        { name: "actor", label: ct("Actor"), type: "select", value: query.actor, options: [{ value: "system", label: ct("System") }, ...actors.map(({ user }) => ({ value: user.id, label: `${user.name} · ${user.email}` }))] },
        { name: "action", label: ct("Action"), type: "select", value: query.action, options: actionOptions },
        { name: "entity", label: ct("Entity"), type: "select", value: query.entity, options: entityOptions },
        { name: "agency", label: ct("Agency"), type: "select", value: query.agency, options: agencies.map(({ agency }) => ({ value: agency.id, label: agency.tradingName || agency.legalName })) },
        { name: "from", label: ct("From"), type: "date", value: query.from },
        { name: "to", label: ct("To"), type: "date", value: query.to },
      ]} />
      <p className="mb-4 text-xs text-slate-500">{ct("Dates use UTC. The end date includes the full day.")}</p>

      {result.rows.length === 0 ? (
        <div className="card"><EmptyState title={ct(result.filterError ? "Update the filters to view audit entries." : "No audit entries found")} /></div>
      ) : (
        <>
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">{ct("Time")}</th>
                <th className="th">{ct("Actor")}</th>
                <th className="th">{ct("Role")}</th>
                <th className="th">{ct("Agency")}</th>
                <th className="th">{ct("Action")}</th>
                <th className="th">{ct("Entity")}</th>
                <th className="th">{ct("Metadata")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map(({ log, agencyName }) => (
                <tr key={log.id} className="tr-hover">
                  <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(log.createdAt, uiLocale)}</td>
                  <td className="td max-w-[160px] truncate text-xs">{log.actorEmail ?? ct("System")}</td>
                  <td className="td text-xs">{log.actorRole ? businessLabel(log.actorRole, uiLocale) : "—"}</td>
                  <td className="td max-w-[140px] truncate text-xs">{agencyName ?? "—"}</td>
                  <td className="td">
                    <span className="badge bg-navy-900/5 text-navy-800">{businessLabel(log.action, uiLocale)}</span>
                  </td>
                  <td className="td text-xs text-slate-500">{entityLabel(log.entity)}</td>
                  <td className="td max-w-[260px]">
                    <details><summary className="cursor-pointer font-medium text-navy-800">{ct("Details")}</summary><p className="my-2 text-xs">{log.action} · {log.entityId}</p>{readableMetadata(log.metadata)}</details>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination locale={uiLocale} page={result.page} pageCount={result.pageCount} total={result.total} basePath="/admin/audit" query={{ ...query, per: String(per) }} />
        </>
      )}
      <div className="mt-2 flex justify-end">
        <PageSizeSelector locale={uiLocale} pageSize={per} basePath="/admin/audit" query={query} />
      </div>
    </>
  );
}
