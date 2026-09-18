import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listAgencies, listWalletTransactions } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { adjustWalletAction } from "@/app/actions/admin";
import { formatAmount, formatDateTime } from "@/lib/format";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { SubmitButton } from "@/components/forms";
import { EmptyState, Flash, PageHeader, StatCard, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const staff = await pageUser();
  if (!hasPermission(staff, "wallet.view.all")) {
    return (
      <>
        <PageHeader title="Wallets & Billing" />
        <div className="card"><EmptyState title="Not authorized" /></div>
      </>
    );
  }
  const flash = flashFrom(sp);
  const agencyFilter = typeof sp.agency === "string" ? sp.agency : undefined;
  const page = Number(sp.page ?? "1") || 1;
  const [txs, agencies] = await Promise.all([listWalletTransactions({ agencyId: agencyFilter, page }), listAgencies()]);
  const canAdjust = ["SUPER_ADMIN", "ADMIN", "ACCOUNTING"].includes(staff.role);
  const totalBalance = agencies.reduce((sum, a) => sum + Number(a.agency.balance), 0);

  return (
    <>
      <PageHeader title="Wallets & Billing" subtitle="Prepaid agency wallets. No online gateway — balances are funded manually and every movement is a ledger entry." />
      <Flash {...flash} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Agencies" value={agencies.length} href="/admin/agencies" />
        <StatCard label="Combined balances" value={formatAmount(totalBalance.toFixed(2), "EUR")} tone="gold" />
        <StatCard label="Ledger entries" value={txs.total} />
        <StatCard label="Unfiltered view" value={agencyFilter ? "Filtered" : "All agencies"} />
      </div>

      <div className="mt-6">
        <FilterBar
          action="/admin/billing"
          fields={[
            {
              name: "agency",
              label: "Agency",
              type: "select",
              value: agencyFilter,
              options: agencies.map((a) => ({ value: a.agency.id, label: a.agency.tradingName ?? a.agency.legalName })),
            },
          ]}
        />

        {txs.rows.length === 0 ? (
          <div className="card"><EmptyState title="No transactions found" /></div>
        ) : (
          <>
            <TableWrap>
              <thead className="border-b border-slate-100 bg-ivory-50/60">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Agency</th>
                  <th className="th">Type</th>
                  <th className="th">Amount</th>
                  <th className="th">Balance before → after</th>
                  <th className="th">Application</th>
                  <th className="th">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {txs.rows.map(({ tx, agencyName, applicationReference }) => (
                  <tr key={tx.id} className="tr-hover">
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(tx.createdAt)}</td>
                    <td className="td max-w-[160px] truncate">
                      <Link href={`/admin/agencies/${tx.agencyId}`} className="text-navy-800 hover:underline">
                        {agencyName}
                      </Link>
                    </td>
                    <td className="td">
                      <span className={`badge ${tx.type === "CREDIT" ? "bg-emerald-100 text-emerald-800" : tx.type === "DEBIT" ? "bg-red-100 text-red-700" : "bg-navy-900/5 text-navy-800"}`}>
                        {tx.type.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className={`td whitespace-nowrap font-medium tabular-nums ${tx.type === "CREDIT" ? "text-emerald-700" : "text-red-700"}`}>
                      {tx.type === "CREDIT" ? "+" : "−"}{formatAmount(tx.amount, tx.currency)}
                    </td>
                    <td className="td whitespace-nowrap tabular-nums text-xs">
                      {tx.balanceBefore} → {tx.balanceAfter} {tx.currency}
                    </td>
                    <td className="td text-xs">
                      {tx.applicationId && applicationReference ? (
                        <Link href={`/admin/applications/${tx.applicationId}`} className="text-navy-800 hover:underline">
                          {applicationReference}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="td max-w-[260px] truncate text-xs text-slate-500" title={tx.reason}>{tx.reason}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination page={txs.page} pageCount={txs.pageCount} total={txs.total} basePath="/admin/billing" query={{ agency: agencyFilter }} />
          </>
        )}
      </div>

      {canAdjust ? (
        <div className="mt-8">
          <h2 className="mb-3 font-serif text-xl text-navy-900">Manual wallet adjustment</h2>
          <form action={adjustWalletAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-4">
            <input type="hidden" name="back" value="/admin/billing" />
            <div>
              <label className="label" htmlFor="agencyId">Agency *</label>
              <select id="agencyId" name="agencyId" required className="input">
                {agencies.map((a) => (
                  <option key={a.agency.id} value={a.agency.id}>
                    {a.agency.tradingName ?? a.agency.legalName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="amount">Amount (negative to debit) *</label>
              <input id="amount" name="amount" type="number" step="0.01" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="reason">Reason (mandatory) *</label>
              <input id="reason" name="reason" required minLength={5} className="input" />
            </div>
            <div className="flex items-end">
              <SubmitButton className="btn-primary" pendingLabel="Adjusting…">Apply adjustment</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
