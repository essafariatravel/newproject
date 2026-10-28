import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { users, accountRecoveryRequests } from "@/db/schema";
import { authenticate } from "@/lib/auth";
import { createAccount, updateAccount } from "@/lib/account-security";
import { requestAccountRecovery } from "@/lib/account-recovery";
suiteSetup();

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
});
