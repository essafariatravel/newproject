import { NextResponse } from "next/server";
import { checkReadiness, publicHealthBody } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * Public compatibility health endpoint.
 *
 * Deliberately minimal: never exposes database host, schema, migration names,
 * deployment SHA, credentials, internal counts, or exception text.
 */
export async function GET() {
  const status = await checkReadiness();
  return NextResponse.json(publicHealthBody(status), {
    status: status === "healthy" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
