import { configName } from "@/lib/config-localization";
import Link from "next/link";
import { portalPageUser } from "@/lib/page-auth";
import { searchApplications, resolvePageSize } from "@/lib/queries";
import { listStatuses } from "@/lib/applications";
import { flashFrom } from "@/lib/action-helpers";
import { formatAmount, formatDateTime } from "@/lib/format";
import { FilterBar, Pagination, PageSizeSelector } from "@/components/app-widgets";
import { localizedStatusName } from "@/lib/ui-i18n";
import { EmptyState, Flash, PageHeader, Progress, TableWrap } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { checklistProgress } from "@/lib/applications";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";
import { NavigableTableRow } from "@/components/navigable-table-row";

export const dynamic = "force-dynamic";

export default async function PortalApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const uiLocale = await getUiLocale(raw);
  const ct = contentT(uiLocale);
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) sp[k] = typeof v === "string" ? v : undefined;
  const user = await portalPageUser();
  const flash = flashFrom(sp);
  const page = Number(sp.page ?? "1") || 1;

  const [result, statuses] = await Promise.all([
    searchApplications(user, { q: sp.q, queue:sp.queue==="active"||sp.queue==="completed"?sp.queue:undefined, documents: sp.documents === "requested" ? "requested" : undefined, statusCode: sp.status, dateFrom: sp.from, dateTo: sp.to, page, pageSize: resolvePageSize(sp.per) }),
    listStatuses(true),
  ]);

  const progressById = new Map<string, { done: number; total: number }>();
  await Promise.all(
    result.rows.map(async (r) => {
      const p = await checklistProgress(r.app.id);
      progressById.set(r.app.id, { done: p.requiredComplete, total: p.requiredTotal });
    }),
  );

  return (
    <>
      <PageHeader
        title={ct("Applications")}
        subtitle={ct("Your agency's visa files.")}
        actions={<Link href="/portal/applications/new" className="btn-primary btn-sm">{ct("+ New application")}</Link>}
      />
      <Flash {...flash} />

      <FilterBar locale={uiLocale}
        action="/portal/applications"
        hidden={{ documents:sp.documents==="requested"?"requested":"", queue:sp.queue??"" }}
        fields={[
          { name: "q", label: ct("Search"), type: "text", value: sp.q, placeholder: ct("Reference or applicant…") },
          {
            name: "status", label: ct("Status"), type: "select", value: sp.status,
            options: statuses
              .filter((s) => !["DRAFT", "CANCELLED"].includes(s.code))
              .map((s) => ({ value: s.code, label: localizedStatusName(s.code, s.name, uiLocale) })),
          },
          { name: "from", label: ct("From"), type: "date", value: sp.from },
          { name: "to", label: ct("To"), type: "date", value: sp.to },
        ]}
      />

      {result.rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title={ct("No applications found")}
            body={ct("Create a new application to get started.")}
            action={<Link href="/portal/applications/new" className="btn-primary btn-sm">{ct("Create application")}</Link>}
          />
        </div>
      ) : (
        <>
          {/* §"mobile cards" — on a phone a seven-column table is unusable, so the
              same rows are rendered as cards (same data, same links, same order).
              The table stays for pointer/desktop viewports. */}
          <div className="space-y-4 md:hidden" data-testid="applications-cards">
            {result.rows.map((r) => {
              const p = progressById.get(r.app.id);
              return (
                <Link
                  key={r.app.id}
                  href={`/portal/applications/${r.app.id}`}
                  className="card block p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-semibold text-navy-900">{r.applicantSummary ?? "—"}</span>
                    <StatusBadge code={r.statusCode} name={r.statusName} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{r.app.reference}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {countryName({ name: r.app.countryName, iso2: r.countryIso2 }, uiLocale)} · {configName({ name: r.app.visaTypeName, nameFr: r.visaNameFr, nameAr: r.visaNameAr }, uiLocale)}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="tabular-nums">{formatAmount(r.app.fee, "DZD", uiLocale)}</span>
                    <span className="flex items-center gap-2">
                      {p ? <Progress done={p.done} total={p.total} /> : null}
                      <span>{formatDateTime(r.app.updatedAt, uiLocale)}</span>
                    </span>
                  </div>
                  <p className="mt-4 text-xs font-medium text-navy-800">{ct("Next action")}: {ct(r.agencyNextAction)}</p>
                </Link>
              );
            })}
          </div>

          <div className="hidden md:block">
          <TableWrap ariaLabel={ct("Applications")}>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">{ct("Applicant")}</th>
                <th className="th">{ct("Visa / Country")}</th>
                <th className="th">{ct("Documents")}</th>
                <th className="th">{ct("Fee")}</th>
                <th className="th">{ct("Status")}</th>
                <th className="th">{ct("Next action")}</th>
                <th className="th">{ct("Last updated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map((r) => {
                const p = progressById.get(r.app.id);
                return (
                  <NavigableTableRow key={r.app.id} href={`/portal/applications/${r.app.id}`} className="tr-hover">
                    <td className="td">
                      <Link href={`/portal/applications/${r.app.id}`} className="inline-flex min-h-11 items-center font-semibold text-navy-900 hover:underline">{r.applicantSummary ?? "—"}</Link>
                      <span className="block text-xs text-slate-500">{r.app.reference}</span>
                    </td>
                    <td className="td">
                      {countryName({ name: r.app.countryName, iso2: r.countryIso2 }, uiLocale)}
                      <span className="block text-xs text-slate-400">{configName({ name: r.app.visaTypeName, nameFr: r.visaNameFr, nameAr: r.visaNameAr }, uiLocale)}</span>
                    </td>
                    <td className="td">{p ? <Progress done={p.done} total={p.total} /> : "—"}</td>
                    <td className="td whitespace-nowrap tabular-nums">{formatAmount(r.app.fee, "DZD", uiLocale)}</td>
                    <td className="td"><StatusBadge code={r.statusCode} name={r.statusName} /></td>
                    <td className="td text-xs">{ct(r.agencyNextAction)}</td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.app.updatedAt, uiLocale)}</td>
                  </NavigableTableRow>
                );
              })}
            </tbody>
          </TableWrap>
          </div>
          <Pagination locale={uiLocale} page={result.page} pageCount={result.pageCount} total={result.total} basePath="/portal/applications" query={{ q: sp.q, queue: sp.queue, documents: sp.documents, status: sp.status, from: sp.from, to: sp.to, per: sp.per }} />
          <div className="flex justify-end">
            <PageSizeSelector locale={uiLocale} pageSize={resolvePageSize(sp.per)} basePath="/portal/applications" query={{ q: sp.q, queue: sp.queue, documents: sp.documents, status: sp.status, from: sp.from, to: sp.to }} />
          </div>
        </>
      )}
    </>
  );
}
