import { NextResponse } from "next/server";
import { databaseObservabilitySnapshot } from "@/lib/database-observability";
import { authorizeOperatorRequest } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

/**
 * Protected, read-only database observability endpoint.
 * Returns aggregate operational metrics only.
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

  const snapshot = await databaseObservabilitySnapshot();
  return NextResponse.json(snapshot, {
    status: snapshot.status === "unavailable" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
