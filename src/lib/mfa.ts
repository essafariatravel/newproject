import { and, eq, gt, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { generateSecret, generateURI } from "otplib";
import { db } from "@/lib/db";
import { sessions, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { currentAccountActor, lockIdentityState, recordIdentityAudit, revokeUserAccess } from "@/lib/account-security";
import { generateSessionToken, hashToken, verifyPassword } from "@/lib/crypto";
import { sessionPolicy } from "./identity-policy";
import type { IdentityTransaction } from "./account-security";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { qualifiedTable } from "@/lib/database-schema";
import { AppError, type AuthUser } from "@/lib/types";
import { decryptMfaSecret, encryptMfaSecret, verifyMfaCode } from "./mfa-crypto";

const table = () => sql.raw(qualifiedTable("mfa_credentials"));
type Credential = { encrypted_secret: string; confirmed_at: Date | null; enrollment_expires_at: Date; last_epoch: string | null; recovery_hashes: string[] };
const denied = () => new AppError("INVALID_CREDENTIALS", "Verification failed. Please try again.");

export async function requireMfaSession(): Promise<AuthUser> {
  const actor = await getSessionUser({ allowMfaPending: true });
  if (!actor || actor.agencyId || actor.mustChangePassword) throw denied();
  return actor;
}

export async function mfaEnrolled(userId: string): Promise<boolean> {
  const result = await db.execute(sql`select confirmed_at from ${table()} where user_id=${userId}`);
  return Boolean(result.rows[0]?.confirmed_at);
}

async function limit(actor: AuthUser): Promise<void> {
  if (!await consumeAuthRateLimit("mfa", actor.id, 10, 15 * 60_000)) throw denied();
}

async function currentMfaActor(tx: IdentityTransaction, actor: AuthUser) {
  const current=await currentAccountActor(tx,actor);
  const [session]=await tx.select().from(sessions).where(and(eq(sessions.id,actor.sessionId??"00000000-0000-0000-0000-000000000000"),eq(sessions.userId,current.id),eq(sessions.credentialVersion,current.credentialVersion!),gt(sessions.expiresAt,new Date()),sql`${sessions.lastActivityAt}>now()-interval '30 minutes'`)).limit(1);
  if(!session||(!session.mfaVerifiedAt&&Date.now()-session.createdAt.getTime()>10*60_000))throw denied();
  return {...current,mfaPending:!session.mfaVerifiedAt,sessionIpAddress:session.ipAddress,sessionUserAgent:session.userAgent};
}

/** A verified SUPER_ADMIN authorizes enrollment after an independent identity check. */
export async function authorizeMfaEnrollment(actor:AuthUser,targetId:string) {
  const code=randomBytes(16).toString("hex");
  await db.transaction(async tx=>{
    await lockIdentityState(tx);
    const current=await currentMfaActor(tx,actor);
    if(current.role!=="SUPER_ADMIN"||current.mfaPending||current.agencyId)throw denied();
    const [target]=await tx.select().from(users).where(eq(users.id,targetId)).limit(1);
    const credential=await tx.execute(sql`select confirmed_at from ${table()} where user_id=${targetId}`);
    if(!target||target.agencyId||target.status!=="ACTIVE"||credential.rows[0]?.confirmed_at)throw denied();
    await tx.execute(sql`insert into ${sql.raw(qualifiedTable("mfa_enrollment_authorizations"))}(user_id,code_hash,expires_at,issued_by) values(${targetId},${hashToken(code)},now()+interval '30 minutes',${current.id}) on conflict(user_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at,issued_by=excluded.issued_by`);
    await recordIdentityAudit(tx,{actor:current,action:"MFA_ENROLLMENT_AUTHORIZED",entity:"user",entityId:targetId});
  });
  return code;
}

export async function beginMfaEnrollment(password: string,authorizationCode:string) {
  const actor = await requireMfaSession();
  await limit(actor);
  const secret = generateSecret();
  const encrypted = encryptMfaSecret(secret, actor.id);
  await db.transaction(async tx => {
    await lockIdentityState(tx);
    await currentMfaActor(tx, actor);
    const [user] = await tx.select().from(users).where(eq(users.id, actor.id)).limit(1);
    if (!user || !await verifyPassword(password, user.passwordHash)) throw denied();
    const existing = await tx.execute(sql`select confirmed_at from ${table()} where user_id=${actor.id} for update`);
    if (existing.rows[0]?.confirmed_at) throw new AppError("VALIDATION", "MFA is already enrolled.");
    if(!/^[a-f0-9]{32}$/.test(authorizationCode))throw denied();
    const authorization=await tx.execute(sql`delete from ${sql.raw(qualifiedTable("mfa_enrollment_authorizations"))} where user_id=${actor.id} and code_hash=${hashToken(authorizationCode)} and expires_at>now() returning user_id`);
    if(!authorization.rows.length)throw denied();
    await tx.execute(sql`insert into ${table()} (user_id,encrypted_secret,enrollment_expires_at)
      values (${actor.id},${encrypted},now()+interval '10 minutes')
      on conflict(user_id) do update set encrypted_secret=excluded.encrypted_secret,enrollment_expires_at=excluded.enrollment_expires_at`);
    await recordIdentityAudit(tx, {actor,action:"MFA_ENROLLMENT_STARTED",entity:"user",entityId:actor.id});
  });
  return {secret, uri: generateURI({issuer:"ESSAFARIA VISA OS",label:actor.email,secret})};
}

/** Row lock + identity lock make OTP and recovery-code consumption single-use. */
export async function completeMfa(code: string, enrollment = false) {
  const actor = await requireMfaSession();
  await limit(actor);
  const recoveryCodes = enrollment ? Array.from({length:10}, () => randomBytes(16).toString("hex")) : [];
  const token=generateSessionToken();
  const session = await db.transaction(async tx => {
    await lockIdentityState(tx);
    const current=await currentMfaActor(tx, actor);
    const result = await tx.execute(sql`select * from ${table()} where user_id=${actor.id} for update`);
    const row = result.rows[0] as Credential | undefined;
    if (!row || enrollment === Boolean(row.confirmed_at) || (enrollment && new Date(row.enrollment_expires_at).getTime() < Date.now())) throw denied();
    const last = row.last_epoch === null ? null : Number(row.last_epoch);
    const epoch = await verifyMfaCode(decryptMfaSecret(row.encrypted_secret, actor.id), code, last);
    const recoveryHash = hashToken(code);
    const recovery = !enrollment && /^[a-f0-9]{32}$/.test(code) && row.recovery_hashes.includes(recoveryHash);
    if (epoch === null && !recovery) throw denied();
    const hashes = enrollment ? recoveryCodes.map(hashToken) : row.recovery_hashes.filter(h => h !== recoveryHash);
    await tx.execute(sql`update ${table()} set confirmed_at=coalesce(confirmed_at,now()),last_epoch=${epoch ?? last},recovery_hashes=${JSON.stringify(hashes)}::jsonb where user_id=${actor.id}`);
    const version = enrollment || recovery ? await revokeUserAccess(tx, actor.id) : actor.credentialVersion!;
    if (!enrollment && !recovery && actor.sessionId) await tx.delete(sessions).where(eq(sessions.id,actor.sessionId));
    await recordIdentityAudit(tx, {actor,action:enrollment?"MFA_ENROLLED":recovery?"MFA_RECOVERY_USED":"MFA_VERIFIED",entity:"user",entityId:actor.id});
    const expiresAt=new Date(Date.now()+sessionPolicy(null).absoluteMs);
    await tx.insert(sessions).values({userId:actor.id,tokenHash:hashToken(token),expiresAt,lastActivityAt:new Date(),credentialVersion:version,mfaVerifiedAt:new Date(),ipAddress:current.sessionIpAddress,userAgent:current.sessionUserAgent});
    await tx.update(users).set({lastLoginAt:new Date()}).where(eq(users.id,actor.id));
    await recordIdentityAudit(tx,{actor,action:"USER_LOGIN",entity:"user",entityId:actor.id,metadata:{secondFactor:true}});
    return {token,expiresAt};
  });
  return {...session,recoveryCodes};
}

export async function resetMfa(actor: AuthUser, targetId: string, password: string, reason: string): Promise<void> {
  if (reason.trim().length < 10 || reason.length > 300) throw new AppError("VALIDATION", "Enter a security reset reason.");
  await limit(actor);
  await db.transaction(async tx => {
    await lockIdentityState(tx);
    const current = await currentMfaActor(tx, actor);
    if (current.role !== "SUPER_ADMIN" || current.mfaPending || current.agencyId || current.id === targetId) throw new AppError("FORBIDDEN", "Another SUPER_ADMIN must authorize this reset.");
    const [user] = await tx.select().from(users).where(eq(users.id,current.id)).limit(1);
    if (!user || !await verifyPassword(password,user.passwordHash)) throw denied();
    const [target]=await tx.select().from(users).where(eq(users.id,targetId)).limit(1);
    if(!target||target.agencyId)throw denied();
    await tx.execute(sql`delete from ${table()} where user_id=${targetId}`);
    await tx.execute(sql`delete from ${sql.raw(qualifiedTable("mfa_enrollment_authorizations"))} where user_id=${targetId}`);
    await revokeUserAccess(tx,targetId);
    await recordIdentityAudit(tx,{actor:current,action:"MFA_RESET",entity:"user",entityId:targetId,metadata:{reason:reason.trim()}});
  });
}
