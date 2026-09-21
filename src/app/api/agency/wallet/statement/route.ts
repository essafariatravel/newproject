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

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    const url = new URL(request.url);
    const statement = await getAgencyWalletStatement({
      actor: user ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    const pdf = await buildWalletStatementPdf(statement);
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
      const status = err.code === "AUTH_REQUIRED" ? 401 : err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[wallet-statement] PDF generation failed:", err);
    return NextResponse.json({ error: "Could not generate the wallet statement." }, { status: 500 });
  }
}
