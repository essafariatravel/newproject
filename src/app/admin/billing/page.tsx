import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listAgencies, listWalletTransactions } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { adjustWalletAction } from "@/app/actions/admin";
import { formatAmount, formatDateTime } from "@/lib/format";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
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
  const uiLocale = await getUiLocale();
  const ct = contentT(uiLocale);
  if (!hasPermission(staff, "wallet.view.all")) {
    return (
      <>
        <PageHeader title={ct("Wallets & Billing")} />
        <div className="card"><EmptyState title={ct("Not authorized")} /></div>
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
      <PageHeader title={ct("Wallets & Billing")} subtitle={ct("Prepaid agency wallets. No online gateway — balances are funded manually and every movement is a ledger entry. DZD only.")} />
      <Flash {...flash} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={ct("Agencies")} value={agencies.length} href="/admin/agencies" />
        <StatCard label={ct("Combined balances")} value={formatAmount(totalBalance.toFixed(2), "DZD", uiLocale)} tone="gold" />
        <StatCard label={ct("Ledger entries")} value={txs.total} />
        <StatCard label={ct("Unfiltered view")} value={agencyFilter ? ct("Filtered") : ct("All agencies")} />
      </div>

      <div className="mt-6">
        <FilterBar
          locale={uiLocale}
          action="/admin/billing"
          fields={[
            {
              name: "agency",
              label: ct("Agency"),
              type: "select",
              value: agencyFilter,
              options: agencies.map((a) => ({ value: a.agency.id, label: a.agency.tradingName ?? a.agency.legalName })),
            },
          ]}
        />

        {txs.rows.length === 0 ? (
          <div className="card"><EmptyState title={ct("No transactions found")} /></div>
        ) : (
          <>
            <TableWrap>
              <thead className="border-b border-slate-100 bg-ivory-50/60">
                <tr>
                  <th className="th">{ct("Reference")}</th>
                  <th className="th">{ct("Date")}</th>
                  <th className="th">{ct("Agency")}</th>
                  <th className="th">{ct("Type")}</th>
                  <th className="th">{ct("Amount")}</th>
                  <th className="th">{ct("Balance before → after")}</th>
                  <th className="th">{ct("Application")}</th>
                  <th className="th">{ct("Reason")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {txs.rows.map(({ tx, agencyName, applicationReference }) => (
                  <tr key={tx.id} className="tr-hover">
                    <td className="td whitespace-nowrap text-xs font-mono">{(tx as any).reference ?? tx.id.slice(0, 8)}</td>
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(tx.createdAt)}</td>
                    <td className="td max-w-[160px] truncate">
                      <Link href={`/admin/agencies/${tx.agencyId}`} className="text-navy-800 hover:underline">
                        {agencyName}
                      </Link>
                    </td>
                    <td className="td">
                      <span className={`badge ${tx.type === "CREDIT" || tx.type === "COMMERCIAL_DISCOUNT" ? "bg-emerald-100 text-emerald-800" : tx.type === "DEBIT" || tx.type === "COMMERCIAL_SURCHARGE" ? "bg-red-100 text-red-700" : "bg-navy-900/5 text-navy-800"}`}>
                        {tx.type.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className={`td whitespace-nowrap font-medium tabular-nums ${tx.type === "CREDIT" || tx.type === "COMMERCIAL_DISCOUNT" ? "text-emerald-700" : "text-red-700"}`}>
                      {tx.type === "CREDIT" || tx.type === "COMMERCIAL_DISCOUNT" ? "+" : "−"}{formatAmount(tx.amount, "DZD", uiLocale)}
                    </td>
                    <td className="td whitespace-nowrap tabular-nums text-xs">
                      {formatAmount(tx.balanceBefore, "DZD", uiLocale)} → {formatAmount(tx.balanceAfter, "DZD", uiLocale)}
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
            <Pagination locale={uiLocale} page={txs.page} pageCount={txs.pageCount} total={txs.total} basePath="/admin/billing" query={{ agency: agencyFilter }} />
          </>
        )}
      </div>

      {canAdjust ? (
        <div className="mt-8">
          <h2 className="mb-3 font-serif text-xl text-navy-900">{ct("Manual wallet adjustment")}</h2>
          <form action={adjustWalletAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-5">
            <input type="hidden" name="back" value="/admin/billing" />
            <div>
              <label className="label" htmlFor="agencyId">{ct("Agency")} *</label>
              <select id="agencyId" name="agencyId" required className="input">
                {agencies.map((a) => (
                  <option key={a.agency.id} value={a.agency.id}>
                    {a.agency.tradingName ?? a.agency.legalName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="operation">{ct("Operation")} *</label>
              <select id="operation" name="operation" required className="input" defaultValue="CREDIT">
                <option value="CREDIT">{ct("Credit wallet")}</option>
                <option value="DEBIT">{ct("Debit wallet")}</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="amount">{ct("Amount (DZD)")} *</label>
              <input id="amount" name="amount" type="number" step="0.01" min="0.01" required className="input" placeholder="50000" />
            </div>
            <div>
              <label className="label" htmlFor="reason">{ct("Reason (mandatory)")} *</label>
              <input id="reason" name="reason" required minLength={5} className="input" placeholder={ct("Bank transfer #1234, refund…")} />
            </div>
            <div className="flex items-end">
              <SubmitButton className="btn-primary" pendingLabel={ct("Adjusting…")}>{ct("Apply adjustment")}</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
