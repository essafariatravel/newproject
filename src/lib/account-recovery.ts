import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountAccessTokens, accountRecoveryRequests, agencies, users } from "@/db/schema";
import { generateSessionToken, hashPassword, hashToken } from "@/lib/crypto";
import { AppError, type AuthUser, type Role } from "@/lib/types";
import { assertAccountManager, normalizeAgencyUsername } from "@/lib/identity-policy";
import { currentAccountActor, lockIdentityState, recordIdentityAudit, requireRecoveryManager, revokeUnusedAccessTokens, revokeUserAccess } from "@/lib/account-security";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";

export const RECOVERY_ACKNOWLEDGEMENT = "If this account is eligible, your access request will be reviewed. Contact your account manager if you need help.";
export const RESET_TOKEN_TTL_HOURS = 2;
export const ACCESS_ACTIVATION_TTL_HOURS = 24;
const tokenShape = /^[A-Za-z0-9_-]{20,90}$/;

/** Same public acknowledgement for unknown, suspended, duplicate and rate-limited identities. */
export async function requestAccountRecovery(identifier: string, ipAddress: string | null = null): Promise<string> {
  const raw = identifier.trim().slice(0, 254).toLowerCase();
  try {
    const ipAllowed = await consumeAuthRateLimit("recovery-ip", ipAddress ?? "unknown", 20, 60 * 60_000);
    const identifierAllowed = await consumeAuthRateLimit("recovery-identity", raw, 3, 60 * 60_000);
    if (!ipAllowed || !identifierAllowed || !raw) return RECOVERY_ACKNOWLEDGEMENT;
    let normalized = raw;
    if (!raw.includes("@")) {
      try { normalized = normalizeAgencyUsername(raw); } catch { return RECOVERY_ACKNOWLEDGEMENT; }
    }
    await db.transaction(async (tx) => {
      await lockIdentityState(tx);
      const [duplicate] = await tx.select({ id: accountRecoveryRequests.id }).from(accountRecoveryRequests)
        .where(and(eq(accountRecoveryRequests.identifier, normalized), eq(accountRecoveryRequests.status, "PENDING"))).limit(1);
      if (duplicate) return;
      const [user] = await tx.select({ id: users.id }).from(users).where(raw.includes("@") ?
        and(isNull(users.agencyId), sql`lower(btrim(${users.email}))=${normalized}`) : eq(users.username, normalized)).limit(1);
      await tx.insert(accountRecoveryRequests).values({ identifier: normalized, userId: user?.id ?? null });
    });
  } catch (err) {
    console.error("[recovery] request could not be queued", err instanceof Error ? err.name : "unknown");
  }
  return RECOVERY_ACKNOWLEDGEMENT;
}

export async function issueAccessToken(actor: AuthUser, userId: string, purpose: "ACTIVATION" | "PASSWORD_RESET" = "PASSWORD_RESET", requestId?: string) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + (purpose === "ACTIVATION" ? ACCESS_ACTIVATION_TTL_HOURS : RESET_TOKEN_TTL_HOURS) * 60 * 60_000);
  const user = await db.transaction(async (tx) => {
    await lockIdentityState(tx);
    const current = requestId ? await requireRecoveryManager(actor, tx) : await currentAccountActor(tx, actor);
    const [row] = await tx.select({ user: users, agencyStatus: agencies.status }).from(users)
      .leftJoin(agencies, eq(users.agencyId, agencies.id)).where(eq(users.id, userId)).limit(1);
    if (!row) throw new AppError("NOT_FOUND", "User not found.");
    assertAccountManager(current, row.user);
    if (row.user.status !== "ACTIVE" || (row.user.agencyId && row.agencyStatus !== "ACTIVE")) throw new AppError("VALIDATION", "Reactivate this account and agency before issuing access.");
    if (requestId) {
      const [request] = await tx.select().from(accountRecoveryRequests).where(eq(accountRecoveryRequests.id, requestId)).limit(1);
      if (!request || request.status !== "PENDING" || request.userId !== userId) throw new AppError("VALIDATION", "This recovery request is no longer actionable.");
      await tx.update(accountRecoveryRequests).set({ status: "LINK_ISSUED", resolvedBy: current.id, resolvedAt: new Date() }).where(eq(accountRecoveryRequests.id, requestId));
    }
    await revokeUnusedAccessTokens(tx, userId);
    await tx.insert(accountAccessTokens).values({ userId, tokenHash: hashToken(token), purpose, credentialVersion: row.user.credentialVersion, expiresAt, createdBy: current.id });
    await recordIdentityAudit(tx, { actor: current, action: purpose === "ACTIVATION" ? "ACTIVATION_LINK_CREATED" : "PASSWORD_RESET_LINK_CREATED", entity: "user", entityId: userId,
      agencyId: row.user.agencyId, metadata: { purpose, expiresAt: expiresAt.toISOString(), recoveryRequestId: requestId } });
    return row.user;
  });
  return { token, expiresAt, username: user.username, email: user.agencyId ? null : user.email, name: user.name };
}

export async function resolveAccessToken(token: string) {
  if (!tokenShape.test(token)) return null;
  const [row] = await db.select({ token: accountAccessTokens, user: users, agencyStatus: agencies.status }).from(accountAccessTokens)
    .innerJoin(users, eq(users.id, accountAccessTokens.userId)).leftJoin(agencies, eq(users.agencyId, agencies.id))
    .where(and(eq(accountAccessTokens.tokenHash, hashToken(token)), isNull(accountAccessTokens.usedAt), gt(accountAccessTokens.expiresAt, new Date()),
      eq(accountAccessTokens.credentialVersion, users.credentialVersion))).limit(1);
  if (!row || row.user.status !== "ACTIVE" || (row.user.agencyId && row.agencyStatus !== "ACTIVE")) return null;
  return { name: row.user.name, username: row.user.username, email: row.user.agencyId ? null : row.user.email, expiresAt: row.token.expiresAt };
}

/** Password replacement, token consumption and every revocation share one transaction. */
export async function resetAccountFromToken(token: string, password: string): Promise<void> {
  if (!tokenShape.test(token)) throw new AppError("INVALID_TOKEN", "This access link is invalid or has expired.");
  if (password.length < 10 || password.length > 200 || !/[a-z]/i.test(password) || !/\d/.test(password)) throw new AppError("VALIDATION", "Use at least 10 characters with letters and digits.");
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await lockIdentityState(tx);
    const [row] = await tx.select({ token: accountAccessTokens, user: users, agencyStatus: agencies.status }).from(accountAccessTokens)
      .innerJoin(users, eq(users.id, accountAccessTokens.userId)).leftJoin(agencies, eq(users.agencyId, agencies.id))
      .where(and(eq(accountAccessTokens.tokenHash, hashToken(token)), isNull(accountAccessTokens.usedAt), gt(accountAccessTokens.expiresAt, new Date()),
        eq(accountAccessTokens.credentialVersion, users.credentialVersion))).limit(1);
    if (!row || !["ACTIVATION", "PASSWORD_RESET"].includes(row.token.purpose) || row.user.status !== "ACTIVE" ||
      (row.user.agencyId && row.agencyStatus !== "ACTIVE")) throw new AppError("INVALID_TOKEN", "This access link is invalid or has expired.");
    await tx.update(accountAccessTokens).set({ usedAt: new Date() }).where(eq(accountAccessTokens.id, row.token.id));
    await tx.update(users).set({ passwordHash, activationPending: false, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, row.user.id));
    await revokeUserAccess(tx, row.user.id);
    await recordIdentityAudit(tx, { actor: { id: row.user.id, email: row.user.email, username: row.user.username, name: row.user.name, role: row.user.role as Role,
      agencyId: row.user.agencyId, userStatus: row.user.status, agencyStatus: row.agencyStatus, agencyName: null }, action: "PASSWORD_RESET", entity: "user", entityId: row.user.id,
      agencyId: row.user.agencyId, metadata: { method: "single_use_access_link" } });
  });
}

export async function listRecoveryQueue(actor: AuthUser) {
  return db.transaction(async (tx) => {
    await requireRecoveryManager(actor, tx);
    return tx.select({ request: accountRecoveryRequests, name: users.name, username: users.username, email: users.email, userStatus: users.status,
      agencyId: users.agencyId, agencyName: agencies.legalName, agencyStatus: agencies.status }).from(accountRecoveryRequests)
      .leftJoin(users, eq(accountRecoveryRequests.userId, users.id)).leftJoin(agencies, eq(users.agencyId, agencies.id))
      .where(eq(accountRecoveryRequests.status, "PENDING")).orderBy(desc(accountRecoveryRequests.createdAt)).limit(100);
  });
}

export async function closeRecoveryRequest(actor: AuthUser, requestId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockIdentityState(tx);
    const current = await requireRecoveryManager(actor, tx);
    const changed = await tx.update(accountRecoveryRequests).set({ status: "CLOSED", resolvedAt: new Date(), resolvedBy: current.id })
      .where(and(eq(accountRecoveryRequests.id, requestId), eq(accountRecoveryRequests.status, "PENDING"))).returning({ id: accountRecoveryRequests.id });
    if (changed.length) await recordIdentityAudit(tx, { actor: current, action: "RECOVERY_REQUEST_CLOSED", entity: "recovery_request", entityId: requestId });
  });
}
