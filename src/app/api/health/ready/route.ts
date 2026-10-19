import { NextResponse } from "next/server";
import { checkReadiness, publicHealthBody } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * Anonymous, low-cost readiness probe. It validates database configuration and
 * schema boundaries without opening a connection; /api/health remains the
 * compatibility diagnostics endpoint and internal deep health owns live checks.
 */
export async function GET() {
  const status = checkReadiness();
  return NextResponse.json(publicHealthBody(status), {
    status: status === "healthy" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
