import { afterEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
import { db } from "@/lib/db";
import { users, sessions } from "@/db/schema";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { requestAccountRecovery } from "@/lib/account-recovery";
import { createAccount, updateAccount } from "@/lib/account-security";
import { createSession, getSessionUser, touchCurrentSession } from "@/lib/auth";
import { sessionPolicy } from "@/lib/identity-policy";
import { hashToken } from "@/lib/crypto";

suiteSetup();afterEach(()=>{request.cookie="";});
describe("release identity regression coverage",()=>{
  it("counts compatibility-equivalent recovery usernames in one rate-limit bucket",async()=>{
    for(let i=0;i<3;i++)await requestAccountRecovery("recovery.member","compatibility-rate-ip");
    await requestAccountRecovery("ｒｅｃｏｖｅｒｙ．ｍｅｍｂｅｒ","compatibility-rate-ip");
    const rows=(await db.execute(sql`select attempts from auth_rate_limits where key=${hashToken("recovery-identity:recovery.member")}`)).rows as {attempts:number}[];
    expect(rows[0]?.attempts).toBe(4);
    expect((await db.execute(sql`select attempts from auth_rate_limits where key=${hashToken("recovery-identity:ｒｅｃｏｖｅｒｙ．ｍｅｍｂｅｒ")}`)).rows).toHaveLength(0);
  });
  it("permits exactly the configured threshold under concurrent rate-limit attempts",async()=>{
    const results=await Promise.all(Array.from({length:8},()=>consumeAuthRateLimit("closure-concurrent","one-subject",3,60000)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });
  it("allows only one concurrently created normalized username across tenants",async()=>{
    const a=await userByEmail("a-admin@test.example"),b=await userByEmail("b-admin@test.example");
    const results=await Promise.allSettled([createAccount(a,{name:"Unique A",username:" Concurrent.Member ",role:"AGENCY_USER",agencyId:a.agencyId,password:"Synthetic-Member-123"}),createAccount(b,{name:"Unique B",username:"ｃｏｎｃｕｒｒｅｎｔ．ｍｅｍｂｅｒ",role:"AGENCY_USER",agencyId:b.agencyId,password:"Synthetic-Member-123"})]);
    expect(results.filter(row=>row.status==="fulfilled")).toHaveLength(1);
    expect(await db.select().from(users).where(eq(users.username,"concurrent.member"))).toHaveLength(1);
  });
  it("prevents concurrent suspensions from removing the last active SUPER_ADMIN",async()=>{
    const first=await userByEmail("superadmin@test.example");
    const second=await createAccount(first,{name:"Second authorized admin",email:"second-closure@test.example",role:"SUPER_ADMIN",agencyId:null,password:"Synthetic-Admin-123"});
    await db.update(users).set({mustChangePassword:false}).where(eq(users.id,second.id));
    const secondActor={...first,id:second.id,email:second.email};
    const results=await Promise.allSettled([updateAccount(first,second.id,{toggleStatus:true}),updateAccount(secondActor,first.id,{toggleStatus:true})]);
    expect(results.filter(row=>row.status==="fulfilled")).toHaveLength(1);
    expect(await db.select().from(users).where(and(eq(users.role,"SUPER_ADMIN"),eq(users.status,"ACTIVE")))).toHaveLength(1);
    await db.update(users).set({status:"ACTIVE"}).where(eq(users.id,first.id));
  });
  it.each(["superadmin@test.example","admin@test.example","agent@test.example","accounting@test.example","a-admin@test.example","a-user@test.example"])("enforces idle and absolute session boundaries for %s",async email=>{
    const actor=await userByEmail(email),policy=sessionPolicy(actor.agencyId);
    const active=await createSession(actor.id);request.cookie=active.token;
    await db.update(sessions).set({lastActivityAt:new Date(Date.now()-policy.idleMs+1500)}).where(eq(sessions.tokenHash,hashToken(active.token)));
    expect((await getSessionUser())?.id).toBe(actor.id);
    await db.update(sessions).set({lastActivityAt:new Date(Date.now()-policy.idleMs)}).where(eq(sessions.tokenHash,hashToken(active.token)));
    expect(await getSessionUser()).toBeNull();expect(await touchCurrentSession()).toBe(false);
    const absolute=await createSession(actor.id);request.cookie=absolute.token;
    await db.update(sessions).set({lastActivityAt:new Date(),expiresAt:new Date(Date.now()-1)}).where(eq(sessions.tokenHash,hashToken(absolute.token)));
    expect(await getSessionUser()).toBeNull();expect(await touchCurrentSession()).toBe(false);
  });
});
