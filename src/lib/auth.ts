import { and, eq, gt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { agencies, sessions, users } from "@/db/schema";
import {
  AppError,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  type AuthUser,
  type Role,
} from "@/lib/types";
import { generateSessionToken, hashToken } from "@/lib/crypto";
import type { User } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Create a session and return the opaque cookie token. */
export async function createSession(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS);
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const hdrs = await headers();
    ipAddress = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    userAgent = hdrs.get("user-agent")?.slice(0, 300) ?? null;
  } catch {
    // outside a request scope (scripts/tests) — metadata is optional
  }
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ipAddress,
    userAgent,
  });
  return { token, expiresAt };
}

/** Resolve the current authenticated user, or null. Verifies session + user + agency state. */
export async function getSessionUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      user: users,
      agencyStatus: agencies.status,
      agencyName: agencies.legalName,
      sessionExpired: sql<boolean>`(${sessions.expiresAt} < now())`,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(agencies, eq(users.agencyId, agencies.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.user.status !== "ACTIVE") return null;
  if (row.agencyStatus !== null && row.agencyStatus !== "ACTIVE") return null;
  return {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.user.role as Role,
    agencyId: row.user.agencyId,
    userStatus: row.user.status,
    agencyStatus: row.agencyStatus,
    agencyName: row.agencyName,
  };
}

/** Require an authenticated user or throw a user-safe error. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  return user;
}

/** Require a staff (ESSAFARIA internal) user. */
export async function requireStaff(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.agencyId && ["SUPER_ADMIN", "ADMIN", "VISA_AGENT", "ACCOUNTING"].includes(user.role)) {
    return user;
  }
  throw new AppError("FORBIDDEN", "You are not authorized to access this area.");
}

/** Require an agency user bound to a tenant. */
export async function requireAgencyUser(): Promise<AuthUser & { agencyId: string }> {
  const user = await requireUser();
  if (!user.agencyId) {
    throw new AppError("FORBIDDEN", "This area is only available to agency users.");
  }
  return user as AuthUser & { agencyId: string };
}

/** Set the session cookie (must be called in a server action / route handler). */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Destroy the current session server-side. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  await clearSessionCookie();
}

/** Authenticate by email + password. Returns the user row. */
export async function authenticate(email: string, password: string): Promise<User> {
  const { verifyPassword } = await import("@/lib/crypto");
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  const user = rows[0];
  if (!user) {
    // Perform a dummy verification to keep timing uniform.
    await verifyPassword(password, "scrypt$00$00");
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password.");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new AppError("INVALID_CREDENTIALS", "Invalid email or password.");
  if (user.status !== "ACTIVE") {
    throw new AppError("USER_SUSPENDED", "This account has been suspended. Contact ESSAFARIA support.");
  }
  if (user.agencyId) {
    const agency = await db
      .select({ status: agencies.status })
      .from(agencies)
      .where(eq(agencies.id, user.agencyId))
      .limit(1);
    if (agency[0]?.status !== "ACTIVE") {
      throw new AppError("AGENCY_SUSPENDED", "Your agency account is currently suspended.");
    }
  }
  return user;
}
