import { portalPageUser } from "@/lib/page-auth";
import { getBalance, getTransactions } from "@/lib/wallet";
import { flashFrom } from "@/lib/action-helpers";
import { formatAmount, formatDateTime } from "@/lib/format";
import { Pagination } from "@/components/app-widgets";
import { Card, EmptyState, Flash, PageHeader, StatCard, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PortalWalletPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) sp[k] = typeof v === "string" ? v : undefined;
  const user = await portalPageUser();
  const flash = flashFrom(sp);
  const page = Number(sp.page ?? "1") || 1;
  const balance = await getBalance(user.agencyId);
  const txs = await getTransactions(user.agencyId, 1000);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(txs.length / pageSize));
  const visible = txs.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <PageHeader title="Wallet & Transactions" subtitle={`${user.agencyName} — prepaid balance and complete ledger.`} />
      <Flash {...flash} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Current balance" value={formatAmount(balance.balance, balance.currency)} tone="gold" />
        <StatCard label="Transactions" value={txs.length} />
        <StatCard
          label="Total credited"
          value={formatAmount(txs.filter((t) => t.tx.type === "CREDIT").reduce((s, t) => s + Number(t.tx.amount), 0).toFixed(2), balance.currency)}
        />
        <StatCard
          label="Total charged"
          value={formatAmount(txs.filter((t) => t.tx.type === "APPLICATION_CHARGE").reduce((s, t) => s + Number(t.tx.amount), 0).toFixed(2), balance.currency)}
          tone="navy"
        />
      </div>

      <div className="mt-6">
        {visible.length === 0 ? (
          <div className="card"><EmptyState title="No transactions yet" body="Wallet credits and application charges will appear here." /></div>
        ) : (
          <>
            <TableWrap>
              <thead className="border-b border-slate-100 bg-ivory-50/60">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Type</th>
                  <th className="th">Amount</th>
                  <th className="th">Balance before → after</th>
                  <th className="th">Application</th>
                  <th className="th">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map(({ tx, applicationReference }) => (
                  <tr key={tx.id} className="tr-hover">
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(tx.createdAt)}</td>
                    <td className="td">
                      <span className={`badge ${tx.type === "CREDIT" ? "bg-emerald-100 text-emerald-800" : tx.type === "DEBIT" ? "bg-red-100 text-red-700" : "bg-navy-900/5 text-navy-800"}`}>
                        {tx.type.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className={`td whitespace-nowrap font-medium tabular-nums ${tx.type === "CREDIT" ? "text-emerald-700" : "text-red-700"}`}>
                      {tx.type === "CREDIT" ? "+" : "−"}{formatAmount(tx.amount, tx.currency)}
                    </td>
                    <td className="td whitespace-nowrap tabular-nums text-xs">{tx.balanceBefore} → {tx.balanceAfter} {tx.currency}</td>
                    <td className="td text-xs">
                      {applicationReference ? (
                        tx.applicationId ? (
                          <a href={`/portal/applications/${tx.applicationId}`} className="text-navy-800 hover:underline">{applicationReference}</a>
                        ) : applicationReference
                      ) : "—"}
                    </td>
                    <td className="td max-w-[260px] truncate text-xs text-slate-500" title={tx.reason}>{tx.reason}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination page={page} pageCount={pageCount} total={txs.length} basePath="/portal/wallet" />
          </>
        )}
      </div>

      <Card className="mt-6">
        <div className="px-4 py-4 text-sm text-slate-600">
          <p className="font-medium text-navy-900">About your wallet</p>
          <p className="mt-1.5 max-w-2xl">
            Your agency wallet is prepaid: ESSAFARIA credits your balance when funds are received by bank
            transfer. Each submitted application is charged automatically at the fee configured for its visa
            programme — the amount shown on the application never changes after creation. There is no online
            payment in this version; contact ESSAFARIA accounting to fund your wallet.
          </p>
        </div>
      </Card>
    </>
  );
}
