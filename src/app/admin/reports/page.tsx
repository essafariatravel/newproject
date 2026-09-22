import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { reportData } from "@/lib/queries";
import { formatAmount } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { StatusBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

function Bar({ max, value }: { max: number; value: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function AdminReportsPage() {
  const staff = await pageUser();
  if (!hasPermission(staff, "reports.view")) {
    return (
      <>
        <PageHeader title="Reports" />
        <div className="card"><EmptyState title="Not authorized" /></div>
      </>
    );
  }
  const data = await reportData();
  const walletFlow = data.walletFlow!;
  const maxCountry = Math.max(1, ...data.byCountry.map((r) => Number(r.total)));
  const maxVisa = Math.max(1, ...data.byVisaType.map((r) => Number(r.total)));
  const maxStatus = Math.max(1, ...data.byStatus.map((r) => Number(r.total)));

  return (
    <>
      <PageHeader title="Reports" subtitle="Operational and financial reporting from live database data." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Wallet credits" value={formatAmount(walletFlow.credits, "EUR")} tone="gold" />
        <StatCard label="Manual debits" value={formatAmount(walletFlow.debits, "EUR")} />
        <StatCard label="Application charges" value={formatAmount(walletFlow.charges, "EUR")} tone="navy" />
        <StatCard
          label="Document issues"
          value={data.docIssues.reduce((s, d) => s + Number(d.total), 0)}
          hint={data.docIssues.map((d) => `${d.status.replaceAll("_", " ")}: ${d.total}`).join(" · ") || "none"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Applications by agency" />
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr><th className="th">Agency</th><th className="th">Applications</th><th className="th">Charged volume</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.byAgency.map((r) => (
                <tr key={r.agencyId} className="tr-hover">
                  <td className="td font-medium text-navy-900">{r.agencyName}</td>
                  <td className="td tabular-nums">{Number(r.total)}</td>
                  <td className="td tabular-nums">{formatAmount(r.charged, "EUR")}</td>
                </tr>
              ))}
              {data.byAgency.length === 0 ? <tr><td colSpan={3} className="td py-6 text-center text-slate-500">No data.</td></tr> : null}
            </tbody>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader title="Applications by country" />
          <div className="space-y-3 px-4 py-4">
            {data.byCountry.map((r) => (
              <div key={r.countryName} className="flex items-center justify-between gap-3">
                <span className="w-40 truncate text-sm text-slate-700">{r.countryName}</span>
                <Bar max={maxCountry} value={Number(r.total)} />
                <span className="w-24 text-right text-xs tabular-nums text-slate-500">
                  {r.total} · {formatAmount(r.revenue, "EUR")}
                </span>
              </div>
            ))}
            {data.byCountry.length === 0 ? <p className="text-sm text-slate-500">No data.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Applications by status" />
          <div className="space-y-3 px-4 py-4">
            {data.byStatus.map((r) => (
              <div key={r.statusCode} className="flex items-center justify-between gap-3">
                <StatusBadge code={r.statusCode} name={r.statusName} />
                <Bar max={maxStatus} value={Number(r.total)} />
                <span className="w-10 text-right text-xs tabular-nums text-slate-500">{r.total}</span>
              </div>
            ))}
            {data.byStatus.length === 0 ? <p className="text-sm text-slate-500">No data.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Applications by visa type" />
          <div className="space-y-3 px-4 py-4">
            {data.byVisaType.map((r) => (
              <div key={r.visaTypeName} className="flex items-center justify-between gap-3">
                <span className="w-56 truncate text-sm text-slate-700">{r.visaTypeName}</span>
                <Bar max={maxVisa} value={Number(r.total)} />
                <span className="w-10 text-right text-xs tabular-nums text-slate-500">{r.total}</span>
              </div>
            ))}
            {data.byVisaType.length === 0 ? <p className="text-sm text-slate-500">No data.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Processing workload (assigned files)" />
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr><th className="th">Case officer</th><th className="th">Assigned applications</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.workload.map((r) => (
                <tr key={r.officer} className="tr-hover">
                  <td className="td">{r.officer}</td>
                  <td className="td tabular-nums">{Number(r.assigned)}</td>
                </tr>
              ))}
              {data.workload.length === 0 ? <tr><td colSpan={2} className="td py-6 text-center text-slate-500">No data.</td></tr> : null}
            </tbody>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader title="By priority" />
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr><th className="th">Priority</th><th className="th">Applications</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.byPriority.map((r) => (
                <tr key={r.priorityName} className="tr-hover">
                  <td className="td">{r.priorityName}</td>
                  <td className="td tabular-nums">{Number(r.total)}</td>
                </tr>
              ))}
              {data.byPriority.length === 0 ? <tr><td colSpan={2} className="td py-6 text-center text-slate-500">No data.</td></tr> : null}
            </tbody>
          </TableWrap>
        </Card>
      </div>
    </>
  );
}
