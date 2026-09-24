import Link from "next/link";
import { portalPageUser } from "@/lib/page-auth";
import { getBalance } from "@/lib/wallet";
import { listWalletTransactions } from "@/lib/queries";
import { listTopupRequestsForAgency } from "@/lib/topup";
import { requestTopupAction } from "@/app/actions/topup";
import { flashFrom } from "@/lib/action-helpers";
import { formatAmount, formatDateTime } from "@/lib/format";
import { resolveLedgerPeriod } from "@/lib/ledger-filters";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { Card, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import { WalletStatementForm } from "@/components/wallet-statement-form";
import { TopupRequestForm } from "@/components/topup";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";

/** Balance below which we proactively suggest a top-up (a typical visa fee). */
const LOW_BALANCE_HINT_DZD = 15000;

export default async function PortalWalletPage({
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
  const range = resolveLedgerPeriod({ period: sp.period, from: sp.from, to: sp.to });
  const typeFilter = sp.type && typeFilterOptions(ct).some((o) => o.value === sp.type) ? sp.type : undefined;
  const q = sp.q?.trim() || undefined;

  const [balance, ledger, topups] = await Promise.all([
    getBalance(user.agencyId),
    listWalletTransactions({
      agencyId: user.agencyId, // tenant scope from the session only
      type: typeFilter,
      q,
      from: range.from,
      to: range.to,
      page,
      pageSize: 25,
    }),
    listTopupRequestsForAgency(user.agencyId),
  ]);

  const pendingTopup = topups.find((t) => t.status === "PENDING") ?? null;
  const balanceValue = Number(balance.balance);
  const lowBalance = balanceValue < LOW_BALANCE_HINT_DZD;
  const query: Record<string, string | undefined> = {
    period: sp.period,
    from: sp.from,
    to: sp.to,
    type: typeFilter,
    q,
  };
  const exportQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) exportQuery.set(k, v);

  return (
    <>
      <PageHeader title={ct("Wallet & Transactions")} subtitle={ct("Prepaid DZD wallet with an immutable ledger.")} />
      <Flash {...flash} />

      {/* Primary element: the available balance */}
      <div className="card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{ct("Available balance")}</p>
          <p className="mt-1 font-serif text-4xl text-navy-900 tabular-nums">
            {formatAmount(balance.balance, "DZD", uiLocale)}
          </p>
          <p className="mt-1 text-xs text-slate-400">{ct("Currency")}: DZD — {ct("Algerian Dinar")}</p>
        </div>
        <div className="max-w-md space-y-2">
          <p className="text-sm text-slate-500">
            {ct("Your wallet stays prepaid — each confirmed visa request is debited automatically and shown in the ledger below. All amounts in DZD.")}
          </p>
          {lowBalance ? (
            <p className="rounded-xl border border-gold-200 bg-gold-50 px-3 py-2 text-xs text-gold-800">
              {ct("Your wallet balance may be insufficient for a new application.")}{" "}
              <a href="#topup" className="font-semibold underline">
                {ct("Request wallet top-up")}
              </a>
            </p>
          ) : null}
        </div>
      </div>

      {/* Immutable-ledger explainer: what the agency is looking at, in plain words */}
      <div className="card mt-4 px-5 py-4">
        <h3 className="text-sm font-semibold text-navy-800">{ct("About your wallet")}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          {ct(
            "Your wallet is prepaid and denominated in Algerian dinars (DZD) only. Every movement is written to an immutable ledger with a numbered reference, a before/after balance and a reason — nothing can be edited or deleted, corrections are made with compensating entries.",
          )}
        </p>
      </div>

      {/* Statement + export */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {user.role === "AGENCY_ADMIN" ? (
          <WalletStatementForm
            locale={uiLocale}
            copy={{
              title: ct("Download wallet statement (PDF)"),
              body: ct("Professional statement for a chosen period: opening balance, credits, debits and closing balance, derived directly from the immutable ledger. DZD only."),
              from: ct("From"),
              to: ct("To"),
              generate: ct("Generate PDF"),
              alertMissing: ct("Please choose both a 'from' and a 'to' date."),
              alertInverted: ct("The 'from' date must not be after the 'to' date."),
            }}
            today={new Date().toISOString().slice(0, 10)}
            defaultFrom={new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
          />
        ) : null}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-navy-800">{ct("Statement period")}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{ct("Filter the ledger by period, then export exactly what you see.")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {([
              ["this_month", ct("This month")],
              ["last_month", ct("Last month")],
              ["last_3_months", ct("Last 3 months")],
              ["all", ct("All time")],
            ] as const).map(([value, label]) => (
              <Link
                key={value}
                href={`/portal/wallet?period=${value}`}
                className={range.period === value ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
              >
                {label}
              </Link>
            ))}
          </div>
          <a
            href={`/api/agency/wallet/export${exportQuery.size > 0 ? `?${exportQuery.toString()}` : ""}`}
            className="btn-secondary btn-sm mt-3 inline-flex"
          >
            {ct("Export CSV")}
          </a>
        </Card>
      </div>

      {/* Ledger */}
      <div className="mt-6">
        <FilterBar
          locale={uiLocale}
          action="/portal/wallet"
          fields={[
            { name: "q", label: ct("Search"), type: "text", value: q, placeholder: ct("Reference or reason") },
            {
              name: "type",
              label: ct("Type"),
              type: "select",
              value: typeFilter,
              options: typeFilterOptions(ct),
            },
            { name: "from", label: ct("From"), type: "date", value: sp.from },
            { name: "to", label: ct("To"), type: "date", value: sp.to },
          ]}
        />

        {ledger.rows.length === 0 ? (
          <div className="card">
            <EmptyState
              title={ct("No transactions yet")}
              body={ct("Wallet credits and application charges will appear here. DZD only.")}
            />
          </div>
        ) : (
          <>
            <TableWrap>
              <thead className="border-b border-slate-100 bg-ivory-50/60">
                <tr>
                  <th className="th">{ct("Date")}</th>
                  <th className="th">{ct("Reference")}</th>
                  <th className="th">{ct("Type")}</th>
                  <th className="th">{ct("Amount")}</th>
                  <th className="th">{ct("Balance before → after")}</th>
                  <th className="th">{ct("Application")}</th>
                  <th className="th">{ct("Reason")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.rows.map(({ tx, applicationReference }) => {
                  const creditEffect = Number(tx.balanceAfter) > Number(tx.balanceBefore);
                  const typeLabel =
                    tx.type === "COMMERCIAL_DISCOUNT"
                      ? ct("Commercial discount/refund")
                      : tx.type === "COMMERCIAL_SURCHARGE"
                        ? ct("Commercial surcharge")
                        : tx.type === "APPLICATION_CHARGE"
                          ? ct("Application charge")
                          : tx.type === "CREDIT"
                            ? ct("Credit")
                            : tx.type === "DEBIT"
                              ? ct("Debit")
                              : tx.type.replaceAll("_", " ");
                  return (
                    <tr key={tx.id} className="tr-hover">
                      <td className="td whitespace-nowrap text-xs">{formatDateTime(tx.createdAt, uiLocale)}</td>
                      <td className="td whitespace-nowrap font-mono text-[11px]">{tx.reference ?? "—"}</td>
                      <td className="td">
                        <span className={`badge ${creditEffect ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
                          {typeLabel}
                        </span>
                      </td>
                      <td className={`td whitespace-nowrap font-medium tabular-nums ${creditEffect ? "text-emerald-700" : "text-red-700"}`}>
                        {creditEffect ? "+" : "−"}
                        {formatAmount(tx.amount, "DZD", uiLocale)}
                      </td>
                      <td className="td whitespace-nowrap tabular-nums text-xs">
                        {formatAmount(tx.balanceBefore, "DZD", uiLocale)} → {formatAmount(tx.balanceAfter, "DZD", uiLocale)}
                      </td>
                      <td className="td text-xs">
                        {applicationReference && tx.applicationId ? (
                          <Link href={`/portal/applications/${tx.applicationId}`} className="text-navy-800 hover:underline">
                            {applicationReference}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="td max-w-[260px] truncate text-xs text-slate-500" title={tx.reason}>
                        {tx.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination
              locale={uiLocale}
              page={ledger.page}
              pageCount={ledger.pageCount}
              total={ledger.total}
              basePath="/portal/wallet"
              query={query}
            />
          </>
        )}
      </div>

      {/* Top-up request */}
      <Card className="mt-8 scroll-mt-24 p-5" >
        <div id="topup" />
        <h2 className="font-serif text-xl text-navy-900">{ct("Request wallet top-up")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          {ct("Tell ESSAFARIA how much you need in your wallet. Your balance is credited once the funds are confirmed — no online payment is taken here.")}
        </p>
        <div className="mt-4 max-w-3xl">
          <TopupRequestForm
            action={requestTopupAction}
            back="/portal/wallet"
            currentBalance={balance.balance}
            locale={uiLocale}
            disabled={Boolean(pendingTopup)}
            disabledReason={ct("You already have a pending top-up request.")}
            copy={{
              amountLabel: ct("Amount to fund (DZD)"),
              amountPlaceholder: "50000",
              noteLabel: ct("Optional note (payment reference, transfer date…)"),
              notePlaceholder: ct("Bank transfer #1234"),
              submit: ct("Send top-up request"),
              sending: ct("Sending…"),
              resultingBalance: ct("Resulting balance"),
              currentBalance: ct("Current balance"),
              creditLabel: ct("Credit wallet"),
              rejectLabel: ct("Reject request"),
              reasonLabel: ct("Reason (sent to the agency)"),
              reasonPlaceholder: ct("e.g. bank transfer received 23 Sep"),
              confirmCredit: ct("Credit and close"),
              confirmReject: ct("Confirm rejection"),
              processing: ct("Processing…"),
              requestedAmount: ct("Requested amount (DZD)"),
              creditedAmount: ct("Amount to fund (DZD)"),
              maxNote: ct("Credit amounts above the requested value are not allowed — use a manual adjustment instead."),
            }}
          />
        </div>

        <h3 className="mt-6 text-sm font-semibold text-navy-800">{ct("Top-up requests")}</h3>
        {topups.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            {ct("Top-up requests you send to ESSAFARIA appear here with their status.")}
          </p>
        ) : (
          <div className="mt-3">
            <TableWrap>
              <thead className="border-b border-slate-100 bg-ivory-50/60">
                <tr>
                  <th className="th">{ct("Reference")}</th>
                  <th className="th">{ct("Date")}</th>
                  <th className="th">{ct("Amount")}</th>
                  <th className="th">{ct("Status")}</th>
                  <th className="th">{ct("Wallet transaction")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topups.map((t) => (
                  <tr key={t.id} className="tr-hover">
                    <td className="td whitespace-nowrap font-mono text-[11px]">{t.reference}</td>
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(t.createdAt, uiLocale)}</td>
                    <td className="td whitespace-nowrap tabular-nums">{formatAmount(t.amount, "DZD", uiLocale)}</td>
                    <td className="td">
                      <span
                        className={`badge ${topupBadgeClass(t.status)}`}
                      >
                        {ct(topupStatusLabel(t.status))}
                      </span>
                    </td>
                    <td className="td whitespace-nowrap font-mono text-[11px]">{t.walletReference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          {ct("Once ESSAFARIA confirms the funds, the credit appears in your ledger below.")}
        </p>
      </Card>
    </>
  );
}

function topupStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "PROCESSED":
      return "Processed";
    case "REJECTED":
      return "Rejected";
    default:
      return "Cancelled";
  }
}

function topupBadgeClass(status: string): string {
  switch (status) {
    case "PROCESSED":
      return "bg-emerald-100 text-emerald-800";
    case "PENDING":
      return "bg-gold-100 text-gold-700";
    case "REJECTED":
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function typeFilterOptions(ct: (s: string) => string) {
  return [
    { value: "CREDIT", label: ct("Credit") },
    { value: "DEBIT", label: ct("Debit") },
    { value: "APPLICATION_CHARGE", label: ct("Application charge") },
    { value: "COMMERCIAL_DISCOUNT", label: ct("Commercial discount/refund") },
    { value: "COMMERCIAL_SURCHARGE", label: ct("Commercial surcharge") },
  ];
}
