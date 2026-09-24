import Link from "next/link";
import { portalPageUser } from "@/lib/page-auth";
import { searchApplications } from "@/lib/queries";
import { listStatuses } from "@/lib/applications";
import { flashFrom } from "@/lib/action-helpers";
import { formatDate } from "@/lib/format";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { localizedStatusName } from "@/lib/ui-i18n";
import { EmptyState, Flash, PageHeader, Progress, TableWrap } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { checklistProgress } from "@/lib/applications";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";

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
    searchApplications(user, { q: sp.q, statusCode: sp.status, dateFrom: sp.from, dateTo: sp.to, page }),
    listStatuses(true),
  ]);

  const progressById = new Map<string, { done: number; total: number }>();
  await Promise.all(
    result.rows.slice(0, 20).map(async (r) => {
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
        fields={[
          { name: "q", label: ct("Search"), type: "text", value: sp.q, placeholder: ct("Reference, applicant, passport…") },
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
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">{ct("Reference")}</th>
                <th className="th">{ct("Applicant")}</th>
                <th className="th">{ct("Visa / Country")}</th>
                <th className="th">{ct("Documents")}</th>
                <th className="th">{ct("Fee")}</th>
                <th className="th">{ct("Status")}</th>
                <th className="th">{ct("Created")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map((r) => {
                const p = progressById.get(r.app.id);
                return (
                  <tr key={r.app.id} className="tr-hover">
                    <td className="td">
                      <Link href={`/portal/applications/${r.app.id}`} className="font-medium text-navy-900 hover:underline">
                        {r.app.reference}
                      </Link>
                    </td>
                    {/* Phase 2-Final Correction 7: APPLICANT (full name)
                        immediately after REFERENCE. */}
                    <td className="td font-medium text-navy-900">{r.applicantSummary ?? "—"}</td>
                    <td className="td">
                      {countryName({ name: r.app.countryName, iso2: r.countryIso2 }, uiLocale)}
                      <span className="block text-xs text-slate-400">{r.app.visaTypeName}</span>
                    </td>
                    <td className="td">{p ? <Progress done={p.done} total={p.total} /> : "—"}</td>
                    <td className="td whitespace-nowrap tabular-nums">{r.app.fee} DZD</td>
                    <td className="td"><StatusBadge code={r.statusCode} name={r.statusName} /></td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">{formatDate(r.app.createdAt, uiLocale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
          <Pagination locale={uiLocale} page={result.page} pageCount={result.pageCount} total={result.total} basePath="/portal/applications" query={{ q: sp.q, status: sp.status, from: sp.from, to: sp.to }} />
        </>
      )}
    </>
  );
}
