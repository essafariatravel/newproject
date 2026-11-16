import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users, auditLogs } from "@/db/schema";
import { currentAccountActor, lockIdentityState, recordIdentityAudit, revokeUserAccess } from "./account-security";
import type { AuthUser } from "./types";

/** Only safe metadata; raw tokens and token hashes never leave this service. */
export async function activeSessions(actor: AuthUser) {
  return db.select({id:sessions.id,createdAt:sessions.createdAt,lastActivityAt:sessions.lastActivityAt,expiresAt:sessions.expiresAt,userAgent:sessions.userAgent,mfaVerifiedAt:sessions.mfaVerifiedAt})
    .from(sessions).innerJoin(users,eq(sessions.userId,users.id))
    .where(and(eq(sessions.userId,actor.id),eq(sessions.credentialVersion,users.credentialVersion),gt(sessions.expiresAt,new Date()),sql`${sessions.lastActivityAt}>now()-interval '30 minutes'`))
    .orderBy(desc(sessions.createdAt),desc(sessions.id)).limit(100);
}
export async function securityOverview(actor:AuthUser){
  const [account,events,staff]=await Promise.all([
    db.select({lastLoginAt:users.lastLoginAt}).from(users).where(eq(users.id,actor.id)).limit(1),
    db.select({id:auditLogs.id,action:auditLogs.action,createdAt:auditLogs.createdAt}).from(auditLogs).where(and(eq(auditLogs.entity,"user"),eq(auditLogs.entityId,actor.id),sql`(${auditLogs.action} like 'MFA_%' or ${auditLogs.action} like '%SESSION%' or ${auditLogs.action} in ('USER_LOGIN','STAFF_PASSWORD_VERIFIED','PASSWORD_CHANGED'))`)).orderBy(desc(auditLogs.createdAt),desc(auditLogs.id)).limit(30),
    actor.role==="SUPER_ADMIN"?db.select({id:users.id,name:users.name,email:users.email}).from(users).where(and(isNull(users.agencyId),eq(users.status,"ACTIVE"),ne(users.id,actor.id))).orderBy(users.name,users.id).limit(100):Promise.resolve([]),
  ]);
  return {lastLoginAt:account[0]?.lastLoginAt,events,staff};
}
export async function revokeSession(actor: AuthUser, id: string | null) {
  await db.transaction(async tx=>{
    await lockIdentityState(tx);
    const current=await currentAccountActor(tx,actor);
    if(id) await tx.delete(sessions).where(and(eq(sessions.id,id),eq(sessions.userId,current.id)));
    else await revokeUserAccess(tx,current.id);
    await recordIdentityAudit(tx,{actor:current,action:id?"SESSION_REVOKED":"USER_SESSIONS_REVOKED",entity:"user",entityId:current.id});
  });
}
