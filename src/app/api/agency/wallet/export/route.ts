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

export const dynamic = "force-dynamic";

/** Escape a value for CSV (RFC 4180): quotes doubled, cell quoted when needed. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Please sign in to continue.", code: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (!isAgencyRole(user.role) || !user.agencyId) {
      return NextResponse.json({ error: "This export is only available to agency users.", code: "FORBIDDEN" }, { status: 403 });
    }
    if (!hasPermission(user, "transactions.view.own")) {
      return NextResponse.json({ error: "Not authorized.", code: "FORBIDDEN" }, { status: 403 });
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

    const header = ["Reference", "Date", "Type", "Amount (DZD)", "Balance before (DZD)", "Balance after (DZD)", "Application", "Reason"];
    const lines = [header.join(",")];
    for (const { tx, applicationReference } of rows) {
      lines.push(
        [
          tx.reference ?? tx.id,
          tx.createdAt instanceof Date ? tx.createdAt.toISOString() : String(tx.createdAt),
          tx.type,
          tx.amount,
          tx.balanceBefore,
          tx.balanceAfter,
          applicationReference ?? "",
          tx.reason,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    const body = `\uFEFF${lines.join("\r\n")}\r\n`;
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wallet-ledger-${stamp}.csv"`,
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
