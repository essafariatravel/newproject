import { and, eq, gt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { agencies, sessions, users } from "@/db/schema";
import {
  AppError,
  PRODUCTION_SESSION_COOKIE,
  SESSION_COOKIE,
  type AuthUser,
  type Role,
  isAgencyRole,
} from "@/lib/types";
import { generateSessionToken, hashToken } from "@/lib/crypto";
import type { User } from "@/db/schema";
import { sessionPolicy, SESSION_POLICIES } from "@/lib/identity-policy";
import { lockIdentityState, recordIdentityAudit } from "@/lib/account-security";
import { safeErrorCode } from "@/lib/safe-error";
import { mfaEnforcementEnabled } from "@/lib/mfa-policy";
import { readStaffProfile } from '@/lib/staff-profile';
import { assertPasswordLoginAllowed, clearPasswordFailures, lockPasswordLogin, normalizedLoginEmail, passwordLoginKey, recordPasswordFailure } from "@/lib/login-lockout";

function preferredSessionCookieName(): string {
  return process.env.NODE_ENV === "production" ? PRODUCTION_SESSION_COOKIE : SESSION_COOKIE;
}

async function readSessionToken(): Promise<string | undefined> {
  const jar = await cookies();
  const preferred = preferredSessionCookieName();
  return jar.get(preferred)?.value ??
    (preferred !== SESSION_COOKIE ? jar.get(SESSION_COOKIE)?.value : undefined);
}


/** Create a session and return the opaque cookie token. */
export async function createSession(
  userId: string,
  options: { expectedCredentialVersion?: number; auditLogin?: boolean; passwordLoginKey?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const hdrs = await headers();
    ipAddress = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    userAgent = hdrs.get("user-agent")?.slice(0, 300) ?? null;
  } catch {
    // outside a request scope (scripts/tests) — metadata is optional
  }
  const expiresAt = await db.transaction(async (tx) => {
    await lockIdentityState(tx);
    const [row] = await tx.select({ user: users, agencyStatus: agencies.status }).from(users)
      .leftJoin(agencies, eq(users.agencyId, agencies.id)).where(eq(users.id, userId)).limit(1);
    if (!row || row.user.status !== "ACTIVE" || row.user.activationPending ||
      (row.user.agencyId && row.agencyStatus !== "ACTIVE") ||
      (options.expectedCredentialVersion !== undefined && row.user.credentialVersion !== options.expectedCredentialVersion)) {
      throw new AppError("INVALID_CREDENTIALS", "Invalid email or password.");
    }
    if (options.passwordLoginKey && row.user.agencyId && isAgencyRole(row.user.role)) {
      await lockPasswordLogin(tx, options.passwordLoginKey);
      await assertPasswordLoginAllowed(tx, options.passwordLoginKey);
    }
    const expiresAt = new Date(Date.now() + sessionPolicy(row.user.agencyId).absoluteMs);
    await tx.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt,
      lastActivityAt: new Date(), credentialVersion: row.user.credentialVersion, ipAddress, userAgent });
    if (options.auditLogin) {
      const passwordOnlyPreview = !mfaEnforcementEnabled();
      await recordIdentityAudit(tx, { actor: { id: row.user.id, email: row.user.email,
        username: row.user.username, name: row.user.name, role: row.user.role as Role,
        agencyId: row.user.agencyId, userStatus: row.user.status, agencyStatus: row.agencyStatus,
        agencyName: null }, action: row.user.agencyId || passwordOnlyPreview ? "USER_LOGIN" : "STAFF_PASSWORD_VERIFIED", entity: "user", entityId: userId,
        agencyId: row.user.agencyId, ipAddress,
        ...(!row.user.agencyId && passwordOnlyPreview ? { metadata: { authentication: "password", mfaEnforcement: "preview-paused" } } : {}) });
      if (row.user.agencyId || passwordOnlyPreview) {
        await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id,userId));
      }
    }
    if (options.passwordLoginKey && row.user.agencyId && isAgencyRole(row.user.role)) {
      await clearPasswordFailures(tx, options.passwordLoginKey);
    }
    return expiresAt;
  });
  return { token, expiresAt };
}

/** Resolve the current authenticated user, or null. Verifies session + user + agency state. */
export async function getSessionUser(options: { allowMfaPending?: boolean } = {}): Promise<AuthUser | null> {
  let token: string | undefined;
  try {
    token = await readSessionToken();
  } catch {
    return null;
  }
  if (!token) return null;
  const tokenHash = hashToken(token);
  try {
    const rows = await db
      .select({
        user: users,
        agencyStatus: agencies.status,
        agencyName: agencies.legalName,
        mfaVerifiedAt: sessions.mfaVerifiedAt,
        sessionCreatedAt: sessions.createdAt,
        sessionId: sessions.id,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .leftJoin(agencies, eq(users.agencyId, agencies.id))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date()),
        eq(sessions.credentialVersion, users.credentialVersion),
        sql`${sessions.lastActivityAt} > now() - CASE WHEN ${users.agencyId} IS NULL THEN ${SESSION_POLICIES.staff.idleMs} * interval '1 millisecond' ELSE ${SESSION_POLICIES.agency.idleMs} * interval '1 millisecond' END`))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.user.status !== "ACTIVE" || row.user.activationPending) return null;
    if (row.user.agencyId && row.agencyStatus !== "ACTIVE") return null;
    const mfaPending = !row.user.agencyId && ["SUPER_ADMIN", "ADMIN", "VISA_AGENT", "ACCOUNTING"].includes(row.user.role) && !row.mfaVerifiedAt;
    // Preserve real verification state so resuming MFA challenges these sessions.
    if (mfaPending && mfaEnforcementEnabled() && (!options.allowMfaPending || Date.now() - row.sessionCreatedAt.getTime() > 10 * 60_000)) return null;
    const profile=row.user.agencyId?null:await readStaffProfile(db,row.user.id);
    return {
      id: row.user.id,
      email: row.user.email,
      username: profile?.username??row.user.username,
      name: row.user.name,
      role: row.user.role as Role,
      agencyId: row.user.agencyId,
      userStatus: row.user.status,
      agencyStatus: row.agencyStatus,
      agencyName: row.agencyName,
      mustChangePassword: row.user.mustChangePassword,
      credentialVersion: row.user.credentialVersion,
      mfaPending,
      sessionId: row.sessionId,
      staffPermissions: profile?.staffPermissions??null,
    };
  } catch (err) {
    // Database temporarily unavailable (e.g. missing migrations on Preview) must not become a 500.
    console.error("[auth] getSessionUser failed", safeErrorCode(err) ?? "unknown");
    return null;
  }
}

/** Require an authenticated user or throw a user-safe error. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  // Phase 2.2 §11 — server-authoritative: no server action while a forced
  // password change is pending (the change-password action uses
  // requirePasswordChangeSession(), which deliberately bypasses this guard).
  if (user.mustChangePassword) {
    throw new AppError("PASSWORD_CHANGE_REQUIRED", "You must set a new password before continuing.");
  }
  return user;
}

/** Session for the password-change screen ONLY — bypasses the §11 lock. */
export async function requirePasswordChangeSession(): Promise<AuthUser> {
  const user = await getSessionUser({ allowMfaPending: true });
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
  if (!isAgencyRole(user.role) || !user.agencyId) {
    throw new AppError("FORBIDDEN", "This area is only available to agency users.");
  }
  return user as AuthUser & { agencyId: string };
}

/** Set the session cookie (must be called in a server action / route handler). */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  const name = preferredSessionCookieName();
  jar.set(name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  if (name !== SESSION_COOKIE) jar.delete(SESSION_COOKIE);
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  const preferred = preferredSessionCookieName();
  jar.delete(preferred);
  if (preferred !== SESSION_COOKIE) jar.delete(SESSION_COOKIE);
}

/** Destroy the current session server-side. */
export async function destroySession(): Promise<void> {
  const token = await readSessionToken();
  if (token) {
    try {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    } finally { await clearSessionCookie(); }
    return;
  }
  await clearSessionCookie();
}

class PasswordMismatch extends AppError {
  constructor(readonly agencyAccount: boolean = false) {
    super("INVALID_CREDENTIALS", "Invalid email or password.");
  }
}

/** Only a classified password mismatch contributes to the counter. */
export async function signInWithPassword(identifier: string, password: string) {
  const key = passwordLoginKey(identifier);
  let user: User;
  try {
    user = await authenticate(identifier, password);
  } catch (error) {
    if (error instanceof PasswordMismatch) {
      await recordPasswordFailure(error.agencyAccount ? key : key + ":unverified");
    }
    throw error;
  }
  const session = await createSession(user.id, {
    expectedCredentialVersion: user.credentialVersion, auditLogin: true,
    ...(user.agencyId && isAgencyRole(user.role) ? { passwordLoginKey: key } : {}),
  });
  return { user, ...session };
}

/** Registered account email only. Ambiguous active identities always fail closed. */
export async function authenticate(identifier: string, password: string): Promise<User> {
  if (password.length === 0 || password.length > 200) {
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password.");
  }
  const { verifyPassword } = await import("@/lib/crypto");
  let user: User | undefined;
  let agencyStatus: string | null | undefined;
  try {
    const normalized = normalizedLoginEmail(identifier);
    const rows = await db
      .select({ user: users, agencyStatus: agencies.status })
      .from(users)
      .leftJoin(agencies, eq(users.agencyId, agencies.id))
      .where(and(sql`lower(btrim(${users.email})) = ${normalized}`, eq(users.status,"ACTIVE")))
      .limit(2);
    user = rows.length === 1 ? rows[0]!.user as User : undefined;
    agencyStatus = rows.length === 1 ? rows[0]!.agencyStatus : undefined;
  } catch (err) {
    // Hide raw database errors (e.g. missing table / connection failure) from the user.
    console.error("[auth] authenticate query failed", safeErrorCode(err) ?? "unknown");
    throw new AppError("SERVICE_UNAVAILABLE", "Service temporarily unavailable. Please try again.");
  }
  const usableHash = Boolean(user && /^scrypt\$[0-9a-fA-F]{32}\$[0-9a-fA-F]{128}$/.test(user.passwordHash));
  // One full scrypt for every well-sized credential, even a locked account,
  // unknown identity or unusable stored hash. No pre-password lock lookup.
  const hash = usableHash ? user!.passwordHash : `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;
  const passwordMatches = await verifyPassword(password, hash);
  const eligible = Boolean(user && usableHash && user.status === "ACTIVE" &&
    !user.activationPending && (!user.agencyId || agencyStatus === "ACTIVE"));
  if (!passwordMatches || !eligible) {
    throw new PasswordMismatch(Boolean(eligible && user!.agencyId && isAgencyRole(user!.role)));
  }
  return user!;
}

/** Only explicit human interaction calls this; reads and background polls never extend idle time. */
export async function touchCurrentSession(): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  const token = await readSessionToken();
  if (!token) return false;
  const updated = await db.update(sessions).set({ lastActivityAt: new Date() })
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()),
      sql`${sessions.lastActivityAt} > now() - ${sessionPolicy(user.agencyId).idleMs} * interval '1 millisecond'`))
    .returning({ id: sessions.id });
  return updated.length === 1;
}
