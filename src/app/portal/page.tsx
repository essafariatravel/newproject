import Link from "next/link";
import { portalPageUser } from "@/lib/page-auth";
import { agencyDashboard } from "@/lib/queries";
import { formatAmount, formatDateTime } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, StatusBadge, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PortalDashboardPage() {
  const user = await portalPageUser();
  const data = await agencyDashboard(user.agencyId);
  const { totals, wallet } = data;

  return (
    <>
      <PageHeader
        title="Agency dashboard"
        subtitle={user.agencyName ?? undefined}
        actions={
          <Link href="/portal/applications/new" className="btn-primary btn-sm">
            + New application
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active applications" value={totals.active} hint="Submitted and in progress" href="/portal/applications" tone="navy" />
        <StatCard label="Completed" value={totals.completed} href="/portal/applications" tone="teal" />
        <StatCard label="Missing documents" value={totals.missingDocs} hint="Action required" href="/portal/applications?status=DOCUMENTS_REQUIRED" tone="gold" />
        <StatCard
          label="Wallet balance"
          value={formatAmount(wallet.balance, wallet.currency)}
          href="/portal/wallet"
          hint={`${data.unreadNotifications} unread notifications`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Drafts" value={totals.drafts} href="/portal/applications" />
        <StatCard label="Refused" value={totals.refused} href="/portal/applications" />
        <StatCard label="Total files" value={totals.total} href="/portal/applications" />
        <StatCard label="Notifications" value={data.unreadNotifications} href="/portal/notifications" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader
              title="Recent applications"
              actions={<Link href="/portal/applications" className="btn-secondary btn-sm">View all →</Link>}
            />
            {data.recentApplications.length === 0 ? (
              <EmptyState
                title="No applications yet"
                body="Submit your first visa application to see it tracked here."
                action={<Link href="/portal/applications/new" className="btn-primary btn-sm">Create application</Link>}
              />
            ) : (
              <TableWrap>
                <thead className="border-b border-slate-100 bg-ivory-50/60">
                  <tr>
                    <th className="th">Reference</th>
                    <th className="th">Visa</th>
                    <th className="th">Applicants</th>
                    <th className="th">Status</th>
                    <th className="th">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentApplications.map((r) => (
                    <tr key={r.app.id} className="tr-hover">
                      <td className="td">
                        <Link href={`/portal/applications/${r.app.id}`} className="font-medium text-navy-900 hover:underline">
                          {r.app.reference}
                        </Link>
                      </td>
                      <td className="td">
                        {r.app.countryName}
                        <span className="block text-xs text-slate-400">{r.app.visaTypeName}</span>
                      </td>
                      <td className="td tabular-nums">{r.applicantCount}</td>
                      <td className="td"><StatusBadge code={r.statusCode} name={r.statusName} /></td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.app.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Recent wallet activity"
            actions={<Link href="/portal/wallet" className="btn-secondary btn-sm">Ledger →</Link>}
          />
          <ul className="divide-y divide-slate-100 px-4">
            {data.recentTx.length === 0 ? (
              <li className="py-6 text-center text-sm text-slate-500">No transactions yet.</li>
            ) : (
              data.recentTx.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-navy-900">{tx.type.replaceAll("_", " ")}</p>
                    <p className="truncate text-[11px] text-slate-400">{formatDateTime(tx.createdAt)}</p>
                  </div>
                  <span className={`whitespace-nowrap text-sm font-medium tabular-nums ${tx.type === "CREDIT" ? "text-emerald-700" : "text-red-700"}`}>
                    {tx.type === "CREDIT" ? "+" : "−"}
                    {formatAmount(tx.amount, tx.currency)}
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
