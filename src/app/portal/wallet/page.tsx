import { portalPageUser } from "@/lib/page-auth";
import { getBalance, getTransactions } from "@/lib/wallet";
import { flashFrom } from "@/lib/action-helpers";
import { formatAmount, formatDateTime } from "@/lib/format";
import { Pagination } from "@/components/app-widgets";
import { Card, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import { WalletStatementForm } from "@/components/wallet-statement-form";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";

export default async function PortalWalletPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const uiLocale = await getUiLocale();
  const ct = contentT(uiLocale);
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
      <PageHeader title={ct("Wallet & Transactions")} subtitle={`${user.agencyName} — prepaid balance and complete ledger.`} />
      <Flash {...flash} />

      {/* Phase 2-Final Correction 2: the agency-facing summary shows ONLY the
          available balance. Aggregates (credited/debited/entry counts) stay
          available to Staff/Admin/Accounting surfaces (admin/billing) — the
          immutable ledger below is unchanged. */}
      <div className="card flex flex-col items-start gap-1 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{ct("Available balance")}</p>
          <p className="mt-1 font-serif text-4xl text-navy-900 tabular-nums">{formatAmount(balance.balance, balance.currency)}</p>
        </div>
        <p className="max-w-md text-sm text-slate-500">
          {ct("Your wallet stays prepaid — each confirmed visa request is debited automatically and shown in the ledger below.")}
        </p>
      </div>

      {user.role === "AGENCY_ADMIN" ? (
        <div className="mt-6">
          <WalletStatementForm
            locale={uiLocale}
        copy={{
          title: ct("Download wallet statement (PDF)"),
          body: ct("Professional statement for a chosen period: opening balance, credits, debits and closing balance, derived directly from the immutable ledger."),
          from: ct("From"),
          to: ct("To"),
          generate: ct("Generate PDF"),
          alertMissing: ct("Please choose both a 'from' and a 'to' date."),
          alertInverted: ct("The 'from' date must not be after the 'to' date."),
        }}
            today={new Date().toISOString().slice(0, 10)}
            defaultFrom={new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
          />
        </div>
      ) : null}

      <div className="mt-6">
        {visible.length === 0 ? (
          <div className="card"><EmptyState title={ct("No transactions yet")} body={ct("Wallet credits and application charges will appear here.")} /></div>
        ) : (
          <>
            <TableWrap>
              <thead className="border-b border-slate-100 bg-ivory-50/60">
                <tr>
                  <th className="th">{ct("Date")}</th>
                  <th className="th">{ct("Type")}</th>
                  <th className="th">{ct("Amount")}</th>
                  <th className="th">{ct("Balance before → after")}</th>
                  <th className="th">{ct("Application")}</th>
                  <th className="th">{ct("Reason")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map(({ tx, applicationReference }) => {
                  // §18 — direction from the actual balance movement; compensating
                  // commercial credits display "+", never as debits.
                  const creditEffect = Number(tx.balanceAfter) > Number(tx.balanceBefore);
                  const typeLabel =
                    tx.type === "COMMERCIAL_DISCOUNT"
                      ? ct("Commercial discount/refund")
                      : tx.type === "COMMERCIAL_SURCHARGE"
                        ? ct("Commercial surcharge")
                        : tx.type.replaceAll("_", " ");
                  return (
                  <tr key={tx.id} className="tr-hover">
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(tx.createdAt)}</td>
                    <td className="td">
                      <span className={`badge ${creditEffect ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
                        {typeLabel}
                      </span>
                    </td>
                    <td className={`td whitespace-nowrap font-medium tabular-nums ${creditEffect ? "text-emerald-700" : "text-red-700"}`}>
                      {creditEffect ? "+" : "−"}{formatAmount(tx.amount, tx.currency)}
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
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination locale={uiLocale} page={page} pageCount={pageCount} total={txs.length} basePath="/portal/wallet" />
          </>
        )}
      </div>

      <Card className="mt-6">
        <div className="px-4 py-4 text-sm text-slate-600">
          <p className="font-medium text-navy-900">{ct("About your wallet")}</p>
          <p className="mt-1.5 max-w-2xl">
            {ct("Your agency wallet is prepaid: ESSAFARIA credits your balance when funds are received by bank transfer. Each submitted application is charged automatically at the fee configured for its visa programme — the amount shown on the application never changes after creation. There is no online payment in this version; contact ESSAFARIA accounting to fund your wallet.")}
          </p>
        </div>
      </Card>
    </>
  );
}
