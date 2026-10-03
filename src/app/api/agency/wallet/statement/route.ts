/**
 * GET /api/agency/wallet/statement?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Wallet statement PDF for the signed-in AGENCY_ADMIN's own agency.
 * The agency scope is taken from the session — never from the request —
 * and every figure is derived server-side from the immutable ledger.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { AppError } from "@/lib/types";
import { buildWalletStatementPdf, getAgencyWalletStatement } from "@/lib/wallet-statement";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { recordAuditStrict } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    // Phase 2.2 §11 — API routes are covered by the forced-password-change lock too
    if (user?.mustChangePassword) {
      return NextResponse.json({ error: "You must set a new password before continuing.", code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 });
    }
    if (!user) {
      return NextResponse.json({ error: "Please sign in to continue.", code: "AUTH_REQUIRED" }, { status: 401 });
    }
    if (!await consumeAuthRateLimit("wallet-statement-user-minute", user.id, 6, 60_000)) {
      return NextResponse.json({ error: "Too many statements. Please wait before retrying.", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } });
    }

    const url = new URL(request.url);
    const statement = await getAgencyWalletStatement({
      actor: user ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    const pdf = await buildWalletStatementPdf(statement);
    await recordAuditStrict({
      actor: user,
      action: "WALLET_STATEMENT_EXPORTED",
      entity: "wallet_transaction",
      agencyId: user.agencyId,
      metadata: {
        from: statement.from.toISOString(),
        to: statement.to.toISOString(),
        sections: statement.sections.length,
        rows: statement.sections.reduce((sum, section) => sum + section.transactions.length, 0),
        truncated: statement.truncated,
      },
    });
    const filename = `wallet-statement-${statement.from.toISOString().slice(0, 10)}_to_${statement.to.toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      const status = err.code === "AUTH_REQUIRED" ? 401 : err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : err.code === "AUDIT_FAILED" ? 503 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[wallet-statement] PDF generation failed:", err);
    return NextResponse.json({ error: "Could not generate the wallet statement." }, { status: 500 });
  }
}
