import { configName } from "@/lib/config-localization";
import { businessLabel } from "@/lib/business-labels";
import { NavigableTableRow } from "@/components/navigable-table-row";
import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { adminDashboard } from "@/lib/queries";
import { formatAmount, formatDateTime } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { elapsedLabel } from "@/lib/time-in-status";
import { countryName } from "@/lib/country-names";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const uiLocale = await getUiLocale();
  const ct = contentT(uiLocale);
  const user = await pageUser();
  const data = await adminDashboard();
  const { totals } = data;

  const recent = data.recentApplications;
  const canSeeBilling = hasPermission(user, "wallet.view.all");

  return (
    <>
      <PageHeader title={ct("Work queue")} subtitle={ct("Operational overview of the ESSAFARIA visa desk — work queue.")} />

      <section aria-label={ct("Work queue")} className="border-y border-line">
        <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-3 xl:grid-cols-6">
          {[
            [ct("New applications"), totals.newApps, ct("Submitted, awaiting intake"), "/admin/applications?status=SUBMITTED"],
            [ct("Documents to verify"), totals.docsChecking, ct("Documents checking"), "/admin/applications?status=DOCUMENTS_CHECKING"],
            [ct("Action required"), totals.docsRequested, ct("Agency action / documents requested"), "/admin/applications?documents=requested"],
            [ct("In process"), totals.inProcess, ct("Actively processing"), "/admin/applications?status=IN_PROCESS"],
            [ct("Unassigned"), totals.unassigned, ct("No case officer"), "/admin/applications?assigned=unassigned"],
            [ct("Urgent"), totals.urgent, ct("Priority urgent"), "/admin/applications?priority=URGENT"],
          ].map(([label, value, hint, href]) => (
            <Link key={String(href)} href={String(href)} className="min-h-[96px] bg-white px-4 py-4 hover:bg-ivory-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy-700">
              <span className="block text-base font-semibold text-navy-900">{label}</span>
              <strong className="mt-1 block text-2xl font-semibold tabular-nums text-navy-900">{value}</strong>
              <span className="mt-1 block text-xs text-slate-500">{hint}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6" aria-labelledby="staff-work-queue">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="staff-work-queue" className="text-2xl font-semibold text-navy-900">{ct("Work queue")}</h2>
            <p className="mt-1 text-base text-slate-500">{ct("Priority and oldest open files first")}</p>
          </div>
          <Link href="/admin/applications" className="btn-secondary btn-sm">{ct("View all")} <span aria-hidden="true" className="directional-arrow">→</span></Link>
        </div>
        {data.workQueue.length === 0 ? (
          <div className="border-y border-line">
            <EmptyState title={ct("No applications yet")} body={ct("Applications submitted by partner agencies will appear here.")} />
          </div>
        ) : (
          <TableWrap>
            <thead className="border-b border-line bg-ivory-50">
              <tr>
                <th className="th">{ct("Destination")}</th>
                <th className="th">{ct("Applicant")}</th>
                <th className="th">{ct("Agency")}</th>
                <th className="th">{ct("Status")}</th>
                <th className="th">{ct("Time in status")}</th>
                <th className="th">{ct("Priority")}</th>
                <th className="th">{ct("Next action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.workQueue.map((r) => (
                <NavigableTableRow key={r.app.id} href={`/admin/applications/${r.app.id}`} className="tr-hover">
                  <td className="td">
                    <span className="font-semibold text-navy-900">{countryName({ name: r.app.countryName, iso2: r.countryIso2 }, uiLocale)}</span>
                    <span className="block text-xs text-slate-500">{configName({ name: r.app.visaTypeName, nameFr: r.visaNameFr, nameAr: r.visaNameAr }, uiLocale)}</span>
                  </td>
                  <td className="td">
                    <Link href={`/admin/applications/${r.app.id}`} className="font-semibold text-navy-900 hover:underline">{r.applicantSummary}</Link>
                    <span className="block text-xs text-slate-500"><bdi>{r.app.reference}</bdi></span>
                  </td>
                  <td className="td">{r.agencyName}</td>
                  <td className="td"><StatusBadge code={r.statusCode} name={r.statusName} /></td>
                  <td className="td whitespace-nowrap">{elapsedLabel(new Date(r.statusSince), uiLocale)}</td>
                  <td className="td">{r.priorityName}</td>
                  <td className="td">
                    <Link href={`/admin/applications/${r.app.id}`} className="inline-flex min-h-11 items-center gap-2 font-semibold text-navy-900 hover:underline">
                      {ct("Open dossier")} <span aria-hidden="true" className="directional-arrow">→</span>
                    </Link>
                  </td>
                </NavigableTableRow>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader
              title={ct("Recent applications")}
              actions={
                <Link href="/admin/applications" className="btn-secondary btn-sm">
                  {ct("View all")} →
                </Link>
              }
            />
            {recent.length === 0 ? (
              <EmptyState title={ct("No applications yet")} body={ct("Applications submitted by partner agencies will appear here.")} />
            ) : (
              <TableWrap>
                <thead className="border-b border-slate-100 bg-ivory-50/60">
                  <tr>
                    <th className="th">{ct("Reference")}</th>
                    <th className="th">{ct("Agency")}</th>
                    <th className="th">{ct("Applicant")}</th>
                    <th className="th">{ct("Visa")}</th>
                    <th className="th">{ct("Status")}</th>
                    <th className="th">{ct("Created")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent.map((r) => (
                    <NavigableTableRow key={r.app.id} href={`/admin/applications/${r.app.id}`} className="tr-hover">
                      <td className="td">
                        <Link href={`/admin/applications/${r.app.id}`} className="font-semibold text-navy-900 hover:underline">
                          {r.app.reference}
                        </Link>
                      </td>
                      <td className="td max-w-[140px] truncate">{r.agencyName}</td>
                      <td className="td max-w-[140px] truncate font-semibold text-navy-900">{(r as { applicantSummary?: string }).applicantSummary ?? "—"}</td>
                      <td className="td">
                        <span className="block">{countryName({ name: r.app.countryName, iso2: r.countryIso2 }, uiLocale)}</span>
                        <span className="block text-xs text-slate-400">{configName({ name: r.app.visaTypeName, nameFr: r.visaNameFr, nameAr: r.visaNameAr }, uiLocale)}</span>
                      </td>
                      <td className="td"><StatusBadge code={r.statusCode} name={r.statusName} /></td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.app.createdAt, uiLocale)}</td>
                    </NavigableTableRow>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {canSeeBilling ? (
            <Card>
              <CardHeader title={ct("Wallet activity")} actions={<Link href="/admin/billing" className="btn-secondary btn-sm">{ct("Ledger")} →</Link>} />
              <div className="grid grid-cols-3 divide-x divide-slate-100 px-4 py-4 text-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{ct("Credited")}</p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-emerald-700">
                    {formatAmount(data.walletAgg.credits, "DZD", uiLocale)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{ct("Charged")}</p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-navy-900">
                    {formatAmount(data.walletAgg.charges, "DZD", uiLocale)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{ct("Balances")}</p>
                  <p className="mt-1 text-base font-semibold tabular-nums text-teal-700">
                    {formatAmount(data.agencyAgg.walletTotal, "DZD", uiLocale)}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={ct("Pipeline by status")} />
            <div className="space-y-2 px-4 py-4">
              {data.statusCounts.length === 0 ? (
                <p className="text-base text-slate-500">{ct("No applications yet.")}</p>
              ) : (
                data.statusCounts.map((s) => (
                  <Link
                    key={s.code}
                    href={`/admin/applications?status=${s.code}`}
                    className="flex items-center justify-between gap-2 text-base"
                  >
                    <StatusBadge code={s.code} name={s.name} />
                    <span className="font-semibold tabular-nums text-slate-700">{Number(s.total)}</span>
                  </Link>
                ))
              )}
            </div>
          </Card>

          {hasPermission(user, "audit.view") ? (
            <Card>
              <CardHeader title={ct("Recent activity")} actions={<Link href="/admin/audit" className="btn-secondary btn-sm">{ct("Audit log")} →</Link>} />
              <ul className="divide-y divide-slate-100 px-4">
                {data.recentAudit.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-4 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-navy-900">{businessLabel(a.action, uiLocale)}</p>
                      <p className="truncate text-xs text-slate-400">
                        {a.actorEmail ?? ct("System")}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(a.createdAt, uiLocale)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
