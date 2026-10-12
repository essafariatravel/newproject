import { NextResponse } from "next/server";
import { publicHealthBody } from "@/lib/health";

export const dynamic = "force-dynamic";

/** Liveness only: proves the application runtime can answer. */
export async function GET() {
  return NextResponse.json(publicHealthBody("healthy"), {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
