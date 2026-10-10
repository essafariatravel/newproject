import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { accountAccessTokens, accountRecoveryRequests, agencies, auditLogs, users } from "@/db/schema";
import { changeAccountPassword, createAccount, toggleAgencyAccess, updateAccount } from "@/lib/account-security";
import { closeRecoveryRequest, issueAccessToken } from "@/lib/account-recovery";
import type { AuthUser } from "@/lib/types";

suiteSetup();
beforeEach(async () => { await resetData(); await seedFixtures(); });

async function captured(email: string): Promise<AuthUser & { credentialVersion: number }> {
  const actor = await userByEmail(email);
  const [row] = await db.select({ credentialVersion: users.credentialVersion }).from(users).where(eq(users.id, actor.id));
  return { ...actor, credentialVersion: row!.credentialVersion };
}

async function revokedOwner() {
  const oldActor = await captured("superadmin@test.example");
  const second = await createAccount(oldActor, { name: "Independent authorized owner", email: "revocation-owner@test.example",
    role: "SUPER_ADMIN", agencyId: null, password: "Synthetic-Owner-123" });
  await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, second.id));
  await updateAccount(await captured(second.email), oldActor.id, { forceSignOut: true });
  return oldActor;
}

describe("account management rejects authorization captured before forced sign-out", () => {
  it("does not create an account using the revoked SUPER_ADMIN identity", async () => {
    const actor = await revokedOwner();
    await expect(createAccount(actor, { name: "Rejected account", email: "revoked-created@test.example",
      role: "ADMIN", agencyId: null, password: "Synthetic-New-123" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await db.select({ id: users.id }).from(users).where(eq(users.email, "revoked-created@test.example"))).toHaveLength(0);
  });

  it("does not update another account using the revoked SUPER_ADMIN identity", async () => {
    const actor = await revokedOwner(), target = await captured("admin@test.example");
    await expect(updateAccount(actor, target.id, { name: "Unauthorized replacement" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await db.select({ name: users.name }).from(users).where(eq(users.id, target.id)))[0]!.name).toBe(target.name);
  });

  it("does not issue a recovery token using the revoked SUPER_ADMIN identity", async () => {
    const actor = await revokedOwner(), target = await captured("a-user@test.example");
    await expect(issueAccessToken(actor, target.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await db.select({ id: accountAccessTokens.id }).from(accountAccessTokens)).toHaveLength(0);
    expect(await db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.action, "PASSWORD_RESET_LINK_CREATED"))).toHaveLength(0);
  });

  it("does not close a recovery request using the revoked SUPER_ADMIN identity", async () => {
    const actor = await revokedOwner(), target = await captured("a-user@test.example");
    const [request] = await db.insert(accountRecoveryRequests).values({ identifier: target.username!, userId: target.id }).returning();
    await expect(closeRecoveryRequest(actor, request!.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await db.select().from(accountRecoveryRequests).where(eq(accountRecoveryRequests.id, request!.id)))[0]!.status).toBe("PENDING");
  });

  it("does not suspend an agency using the revoked SUPER_ADMIN identity", async () => {
    const actor = await revokedOwner(), target = await captured("a-admin@test.example");
    await expect(toggleAgencyAccess(actor, target.agencyId!)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await db.select({ status: agencies.status }).from(agencies).where(eq(agencies.id, target.agencyId!)))[0]!.status).toBe("ACTIVE");
  });

  it("does not replace its own password using the revoked session identity and still-current password", async () => {
    const actor = await revokedOwner();
    await expect(changeAccountPassword(actor, "Test-Password-123", "Synthetic-Replaced-456")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await db.select({ credentialVersion: users.credentialVersion }).from(users).where(eq(users.id, actor.id)))[0]!.credentialVersion).toBe(actor.credentialVersion + 1);
    expect(await db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.action, "PASSWORD_CHANGED"))).toHaveLength(0);
  });

  it("allows a current forced temporary-password identity to complete the authorized password change", async () => {
    const owner = await captured("superadmin@test.example");
    const account = await createAccount(owner, { name: "Temporary member", username: "temporary.revocation", role: "AGENCY_USER",
      agencyId: (await captured("a-admin@test.example")).agencyId, password: "Synthetic-Temporary-123" });
    const actor = await captured(account.email);
    // Agency mailboxes are shared; resolve this human explicitly by its stable ID.
    const current = { ...actor, id: account.id, username: account.username, name: account.name, role: "AGENCY_USER" as const,
      agencyId: account.agencyId, mustChangePassword: true, credentialVersion: account.credentialVersion };
    const version = await changeAccountPassword(current, "Synthetic-Temporary-123", "Synthetic-Changed-456");
    expect(version).toBe(account.credentialVersion + 1);
    expect((await db.select({ mustChangePassword: users.mustChangePassword }).from(users).where(eq(users.id, account.id)))[0]!.mustChangePassword).toBe(false);
  });
});
