import { businessLabel } from "@/lib/business-labels";
import Link from "next/link";
import { portalPageUser } from "@/lib/page-auth";
import { agencyDashboard } from "@/lib/queries";
import { formatAmount, formatDateTime } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";

export const dynamic = "force-dynamic";

export default async function PortalDashboardPage() {
  const user = await portalPageUser();
  const uiLocale = await getUiLocale();
  const ct = contentT(uiLocale);
  const data = await agencyDashboard(user.agencyId, user.id);
  const needsAttention = data.needsAttention;
  const { totals, wallet } = data;

  return (
    <>
      <PageHeader
        title={`${ct("Welcome")}, ${user.agencyName ?? user.name}`}
        subtitle={ct("Agency dashboard")}
        actions={
          <Link href="/portal/applications/new" className="btn-primary btn-sm">
            {ct("+ New application")}
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={ct("Active applications")} value={totals.active} hint={ct("Submitted and in progress")} href="/portal/applications" tone="navy" />
        <StatCard label={ct("Action required")} value={(totals as { actionRequired?: number }).actionRequired ?? 0} hint={ct("Replacement or additional document requested")} href="/portal/applications?documents=requested" tone="gold" />
        <StatCard label={ct("Completed")} value={totals.completed} href="/portal/applications?status=APPROVED" tone="teal" />
        <StatCard
          label={ct("Wallet balance")}
          value={<span className="whitespace-nowrap text-[1.05rem] sm:text-[1.65rem]">{formatAmount(wallet.balance, "DZD", uiLocale)}</span>}
          href="/portal/wallet"
          hint={data.unreadNotifications === 0 ? ct("No unread notifications") : `${data.unreadNotifications} ${ct("unread notifications")}`}
        />
      </div>

      <Card>
        <CardHeader
          title={ct("Needs your attention")}
          subtitle={ct("Applications requiring your action — replacement or additional document requested")}
        />
        {needsAttention.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-slate-500">{ct("No action required — all your applications are in order.")}</p>
          </div>
        ) : (
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">{ct("Applicant")}</th>
                <th className="th">{ct("Visa / Country")}</th>
                <th className="th">{ct("Status")}</th>
                <th className="th">{ct("Fee")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {needsAttention.map((r) => (
                <tr key={r.app.id} className="tr-hover">
                  <td className="td">
                    <Link href={`/portal/applications/${r.app.id}?tab=documents`} className="font-medium text-navy-900 hover:underline">
                      {r.applicantSummary}
                    </Link>
                    <span className="block text-xs text-slate-500">{r.app.reference}</span>
                  </td>
                  <td className="td">
                    {countryName({ name: r.app.countryName, iso2: r.countryIso2 }, uiLocale)}
                    <span className="block text-xs text-slate-400">{r.app.visaTypeName}</span>
                  </td>
                  <td className="td"><StatusBadge code={r.statusCode} name={r.statusName} /></td>
                  <td className="td tabular-nums">{formatAmount(r.app.fee, "DZD", uiLocale)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>


      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardHeader
              title={ct("Recent applications")}
              actions={<Link href="/portal/applications" className="btn-secondary btn-sm">{ct("View all")} →</Link>}
            />
            {data.recentApplications.length === 0 ? (
              <EmptyState
                title={ct("No applications yet")}
                body={ct("Submit your first visa application to see it tracked here.")}
                action={<Link href="/portal/applications/new" className="btn-primary btn-sm">{ct("Create application")}</Link>}
              />
            ) : (
              <TableWrap>
                <thead className="border-b border-slate-100 bg-ivory-50/60">
                  <tr>
                    <th className="th">{ct("Applicant")}</th>
                    <th className="th">{ct("Visa")}</th>
                    <th className="th">{ct("Status")}</th>
                    <th className="th">{ct("Created")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentApplications.map((r) => (
                    <tr key={r.app.id} className="tr-hover">
                      <td className="td">
                        <Link href={`/portal/applications/${r.app.id}`} className="font-semibold text-navy-900 hover:underline">{(r as { applicantSummary?: string }).applicantSummary ?? "—"}</Link>
                        <span className="block text-xs text-slate-500">{r.app.reference}</span>
                      </td>
                      <td className="td">
                        {countryName({ name: r.app.countryName, iso2: r.countryIso2 }, uiLocale)}
                        <span className="block text-xs text-slate-400">{r.app.visaTypeName}</span>
                      </td>
                      <td className="td"><StatusBadge code={r.statusCode} name={r.statusName} /></td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.app.createdAt, uiLocale)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader
            title={ct("Recent wallet activity")}
            actions={<Link href="/portal/wallet" className="btn-secondary btn-sm">{ct("Ledger")} →</Link>}
          />
          <ul className="divide-y divide-slate-100 px-4">
            {data.recentTx.length === 0 ? (
              <li className="py-6 text-center text-sm text-slate-500">{ct("No transactions yet.")}</li>
            ) : (
              data.recentTx.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-navy-900">{(tx as { reference?: string | null }).reference ?? businessLabel(tx.type, uiLocale)}</p>
                    <p className="truncate text-[11px] text-slate-400">{formatDateTime(tx.createdAt, uiLocale)}</p>
                  </div>
                  <span className={`whitespace-nowrap text-sm font-medium tabular-nums ${tx.type === "CREDIT" ? "text-emerald-700" : "text-red-700"}`}>
                    {tx.type === "CREDIT" ? "+" : "−"}
                    {formatAmount(tx.amount, "DZD", uiLocale)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </>
  );
}
