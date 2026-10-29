import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { users, agencies, accountRecoveryRequests } from "@/db/schema";
import { authenticate } from "@/lib/auth";
import { createAccount, updateAccount } from "@/lib/account-security";
import { issueAccessToken, resolveAccessToken, requestAccountRecovery } from "@/lib/account-recovery";
import { createAgencyWithAdminAction, updateAgencyAction } from "@/app/actions/admin";
import { createSession } from "./helpers/authenticated-session";
import { request } from "./helpers/request";
suiteSetup();
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
afterEach(() => { request.cookie = ""; });

describe("hotfix agency email and single active account", () => {
  it("accepts a unique registered agency email case-insensitively with MFA enforcement unchanged", async () => {
    const actor = await userByEmail("a-admin@test.example");
    expect((await authenticate("  A-ADMIN@test.example  ", "Test-Password-123")).id).toBe(actor.id);
    await expect(authenticate(actor.username!, "Test-Password-123")).rejects.toMatchObject({code:"INVALID_CREDENTIALS"});
  });
  it("refuses ambiguous active emails without selecting an agency", async () => {
    const other = await userByEmail("b-user@test.example");
    await db.update(users).set({email:"a-admin@test.example"}).where(eq(users.id,other.id));
    try { await expect(authenticate("a-admin@test.example", "Test-Password-123")).rejects.toMatchObject({code:"INVALID_CREDENTIALS"}); }
    finally { await db.update(users).set({email:other.email}).where(eq(users.id,other.id)); }
  });
  it("queues recovery using the registered agency email", async () => {
    const actor = await userByEmail("a-admin@test.example");
    await requestAccountRecovery(" A-ADMIN@test.example ", "hotfix-local");
    expect((await db.select().from(accountRecoveryRequests).where(eq(accountRecoveryRequests.identifier,actor.email)))[0]?.userId).toBe(actor.id);
  });
  it("preserves the registered login and recovery address when staff edits agency contact details", async () => {
    const owner = await userByEmail("superadmin@test.example");
    request.cookie = (await createSession(owner.id)).token;
    const form = new FormData();
    for (const [key,value] of Object.entries({legalName:"Synthetic separate contact",email:"contact-separate@test.example",adminEmail:"login-separate@test.example",adminName:"Synthetic admin",adminPassword:"Test-Password-123"})) form.set(key,value);
    await expect(createAgencyWithAdminAction(form)).rejects.toMatchObject({digest:expect.stringMatching(/NEXT_REDIRECT.*ok=/)});
    const [login] = await db.select().from(users).where(eq(users.email,"login-separate@test.example"));
    expect(login?.agencyId).toBeTruthy();
    const edit = new FormData();
    for (const [key,value] of Object.entries({id:login!.agencyId!,legalName:"Synthetic separate contact updated",email:"updated-contact@test.example",city:"Oran"})) edit.set(key,value);
    await expect(updateAgencyAction(edit)).rejects.toMatchObject({digest:expect.stringMatching(/NEXT_REDIRECT.*ok=/)});
    expect((await db.select().from(agencies).where(eq(agencies.id,login!.agencyId!)))[0]?.email).toBe("updated-contact@test.example");
    expect((await authenticate("login-separate@test.example","Test-Password-123")).id).toBe(login!.id);
    await expect(authenticate("updated-contact@test.example","Test-Password-123")).rejects.toMatchObject({code:"INVALID_CREDENTIALS"});
    await requestAccountRecovery("login-separate@test.example","hotfix-contact-change");
    expect((await db.select().from(accountRecoveryRequests).where(eq(accountRecoveryRequests.identifier,"login-separate@test.example")))[0]?.userId).toBe(login!.id);
  });
  it("shows the registered email on a valid agency password reset link", async () => {
    const owner = await userByEmail("superadmin@test.example"), target = await userByEmail("a-admin@test.example");
    const link = await issueAccessToken(owner,target.id);
    expect(link.email).toBe(target.email);
    expect((await resolveAccessToken(link.token))?.email).toBe(target.email);
  });
  it("blocks secondary account creation by both the agency and SUPER_ADMIN without changing existing accounts", async () => {
    const actor = await userByEmail("a-admin@test.example"), owner = await userByEmail("superadmin@test.example");
    const before = await db.select().from(users).where(eq(users.agencyId,actor.agencyId!));
    const input = {name:"Synthetic secondary",role:"AGENCY_USER" as const,agencyId:actor.agencyId,email:"secondary@test.example",username:"hotfix-secondary",password:"Test-Password-123"};
    await expect(createAccount(actor,input)).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(createAccount(owner,input)).rejects.toMatchObject({code:"AGENCY_ACCOUNT_EXISTS"});
    expect(await db.select().from(users).where(eq(users.agencyId,actor.agencyId!))).toEqual(before);
  });
  it("blocks reactivation of a second agency account", async () => {
    const target = await userByEmail("b-user@test.example"), owner = await userByEmail("superadmin@test.example");
    await db.update(users).set({status:"SUSPENDED"}).where(eq(users.id,target.id));
    await expect(updateAccount(owner,target.id,{toggleStatus:true})).rejects.toMatchObject({code:"AGENCY_ACCOUNT_EXISTS"});
    expect((await db.select().from(users).where(eq(users.id,target.id)))[0]?.status).toBe("SUSPENDED");
  });
  it("requires managing the existing suspended account rather than creating a secondary identity", async () => {
    const owner = await userByEmail("superadmin@test.example");
    const [agency] = await db.insert(agencies).values({legalName:"Synthetic suspended account",email:"contact-suspended@test.example"}).returning();
    const existing = await createAccount(owner,{name:"Existing identity",role:"AGENCY_ADMIN",agencyId:agency!.id,email:"existing-suspended@test.example",password:"Test-Password-123"});
    await db.update(users).set({status:"SUSPENDED"}).where(eq(users.id,existing.id));
    await expect(createAccount(owner,{name:"Replacement identity",role:"AGENCY_ADMIN",agencyId:agency!.id,email:"secondary-suspended@test.example",password:"Test-Password-123"})).rejects.toMatchObject({code:"AGENCY_ACCOUNT_EXISTS"});
    expect((await db.select().from(users).where(eq(users.agencyId,agency!.id))).map(user=>({id:user.id,status:user.status}))).toEqual([{id:existing.id,status:"SUSPENDED"}]);
  });
});
