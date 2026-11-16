import { NextResponse } from "next/server";
import { authorizeOperatorRequest } from "@/lib/operator-auth";
import { runIntegrityChecks } from "@/lib/integrity";

export const dynamic = "force-dynamic";


/**
 * Protected, read-only business/data integrity monitor.
 *
 * Only aggregate anomaly counts are returned. No identifiers or PII.
 */
export async function GET(request: Request) {
  const auth = authorizeOperatorRequest(request);
  if (auth === "disabled") {
    return NextResponse.json(
      { status: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (auth === "denied") {
    return NextResponse.json(
      { status: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const report = await runIntegrityChecks();
  return NextResponse.json(report, {
    status: report.status === "violation" || report.status === "unavailable" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
