import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { adminDashboard } from "@/lib/queries";
import { formatAmount, formatDateTime } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT, localizedGreeting } from "@/lib/i18n-content";

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
      <PageHeader
        title={uiLocale === "en" ? `Good ${greeting()}, ${user.name.split(" ")[0]}` : `${localizedGreeting(greeting() as "morning" | "afternoon" | "evening", uiLocale)}, ${user.name.split(" ")[0]}`}
        subtitle={ct("Operational overview of the ESSAFARIA visa desk.")}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={ct("Total applications")} value={totals.total} hint={`${totals.last30} ${ct("in the last 30 days")}`} href="/admin/applications" tone="navy" />
        <StatCard label={ct("Pending intake")} value={totals.pending} hint={ct("Submitted · Docs required · Under review")} href="/admin/applications?status=SUBMITTED" />
        <StatCard label={ct("In processing")} value={totals.processing} hint={ct("Processing · Embassy · Awaiting decision")} href="/admin/applications?status=PROCESSING" tone="teal" />
        <StatCard label={ct("Documents in review")} value={data.documentsInReview} hint={ct("Uploaded / under review")} href="/admin/documents" tone="gold" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={ct("Missing documents")} value={totals.missingDocs} href="/admin/applications?status=DOCUMENTS_REQUIRED" />
        <StatCard label={ct("Completed / approved")} value={totals.completed} href="/admin/applications?status=COMPLETED" />
        <StatCard label={ct("Rejected")} value={totals.refused} href="/admin/applications?status=REJECTED" />
        <StatCard label={ct("Active agencies")} value={`${data.agencyAgg.active}/${data.agencyAgg.total}`} href="/admin/agencies" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={ct("Agency registrations")}
          value={data.pendingRegistrations}
          hint={`${data.registrationsInReview} in review · partnership applications awaiting decision`}
          href="/admin/registrations"
          tone="gold"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader
              title={ct("Recent applications")}
              actions={
                <Link href="/admin/applications" className="btn-secondary btn-sm">
                  View all →
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
                    <th className="th">{ct("Visa")}</th>
                    <th className="th">{ct("Status")}</th>
                    <th className="th">{ct("Created")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent.map((r) => (
                    <tr key={r.app.id} className="tr-hover">
                      <td className="td">
                        <Link href={`/admin/applications/${r.app.id}`} className="font-medium text-navy-900 hover:underline">
                          {r.app.reference}
                        </Link>
                        <span className="mt-0.5 block text-xs text-slate-400">{r.applicantCount} applicant(s)</span>
                      </td>
                      <td className="td max-w-[160px] truncate">{r.agencyName}</td>
                      <td className="td">
                        <span className="block">{r.app.countryName}</span>
                        <span className="block text-xs text-slate-400">{r.app.visaTypeName}</span>
                      </td>
                      <td className="td"><StatusBadge code={r.statusCode} name={r.statusName} /></td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.app.createdAt)}</td>
                    </tr>
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
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{ct("Credited")}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-700">
                    {formatAmount(data.walletAgg.credits, "EUR")}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{ct("Charged")}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-navy-900">
                    {formatAmount(data.walletAgg.charges, "EUR")}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{ct("Balances")}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-teal-700">
                    {formatAmount(data.agencyAgg.walletTotal, "EUR")}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={ct("Pipeline by status")} />
            <div className="space-y-2 px-4 py-4">
              {data.statusCounts.length === 0 ? (
                <p className="text-sm text-slate-500">{ct("No applications yet.")}</p>
              ) : (
                data.statusCounts.map((s) => (
                  <Link
                    key={s.code}
                    href={`/admin/applications?status=${s.code}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <StatusBadge code={s.code} name={s.name} />
                    <span className="font-medium tabular-nums text-slate-700">{Number(s.total)}</span>
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
                  <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-navy-900">{a.action.replaceAll("_", " ")}</p>
                      <p className="truncate text-[11px] text-slate-400">
                        {a.actorEmail ?? "system"} · {a.entity}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-[11px] text-slate-400">{formatDateTime(a.createdAt)}</span>
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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
