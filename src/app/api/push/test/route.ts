import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isPushEligible, sendStaffTestPush } from "@/lib/push-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !isPushEligible(user)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "ORIGIN_REJECTED" }, { status: 403 });
  }
  try {
    const delivered = await sendStaffTestPush(user.id);
    return NextResponse.json({ delivered }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "TEST_FAILED" }, { status: 503 });
  }
}
