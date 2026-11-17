import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isPushEligible, sendStaffTestPush } from "@/lib/push-service";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !isPushEligible(user)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "ORIGIN_REJECTED" }, { status: 403 });
  }
  try {
    if (!await consumeAuthRateLimit("push-test", user.id, 3, 60_000)) {
      return NextResponse.json({ error: "RATE_LIMITED" }, {
        status: 429, headers: { "Retry-After": "60", "Cache-Control": "private, no-store" },
      });
    }
    const delivered = await sendStaffTestPush(user.id);
    return NextResponse.json({ delivered }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "TEST_FAILED" }, { status: 503 });
  }
}
