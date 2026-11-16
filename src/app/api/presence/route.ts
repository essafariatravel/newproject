import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { PRODUCTION_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/types";
import { hashToken } from "@/lib/crypto";
import { onlineUserCount, touchPresence } from "@/lib/presence";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new NextResponse(null, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  // Follow the same production-first cookie selection as getSessionUser().
  // Production logins set __Host-evos_session; the legacy name remains a fallback.
  const jar = await cookies();
  const token = (process.env.NODE_ENV === "production"
    ? jar.get(PRODUCTION_SESSION_COOKIE)?.value
    : undefined) ?? jar.get(SESSION_COOKIE)?.value;
  if (!token) return new NextResponse(null, { status: 401 });
  try {
    await touchPresence(user.id, hashToken(token));
    const staff = !user.agencyId && ["SUPER_ADMIN", "ADMIN", "VISA_AGENT", "ACCOUNTING"].includes(user.role);
    return NextResponse.json(staff ? { online: await onlineUserCount() } : {}, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // An unavailable presence service must never break authentication or dossiers.
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
