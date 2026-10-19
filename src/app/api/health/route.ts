import { NextResponse } from "next/server";
import { checkReadiness, publicHealthBody } from "@/lib/health";

export const dynamic = "force-dynamic";

/** Public, connection-free health; detailed diagnostics belong to internal endpoints. */
export async function GET() {
  const status = checkReadiness();
  return NextResponse.json(publicHealthBody(status), {
    status: status === "healthy" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
