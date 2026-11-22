import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions } from "@/db/schema";
import { sessionPolicy } from "@/lib/identity-policy";

export const dynamic = "force-dynamic";

/**
 * Read-only, server-authoritative expiry information for both workspaces.
 * Background polling never renews activity. No token or PII is exposed.
 */
export async function GET() {
  const user = await getSessionUser();
  const headers = { "Cache-Control": "no-store" };
  if (!user?.sessionId) return Response.json({ authenticated: false }, { status: 401, headers });

  const [session] = await db.select({
    lastActivityAt: sessions.lastActivityAt,
    expiresAt: sessions.expiresAt,
  }).from(sessions).where(and(
    eq(sessions.id, user.sessionId),
    eq(sessions.userId, user.id),
  )).limit(1);

  if (!session) return Response.json({ authenticated: false }, { status: 401, headers });
  const serverNow = new Date();
  const idleDeadlineAt = new Date(session.lastActivityAt.getTime() + sessionPolicy(user.agencyId).idleMs);
  if (Math.min(idleDeadlineAt.getTime(), session.expiresAt.getTime()) <= serverNow.getTime()) {
    return Response.json({ authenticated: false }, { status: 401, headers });
  }
  return Response.json({
    authenticated: true,
    idleDeadlineAt: idleDeadlineAt.toISOString(),
    absoluteExpiresAt: session.expiresAt.toISOString(),
    serverNow: serverNow.toISOString(),
  }, { status: 200, headers });
}
