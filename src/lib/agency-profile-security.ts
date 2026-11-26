import { and,desc,eq,gt,inArray,ne,or,sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs,sessions } from "@/db/schema";
import { currentAccountActor,lockIdentityState,recordIdentityAudit } from "@/lib/account-security";
import { activeSessions } from "@/lib/session-security";
import { sessionPolicy } from "@/lib/identity-policy";
import { AppError,isAgencyRole,type AuthUser } from "@/lib/types";
const userEvents=["USER_LOGIN","PASSWORD_CHANGED","SESSION_REVOKED","AGENCY_OTHER_SESSIONS_REVOKED"];
const agencyEvents=["AGENCY_CONTACT_UPDATED","AGENCY_LOGO_UPLOADED","AGENCY_LOGO_REMOVED"];
function assertAgency(actor:AuthUser){if(!actor.agencyId||!isAgencyRole(actor.role)||actor.mustChangePassword||!actor.sessionId||actor.credentialVersion===undefined)throw new AppError("FORBIDDEN","Please sign in to continue.")}
export async function personalProfileSecurity(actor:AuthUser){
 assertAgency(actor);
 const [devices,events]=await Promise.all([activeSessions(actor),db.select({id:auditLogs.id,action:auditLogs.action,createdAt:auditLogs.createdAt}).from(auditLogs).where(and(eq(auditLogs.agencyId,actor.agencyId!),eq(auditLogs.actorId,actor.id),or(and(eq(auditLogs.entity,"user"),eq(auditLogs.entityId,actor.id),inArray(auditLogs.action,userEvents)),and(eq(auditLogs.entity,"agency"),eq(auditLogs.entityId,actor.agencyId!),inArray(auditLogs.action,agencyEvents))))).orderBy(desc(auditLogs.createdAt),desc(auditLogs.id)).limit(12)]);
 return {devices,events};
}
export async function revokeOtherAgencySessions(actor:AuthUser,target:unknown){
 assertAgency(actor);
 if(typeof target!=="string"||(target!=="all"&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target))||target===actor.sessionId)throw new AppError("VALIDATION","Select another session.");
 await db.transaction(async tx=>{
  await lockIdentityState(tx);
  const current=await currentAccountActor(tx,actor);
  assertAgency(current);
  const [own]=await tx.select({id:sessions.id}).from(sessions).where(and(eq(sessions.id,current.sessionId!),eq(sessions.userId,current.id),eq(sessions.credentialVersion,current.credentialVersion!),gt(sessions.expiresAt,new Date()),sql`${sessions.lastActivityAt} > now() - ${sessionPolicy(current.agencyId).idleMs} * interval '1 millisecond'`)).limit(1);
  if(!own)throw new AppError("UNAUTHENTICATED","Please sign in to continue.");
  const removed=await tx.delete(sessions).where(and(eq(sessions.userId,current.id),ne(sessions.id,own.id),target==="all"?undefined:eq(sessions.id,target))).returning({id:sessions.id});
  if(!removed.length)throw new AppError("NOT_FOUND","No other session to disconnect.");
  await recordIdentityAudit(tx,{actor:current,action:"AGENCY_OTHER_SESSIONS_REVOKED",entity:"user",entityId:current.id,metadata:{count:removed.length}});
 });
}
