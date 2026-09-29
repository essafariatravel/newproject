import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/types";
import { hashToken } from "@/lib/crypto";
import { onlineUserCount, touchPresence } from "@/lib/presence";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new NextResponse(null, { status: 403 });
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
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
