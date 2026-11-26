import { beforeEach,describe,expect,it } from "vitest";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures,userByEmail } from "./helpers/fixtures";
import { createSession } from "./helpers/authenticated-session";
import { db } from "@/lib/db";
import { sessions,auditLogs,users } from "@/db/schema";
import { hashToken } from "@/lib/crypto";
import { personalProfileSecurity,revokeOtherAgencySessions } from "@/lib/agency-profile-security";
suiteSetup();
beforeEach(async()=>{await resetData();await seedFixtures()});
async function account(email:string){
 const actor=await userByEmail(email);const minted=await createSession(actor.id);
 const [session]=await db.select({id:sessions.id}).from(sessions).where(eq(sessions.tokenHash,hashToken(minted.token)));
 const [user]=await db.select({credentialVersion:users.credentialVersion}).from(users).where(eq(users.id,actor.id));
 return {...actor,sessionId:session!.id,credentialVersion:user!.credentialVersion};
}
describe("agency personal session management",()=>{
 it("lists only personal sessions and refuses another agency's session",async()=>{
  const a=await account("a-admin@test.example"),b=await account("b-admin@test.example");
  const result=await personalProfileSecurity(a);
  expect(result.devices.map(d=>d.id)).toContain(a.sessionId);
  expect(result.devices.map(d=>d.id)).not.toContain(b.sessionId);
  await expect(revokeOtherAgencySessions(a,b.sessionId)).rejects.toMatchObject({code:"NOT_FOUND"});
  expect(await db.select({id:sessions.id}).from(sessions).where(eq(sessions.id,b.sessionId))).toHaveLength(1);
 });
 it("preserves the current session and all foreign sessions",async()=>{
  const a=await account("a-admin@test.example"),other=await account("a-admin@test.example"),b=await account("b-admin@test.example");
  await expect(revokeOtherAgencySessions(a,a.sessionId)).rejects.toMatchObject({code:"VALIDATION"});
  await revokeOtherAgencySessions(a,"all");
  const ids=(await db.select({id:sessions.id}).from(sessions)).map(r=>r.id);
  expect(ids).toContain(a.sessionId);expect(ids).toContain(b.sessionId);expect(ids).not.toContain(other.sessionId);
 });
 it("rejects revoked authorization before another session can be deleted",async()=>{
  const a=await account("a-admin@test.example"),other=await account("a-admin@test.example");
  await db.delete(sessions).where(eq(sessions.id,a.sessionId));
  await expect(revokeOtherAgencySessions(a,other.sessionId)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
  expect(await db.select({id:sessions.id}).from(sessions).where(eq(sessions.id,other.sessionId))).toHaveLength(1);
 });
 it("does not expose internal audit events or another actor's history",async()=>{
  const a=await account("a-admin@test.example"),b=await account("b-admin@test.example");
  await db.insert(auditLogs).values([{actorId:a.id,agencyId:a.agencyId,action:"AGENCY_CONTACT_UPDATED",entity:"agency",entityId:a.agencyId,metadata:{internal:"hidden"}},{actorId:b.id,agencyId:b.agencyId,action:"PASSWORD_CHANGED",entity:"user",entityId:b.id},{actorId:a.id,agencyId:a.agencyId,action:"INTERNAL_NOTE",entity:"agency",entityId:a.agencyId}]);
  const result=await personalProfileSecurity(a);
  expect(result.events.some(e=>e.action==="AGENCY_CONTACT_UPDATED")).toBe(true);
  expect(result.events.some(e=>e.action==="INTERNAL_NOTE"||e.action==="PASSWORD_CHANGED")).toBe(false);
  expect(JSON.stringify(result.events)).not.toContain("hidden");
 });
});
