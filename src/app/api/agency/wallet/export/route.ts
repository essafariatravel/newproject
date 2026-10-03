/**
 * GET /api/agency/wallet/export?period=&from=&to=&type=&q=
 *
 * CSV export of the signed-in agency's OWN ledger.
 *
 * Tenant scope comes from the session — never from the query string — so an
 * agency can only ever export its own rows. Amounts are DZD only.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { AppError, isAgencyRole } from "@/lib/types";
import { hasPermission } from "@/lib/rbac";
import { listWalletTransactions } from "@/lib/queries";
import { resolveLedgerPeriod } from "@/lib/ledger-filters";

import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { businessLabel, businessReason } from "@/lib/business-labels";
import { toCsv, toXlsx, XLSX_CONTENT_TYPE, type Column } from "@/lib/tabular-export";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Please sign in to continue.", code: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (user.mustChangePassword) return NextResponse.json({ code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 });
    if (!isAgencyRole(user.role) || !user.agencyId) {
      return NextResponse.json({ error: "This export is only available to agency users.", code: "FORBIDDEN" }, { status: 403 });
    }
    if (!hasPermission(user, "transactions.view.own")) {
      return NextResponse.json({ error: "Not authorized.", code: "FORBIDDEN" }, { status: 403 });
    }

    if (!await consumeAuthRateLimit("export-wallet-user-minute", user.id, 10, 60_000)) {
      return NextResponse.json({ error: "Too many exports. Please wait before retrying.", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } });
    }

    const url = new URL(request.url);
    const sp = {
      period: url.searchParams.get("period") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    };
    const range = resolveLedgerPeriod(sp);
    const { rows } = await listWalletTransactions({
      agencyId: user.agencyId, // server-side tenant scope
      type: url.searchParams.get("type") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      from: range.from,
      to: range.to,
      page: 1,
      pageSize: 10_000, // exports are bounded by the agency's own history
    });

    const locale = await getUiLocale({ lang: url.searchParams.get("lang") });
    const ct = contentT(locale);
    const columns: Column[] = [
      { key: "reference", header: ct("Reference") }, { key: "date", header: ct("Date") },
      { key: "type", header: ct("Type") }, { key: "amount", header: `${ct("Amount")} (DZD)`, kind: "money" },
      { key: "before", header: `${ct("Balance before")} (DZD)`, kind: "money" },
      { key: "after", header: `${ct("Balance after")} (DZD)`, kind: "money" },
      { key: "application", header: ct("Application") }, { key: "reason", header: ct("Reason") },
    ];
    const data = rows.map(({ tx, applicationReference }) => ({
      reference: tx.reference ?? "—", date: new Date(tx.createdAt).toISOString(),
      type: businessLabel(tx.type, locale), amount: Number(tx.amount),
      before: Number(tx.balanceBefore), after: Number(tx.balanceAfter),
      application: applicationReference ?? "", reason: businessReason(tx.reason, tx.type, applicationReference, locale),
    }));
    const xlsx = url.searchParams.get("format") === "xlsx";
    const body = xlsx ? new Uint8Array(toXlsx(ct("Wallet"), columns, data)) : toCsv(columns, data, { locale, excel: true });
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(body, {
      headers: {
        "Content-Type": xlsx ? XLSX_CONTENT_TYPE : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wallet-ledger-${stamp}.${xlsx ? "xlsx" : "csv"}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("[wallet-export] failed:", err);
    return NextResponse.json({ error: "Could not export the ledger." }, { status: 500 });
  }
}
