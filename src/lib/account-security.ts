import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { agencies, accountAccessTokens, accountActivationTokens, auditLogs, sessions, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { AppError, isAgencyRole, isStaffRole, type AuthUser, type Role, type StaffPermissions } from "@/lib/types";
import { businessNameSchema, staffUsernameSchema } from '@/lib/business-fields';
import { assertSafePassword } from '@/lib/password-policy';
import { readStaffProfile, saveStaffProfile } from '@/lib/staff-profile';
import { assertAccountManager, assertAccountRole, legacyAgencyUsername, normalizeAgencyUsername } from "@/lib/identity-policy";
import type { recordAudit } from "@/lib/audit";

export type IdentityTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Sensitive changes fail closed if their audit cannot share the commit. */
export async function recordIdentityAudit(tx: IdentityTransaction, input: Parameters<typeof recordAudit>[0]): Promise<void> {
  await tx.insert(auditLogs).values({ actorId: input.actor?.id ?? null, actorEmail: input.actor?.email ?? null,
    actorRole: input.actor?.role ?? null, agencyId: input.agencyId ?? input.actor?.agencyId ?? null,
    action: input.action, entity: input.entity, entityId: input.entityId ?? null,
    metadata: input.actor ? { ...input.metadata, actorName: input.actor.name, actorUsername: input.actor.username } : input.metadata ?? null, ipAddress: input.ipAddress ?? null });
}

/** Identity readers overlap; credential/session mutations retain exclusivity. */
export async function lockIdentityState(tx: IdentityTransaction,mode:'write'|'read'='write'): Promise<void> {
  if(mode==='read')await tx.execute(sql`select pg_advisory_xact_lock_shared(1163087699)`);
  else await tx.execute(sql`select pg_advisory_xact_lock(1163087699)`);
}

export async function currentAccountActor(tx: IdentityTransaction, actor: AuthUser): Promise<AuthUser> {
  const [row] = await tx.select({ user: users, agencyStatus: agencies.status })
    .from(users).leftJoin(agencies, eq(users.agencyId, agencies.id)).where(eq(users.id, actor.id)).limit(1);
  if (!row || row.user.status !== "ACTIVE" || row.user.activationPending || row.user.mustChangePassword ||
      (row.user.agencyId && row.agencyStatus !== "ACTIVE") || row.user.role !== actor.role || row.user.agencyId !== actor.agencyId ||
      (actor.credentialVersion !== undefined && row.user.credentialVersion !== actor.credentialVersion)) {
    throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  }
  const profile=row.user.agencyId?null:await readStaffProfile(tx,row.user.id);
  return { ...actor, name: row.user.name, email: row.user.email, username: profile?.username??row.user.username, role: row.user.role as Role,
    agencyId: row.user.agencyId, userStatus: row.user.status, agencyStatus: row.agencyStatus,
    credentialVersion: row.user.credentialVersion, staffPermissions: profile?.staffPermissions??null };
}

/** Must run in the same transaction as the state/credential mutation. */
export async function revokeUnusedAccessTokens(tx: IdentityTransaction, userId: string): Promise<void> {
  await tx.delete(accountAccessTokens).where(and(eq(accountAccessTokens.userId, userId), isNull(accountAccessTokens.usedAt)));
  await tx.delete(accountActivationTokens).where(and(eq(accountActivationTokens.userId, userId), isNull(accountActivationTokens.usedAt)));
}

/** Must run in the same transaction as the state/credential mutation. */
export async function revokeUserAccess(tx: IdentityTransaction, userId: string): Promise<number> {
  const [changed] = await tx.update(users).set({ credentialVersion: sql`${users.credentialVersion} + 1` })
    .where(eq(users.id, userId)).returning({ version: users.credentialVersion });
  await tx.delete(sessions).where(eq(sessions.userId, userId));
  await revokeUnusedAccessTokens(tx, userId);
  return changed?.version ?? 0;
}

export async function createAccount(actor: AuthUser, input: {
  name: string; role: Role; agencyId: string | null; email?: string; username?: string; password: string;
  staffPermissions?: StaffPermissions;
}) {
  assertSafePassword(input.password);
  const passwordHash = await hashPassword(input.password);
  const created = await db.transaction(async (tx) => {
    await lockIdentityState(tx);
    const current = await currentAccountActor(tx, actor);
    assertAccountRole(current, input.agencyId, input.role);
    if(input.role==='SUPER_ADMIN')throw new AppError('FORBIDDEN','Creating another owner account is not permitted.');
    if(input.staffPermissions!==undefined && (current.role!=='SUPER_ADMIN'||input.agencyId))throw new AppError('FORBIDDEN','Only the owner can select Staff permissions.');
    if(input.staffPermissions!==undefined && (typeof input.staffPermissions.catalogManage!=='boolean'||typeof input.staffPermissions.staffManage!=='boolean'))throw new AppError('VALIDATION','Choose valid Staff permissions.');
    if (current.role === "AGENCY_ADMIN" && input.agencyId !== current.agencyId) throw new AppError("FORBIDDEN", "You cannot manage another agency.");
    let email = input.email?.trim().toLowerCase() ?? "";
    let username: string | null = null;
    if (input.agencyId) {
      const [agency] = await tx.select().from(agencies).where(eq(agencies.id, input.agencyId)).limit(1);
      if (!agency || agency.status !== "ACTIVE") throw new AppError("NOT_FOUND", "Active agency not found.");
      const [existing] = await tx.select({id:users.id}).from(users).where(eq(users.agencyId,input.agencyId)).limit(1);
      if (existing) throw new AppError("AGENCY_ACCOUNT_EXISTS", "This agency already has an account. Manage its existing access.");
      email = input.email?.trim().toLowerCase() || agency.email.trim().toLowerCase();
      username = input.username ? normalizeAgencyUsername(input.username) : legacyAgencyUsername(randomUUID());
      const [duplicate] = await tx.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
      if (duplicate) throw new AppError("DUPLICATE", "This username is unavailable.");
    } else {
      username=input.username?.trim()?staffUsernameSchema.parse(input.username):null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("VALIDATION", "Enter a valid professional email.");
      const [duplicate] = await tx.select({ id: users.id }).from(users)
        .where(and(isNull(users.agencyId), sql`lower(btrim(${users.email}))=${email}`)).limit(1);
      if (duplicate) throw new AppError("DUPLICATE", "A staff account already uses this email.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AppError("VALIDATION", "Enter a valid professional email.");
    const [emailOwner] = await tx.select({id:users.id}).from(users).where(and(eq(users.status,"ACTIVE"),sql`lower(btrim(${users.email}))=${email}`)).limit(1);
    if (emailOwner) throw new AppError("DUPLICATE", "An active account already uses this email.");
    const permissions=input.agencyId?null:input.staffPermissions??(current.role==='SUPER_ADMIN'?null:{catalogManage:current.staffPermissions?.catalogManage??true,staffManage:false});
    const created = (await tx.insert(users).values({ name: businessNameSchema.parse(input.name), email, username:input.agencyId?username:null, role: input.role,
      agencyId: input.agencyId, passwordHash, mustChangePassword: true }).returning())[0]!;
    if(!created.agencyId)await saveStaffProfile(tx,created.id,{username,staffPermissions:permissions},current.id);
    await recordIdentityAudit(tx, { actor: current, action: "USER_CREATED", entity: "user", entityId: created.id, agencyId: created.agencyId,
      metadata: { username, email: created.agencyId ? undefined : created.email, role: created.role, forcedPasswordChange: true,staffPermissions:permissions } });
    return {...created,username,staffPermissions:permissions};
  });
  return created;
}

export async function updateAccount(actor: AuthUser, userId: string, input: {
  name?: string; role?: Role; password?: string; toggleStatus?: boolean; forceSignOut?: boolean;
  email?: string; username?: string; staffPermissions?: StaffPermissions;
}) {
  if(input.password)assertSafePassword(input.password);
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  const result = await db.transaction(async (tx) => {
    await lockIdentityState(tx);
    const current = await currentAccountActor(tx, actor);
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).for("update").limit(1);
    if (!target) throw new AppError("NOT_FOUND", "User not found.");
    const profile=target.agencyId?{username:null,staffPermissions:null}:await readStaffProfile(tx,target.id);
    const previousProfile={...profile};
    assertAccountManager(current, {...target,staffPermissions:profile.staffPermissions});
    if(input.role==='SUPER_ADMIN'&&target.role!=='SUPER_ADMIN')throw new AppError('FORBIDDEN','Owner privileges cannot be delegated.');
    if(input.staffPermissions!==undefined && (current.role!=='SUPER_ADMIN'||target.agencyId))throw new AppError('FORBIDDEN','Only the owner can select Staff permissions.');
    if(input.staffPermissions!==undefined && (typeof input.staffPermissions.catalogManage!=='boolean'||typeof input.staffPermissions.staffManage!=='boolean'))throw new AppError('VALIDATION','Choose valid Staff permissions.');
    if (input.role) assertAccountRole(current, target.agencyId, input.role);
    const nextStatus = input.toggleStatus ? (target.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE") : target.status;
    if (target.status !== "ACTIVE" && nextStatus === "ACTIVE") {
      if (target.agencyId) {
        const [agency]=await tx.select({status:agencies.status}).from(agencies).where(eq(agencies.id,target.agencyId));
        if(agency?.status==='CLOSED')throw new AppError('INVALID_STATE','A closed agency account cannot be reactivated.');
        const [active] = await tx.select({id:users.id}).from(users).where(and(eq(users.agencyId,target.agencyId),eq(users.status,"ACTIVE"),ne(users.id,target.id))).limit(1);
        if (active) throw new AppError("AGENCY_ACCOUNT_EXISTS", "This agency already has an active account.");
      }
      const [emailOwner] = await tx.select({id:users.id}).from(users).where(and(eq(users.status,"ACTIVE"),ne(users.id,target.id),sql`lower(btrim(${users.email}))=lower(btrim(${target.email}))`)).limit(1);
      if (emailOwner) throw new AppError("DUPLICATE", "An active account already uses this email.");
    }
    if (target.id === current.id && (input.toggleStatus || (input.role && input.role !== target.role))) {
      throw new AppError("VALIDATION", "You cannot suspend yourself or change your own role.");
    }
    if (target.role === "SUPER_ADMIN" && target.status === "ACTIVE" && (nextStatus !== "ACTIVE" || (input.role && input.role !== "SUPER_ADMIN"))) {
      const active = await tx.select({ id: users.id }).from(users).where(and(eq(users.role, "SUPER_ADMIN"), eq(users.status, "ACTIVE")));
      if (active.length <= 1) throw new AppError("VALIDATION", "Keep at least one active SUPER_ADMIN.");
    }
    const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date(), status: nextStatus };
    if (input.name !== undefined) patch.name = businessNameSchema.parse(input.name);
    if(input.email!==undefined || input.username!==undefined){
      if(target.agencyId)throw new AppError('FORBIDDEN','Agency login identities are managed separately.');
      if(input.email!==undefined){
        const email=input.email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new AppError('VALIDATION','Enter a valid professional email.');
        const [taken]=await tx.select({id:users.id}).from(users).where(and(ne(users.id,userId),sql`lower(btrim(${users.email}))=${email}`,sql`(${users.agencyId} is null or ${users.status}='ACTIVE')`)).limit(1);if(taken)throw new AppError('DUPLICATE','This login email is already in use.');patch.email=email;
      }
      if(input.username!==undefined){const username=input.username.trim()?staffUsernameSchema.parse(input.username):null;
        profile.username=username;
      }
    }
    if(input.staffPermissions!==undefined)profile.staffPermissions={catalogManage:input.staffPermissions.catalogManage,staffManage:input.staffPermissions.staffManage};
    if (input.role) patch.role = input.role;
    if (passwordHash) Object.assign(patch, { passwordHash, mustChangePassword: true, activationPending: false });
    await tx.update(users).set(patch).where(eq(users.id, userId));
    if(input.username!==undefined||input.staffPermissions!==undefined)await saveStaffProfile(tx,target.id,profile,current.id);
    if (input.toggleStatus || input.forceSignOut || passwordHash || (input.role && input.role !== target.role) || (patch.email!==undefined&&patch.email!==target.email) || (input.staffPermissions!==undefined&&JSON.stringify(input.staffPermissions)!==JSON.stringify(previousProfile.staffPermissions))) await revokeUserAccess(tx, userId);
    await recordIdentityAudit(tx, { actor: current, action: input.toggleStatus ? (nextStatus === "ACTIVE" ? "USER_ACTIVATED" : "USER_SUSPENDED") : input.forceSignOut ? "USER_SESSIONS_REVOKED" : "USER_UPDATED",
      entity: "user", entityId: userId, agencyId: target.agencyId,
      metadata: { oldRole: target.role, role: input.role ?? target.role, passwordReset: Boolean(passwordHash),oldValues:{name:target.name,email:target.email,username:previousProfile.username,staffPermissions:previousProfile.staffPermissions},newValues:{name:patch.name??target.name,email:patch.email??target.email,username:profile.username,staffPermissions:profile.staffPermissions} } });
    return { target, nextStatus };
  });
  return result;
}

export async function toggleAgencyAccess(actor: AuthUser, agencyId: string) {
  const next = await db.transaction(async (tx) => {
    await lockIdentityState(tx);
    const current = await currentAccountActor(tx, actor);
    if (!isStaffRole(current.role) || current.agencyId) throw new AppError("FORBIDDEN", "Only staff can change agency access.");
    const [agency] = await tx.select().from(agencies).where(eq(agencies.id, agencyId)).for("update").limit(1);
    if (!agency) throw new AppError("NOT_FOUND", "Agency not found.");
    if(agency.status==='CLOSED')throw new AppError('INVALID_STATE','A closed agency cannot be reactivated. Submit a new partnership request.');
    const next = agency.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    await tx.update(agencies).set({ status: next, updatedAt: new Date() }).where(eq(agencies.id, agencyId));
    const members = await tx.select({ id: users.id }).from(users).where(eq(users.agencyId, agencyId));
    for (const member of members) await revokeUserAccess(tx, member.id);
    await recordIdentityAudit(tx, { actor: current, action: next === "ACTIVE" ? "AGENCY_ACTIVATED" : "AGENCY_SUSPENDED", entity: "agency", entityId: agencyId, agencyId });
    return next;
  });
  return next;
}

export async function changeAccountPassword(actor: AuthUser, currentPassword: string, newPassword: string): Promise<number> {
  assertSafePassword(newPassword);
  if (newPassword === currentPassword) throw new AppError("VALIDATION", "Choose a different password.");
  const passwordHash = await hashPassword(newPassword);
  const version = await db.transaction(async (tx) => {
    await lockIdentityState(tx);
    const [target] = await tx.select({ user: users, agencyStatus: agencies.status }).from(users)
      .leftJoin(agencies, eq(users.agencyId, agencies.id)).where(eq(users.id, actor.id)).limit(1);
    if (!target || target.user.status !== "ACTIVE" || target.user.activationPending ||
      target.user.role !== actor.role || target.user.agencyId !== actor.agencyId ||
      (actor.credentialVersion !== undefined && target.user.credentialVersion !== actor.credentialVersion) ||
      (isAgencyRole(target.user.role) && target.agencyStatus !== "ACTIVE") || !await verifyPassword(currentPassword, target.user.passwordHash)) {
      throw new AppError("UNAUTHENTICATED", "Current password is incorrect.");
    }
    await tx.update(users).set({ passwordHash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, actor.id));
    const version = await revokeUserAccess(tx, actor.id);
    await recordIdentityAudit(tx, { actor: { ...actor, email: target.user.email, name: target.user.name, username: target.user.username,
      role: target.user.role as Role, agencyId: target.user.agencyId }, action: "PASSWORD_CHANGED", entity: "user", entityId: actor.id, agencyId: target.user.agencyId,
      metadata: { forced: Boolean(target.user.mustChangePassword) } });
    return version;
  });
  return version;
}

export async function requireRecoveryManager(actor: AuthUser, tx: IdentityTransaction): Promise<AuthUser> {
  const current = await currentAccountActor(tx, actor);
  if (current.role !== "SUPER_ADMIN" || current.agencyId) throw new AppError("FORBIDDEN", "Only SUPER_ADMIN can manage the recovery queue.");
  return current;
}
