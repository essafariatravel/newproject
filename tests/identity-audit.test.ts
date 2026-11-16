import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { accountAccessTokens, sessions, users } from "@/db/schema";
import { createSession } from "./helpers/authenticated-session";
import { changeAccountPassword, createAccount, updateAccount } from "@/lib/account-security";
import { issueAccessToken, resetAccountFromToken } from "@/lib/account-recovery";
import { hashToken } from "@/lib/crypto";

suiteSetup();
afterEach(async () => {
  await db.execute(sql`drop trigger if exists identity_audit_test_failure on audit_logs`);
  await db.execute(sql`drop function if exists identity_audit_test_failure()`);
});

/** A real database failure proves the audit shares the mutation transaction. */
async function rejectAudit(action: string) {
  if (!/^[A-Z_]+$/.test(action)) throw new Error("Invalid test action");
  await db.execute(sql.raw(`create function identity_audit_test_failure() returns trigger language plpgsql as $$
    begin if new.action='${action}' then raise exception 'Identity audit unavailable'; end if; return new; end $$`));
  await db.execute(sql`create trigger identity_audit_test_failure before insert on audit_logs for each row execute function identity_audit_test_failure()`);
}

describe("sensitive identity audits are atomic", () => {
  it("rolls back suspension and revocation when its audit cannot be written", async () => {
    const actor = await userByEmail("superadmin@test.example"), target = await userByEmail("accounting@test.example");
    const session = await createSession(target.id);
    await rejectAudit("USER_SUSPENDED");
    await expect(updateAccount(actor, target.id, { toggleStatus: true })).rejects.toThrow();
    const unchanged = (await db.select().from(users).where(eq(users.id, target.id)))[0]!;
    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.credentialVersion).toBe(0);
    expect(await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(session.token)))).toHaveLength(1);
  });

  it("rolls back a password change and preserves existing sessions on audit failure", async () => {
    const actor = await userByEmail("a-user@test.example");
    const before = (await db.select().from(users).where(eq(users.id, actor.id)))[0]!;
    const session = await createSession(actor.id);
    await rejectAudit("PASSWORD_CHANGED");
    await expect(changeAccountPassword(actor, "Test-Password-123", "Changed-Password-123")).rejects.toThrow();
    const after = (await db.select().from(users).where(eq(users.id, actor.id)))[0]!;
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.credentialVersion).toBe(before.credentialVersion);
    expect(await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(session.token)))).toHaveLength(1);
  });

  it("does not create an account without its audit", async () => {
    await rejectAudit("USER_CREATED");
    await expect(createAccount(await userByEmail("a-admin@test.example"), { name: "Audit Member", username: "audit-member", role: "AGENCY_USER", agencyId: (await userByEmail("a-admin@test.example")).agencyId, password: "Member-Password-123" })).rejects.toThrow();
    expect(await db.select().from(users).where(eq(users.username, "audit-member"))).toHaveLength(0);
  });

  it("keeps the prior access link if replacement cannot be audited", async () => {
    const actor = await userByEmail("superadmin@test.example"), target = await userByEmail("b-user@test.example");
    const previous = await issueAccessToken(actor, target.id);
    await rejectAudit("PASSWORD_RESET_LINK_CREATED");
    await expect(issueAccessToken(actor, target.id)).rejects.toThrow();
    const tokens = await db.select().from(accountAccessTokens).where(eq(accountAccessTokens.userId, target.id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.tokenHash).toBe(hashToken(previous.token));
  });

  it("keeps password, capability and sessions unchanged if reset cannot be audited", async () => {
    const actor = await userByEmail("superadmin@test.example"), target = await userByEmail("b-user@test.example");
    const before = (await db.select().from(users).where(eq(users.id, target.id)))[0]!;
    const session = await createSession(target.id), access = await issueAccessToken(actor, target.id);
    await rejectAudit("PASSWORD_RESET");
    await expect(resetAccountFromToken(access.token, "Reset-Password-123")).rejects.toThrow();
    const after = (await db.select().from(users).where(eq(users.id, target.id)))[0]!;
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.credentialVersion).toBe(before.credentialVersion);
    expect((await db.select().from(accountAccessTokens).where(eq(accountAccessTokens.tokenHash, hashToken(access.token))))[0]?.usedAt).toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(session.token)))).toHaveLength(1);
  });
});
