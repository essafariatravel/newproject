import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { accountAccessTokens, accountRecoveryRequests, sessions, users } from "@/db/schema";
import { authenticate, createSession, destroySession, getSessionUser, touchCurrentSession } from "@/lib/auth";
import { createAccount, toggleAgencyAccess, updateAccount } from "@/lib/account-security";
import { issueAccessToken, listRecoveryQueue, RECOVERY_ACKNOWLEDGEMENT, requestAccountRecovery, resetAccountFromToken, resolveAccessToken } from "@/lib/account-recovery";
import { hashToken } from "@/lib/crypto";
import { nextIp, registrationData } from "./helpers/fixtures";
import { activateAccount, approveRegistration, createActivationTokenForRegistration, resolveActivation, submitAgencyRegistration } from "@/lib/registrations";

suiteSetup();
afterEach(() => { request.cookie = ""; });
const superAdmin = () => userByEmail("superadmin@test.example");

describe("independent username identities and controlled recovery", () => {
  it("normalizes usernames and permits independent users with the same agency mailbox", async () => {
    const actor = await userByEmail("a-admin@test.example");
    const first = await createAccount(actor, { name: "First Member", username: "  Team.Member  ", role: "AGENCY_USER", agencyId: actor.agencyId, password: "Member-Password-123" });
    const second = await createAccount(actor, { name: "Second Member", username: "team-other", role: "AGENCY_USER", agencyId: actor.agencyId, password: "Other-Password-123" });
    expect(first.email).toBe(second.email);
    expect(first.id).not.toBe(second.id);
    expect((await authenticate("TEAM.MEMBER", "Member-Password-123")).id).toBe(first.id);
    await expect(authenticate(first.email, "Member-Password-123")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const other = await userByEmail("b-admin@test.example");
    await expect(createAccount(other, { name: "Collision", username: "ＴＥＡＭ.MEMBER", role: "AGENCY_USER", agencyId: other.agencyId, password: "Member-Password-123" })).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("rejects tenant injection and account administration by Agency User", async () => {
    const actor = await userByEmail("a-admin@test.example"), other = await userByEmail("b-user@test.example");
    await expect(updateAccount(actor, other.id, { toggleStatus: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(issueAccessToken(actor, other.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const member = await userByEmail("a-user@test.example");
    await expect(createAccount(member, { name: "Forbidden", username: "forbidden-member", role: "AGENCY_USER", agencyId: member.agencyId, password: "Member-Password-123" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("responds generically, deduplicates recovery requests, and guards queue issuance", async () => {
    const known = await requestAccountRecovery("team.member", "test-recovery-ip");
    expect(known).toBe(RECOVERY_ACKNOWLEDGEMENT);
    expect(await requestAccountRecovery("missing-handle", "test-recovery-ip")).toBe(known);
    for (let i = 0; i < 5; i++) expect(await requestAccountRecovery("team.member", "test-recovery-ip")).toBe(known);
    const queued = await db.select().from(accountRecoveryRequests).where(eq(accountRecoveryRequests.identifier, "team.member"));
    expect(queued).toHaveLength(1);
    const admin = await userByEmail("admin@test.example");
    await expect(listRecoveryQueue(admin)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(issueAccessToken(admin, queued[0]!.userId!, "PASSWORD_RESET", queued[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listRecoveryQueue(await superAdmin())).some((row) => row.request.id === queued[0]!.id)).toBe(true);
  });

  it("stores only a token hash, revokes earlier links, and consumes reset exactly once under concurrency", async () => {
    const actor = await superAdmin();
    const target = (await db.select().from(users).where(eq(users.username, "team.member")))[0]!;
    const oldSession = await createSession(target.id);
    const old = await issueAccessToken(actor, target.id);
    const live = await issueAccessToken(actor, target.id);
    expect(await resolveAccessToken(old.token)).toBeNull();
    const stored = await db.select().from(accountAccessTokens).where(eq(accountAccessTokens.userId, target.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toBe(hashToken(live.token));
    expect(JSON.stringify(stored)).not.toContain(live.token);
    const results = await Promise.allSettled([resetAccountFromToken(live.token, "Reset-Password-111"), resetAccountFromToken(live.token, "Reset-Password-222")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await resolveAccessToken(live.token)).toBeNull();
    await expect(resetAccountFromToken(live.token, "Reset-Password-333")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    request.cookie = oldSession.token;
    expect(await getSessionUser()).toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.userId, target.id))).toEqual([]);
  });

  it("rejects expired reset tokens and tokens invalidated by suspension/reactivation", async () => {
    const actor = await superAdmin(), target = await userByEmail("b-user@test.example");
    const expired = await issueAccessToken(actor, target.id);
    await db.update(accountAccessTokens).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(accountAccessTokens.tokenHash, hashToken(expired.token)));
    await expect(resetAccountFromToken(expired.token, "Reset-Password-333")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    const old = await issueAccessToken(actor, target.id);
    await updateAccount(actor, target.id, { toggleStatus: true });
    await updateAccount(actor, target.id, { toggleStatus: true });
    await expect(resetAccountFromToken(old.token, "Reset-Password-333")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("prevents concurrent demotions from removing the last active SUPER_ADMIN", async () => {
    const first = await superAdmin();
    const second = await createAccount(first, { name: "Second Super", email: "second-super@test.example", role: "SUPER_ADMIN", agencyId: null, password: "Super-Password-123" });
    await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, second.id));
    const secondActor = { ...first, id: second.id, email: second.email };
    const results = await Promise.allSettled([updateAccount(first, second.id, { role: "ADMIN" }), updateAccount(secondActor, first.id, { role: "ADMIN" })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(users).where(and(eq(users.role, "SUPER_ADMIN"), eq(users.status, "ACTIVE")))).toHaveLength(1);
    // Restore the fixture actor without allowing the test to weaken the invariant.
    await db.update(users).set({ role: "SUPER_ADMIN" }).where(eq(users.id, first.id));
    await db.update(users).set({ role: "ADMIN" }).where(eq(users.id, second.id));
  });
});

describe("idle, absolute, logout and agency revocation", () => {
  it("uses stricter Staff lifetimes and passive reads never extend activity", async () => {
    const staff = await userByEmail("admin@test.example"), agency = await userByEmail("a-admin@test.example");
    const staffSession = await createSession(staff.id), agencySession = await createSession(agency.id);
    expect(staffSession.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(12 * 60 * 60_000);
    expect(agencySession.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60_000);
    const activity = new Date(Date.now() - 60_000);
    await db.update(sessions).set({ lastActivityAt: activity }).where(eq(sessions.tokenHash, hashToken(staffSession.token)));
    request.cookie = staffSession.token;
    expect(await getSessionUser()).not.toBeNull();
    expect((await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(staffSession.token))))[0]?.lastActivityAt).toEqual(activity);
    expect(await touchCurrentSession()).toBe(true);
    await db.update(sessions).set({ lastActivityAt: new Date(Date.now() - 31 * 60_000) }).where(eq(sessions.tokenHash, hashToken(staffSession.token)));
    expect(await getSessionUser()).toBeNull();
    expect(await touchCurrentSession()).toBe(false);
    request.cookie = agencySession.token;
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(sessions.tokenHash, hashToken(agencySession.token)));
    expect(await getSessionUser()).toBeNull();
    expect(await touchCurrentSession()).toBe(false);
  });

  it("logout permanently invalidates the cookie", async () => {
    const actor = await userByEmail("agent@test.example"), session = await createSession(actor.id);
    request.cookie = session.token; await destroySession();
    request.cookie = session.token; expect(await getSessionUser()).toBeNull();
  });

  it("agency reactivation does not revive a session or reset link", async () => {
    const actor = await superAdmin(), target = await userByEmail("a-admin@test.example");
    const session = await createSession(target.id), token = await issueAccessToken(actor, target.id);
    await toggleAgencyAccess(actor, target.agencyId!); await toggleAgencyAccess(actor, target.agencyId!);
    request.cookie = session.token; expect(await getSessionUser()).toBeNull();
    await expect(resetAccountFromToken(token.token, "Reset-Password-333")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("rejects a session minted from credentials read before revocation", async () => {
    const actor = await superAdmin();
    const target = (await db.select().from(users).where(eq(users.email, "agent@test.example")))[0]!;
    await updateAccount(actor, target.id, { forceSignOut: true });
    await expect(createSession(target.id, { expectedCredentialVersion: target.credentialVersion })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect((await db.select().from(users).where(eq(users.id, target.id)))[0]?.credentialVersion).toBeGreaterThan(target.credentialVersion);
  });
});

describe("replacement access links revoke both token generations", () => {
  async function approvedRegistration() {
    const actor = await superAdmin();
    const registration = await submitAgencyRegistration({ data: registrationData(), files: [], ipAddress: nextIp() });
    const approved = await approveRegistration({ actor, registrationId: registration.id });
    return { actor, registration, approved };
  }

  it.each(["ACTIVATION", "PASSWORD_RESET"] as const)("a new %s link invalidates an unused legacy activation", async (purpose) => {
    const { actor, registration, approved } = await approvedRegistration();
    const old = await createActivationTokenForRegistration(registration.id, actor);
    expect(await resolveActivation(old.token)).not.toBeNull();
    const replacement = await issueAccessToken(actor, approved.adminUserId, purpose);
    expect(await resolveActivation(old.token)).toBeNull();
    await expect(activateAccount(old.token, "OldLink-Password-123")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await resetAccountFromToken(replacement.token, "Replacement-Password-123");
    expect((await authenticate(approved.username, "Replacement-Password-123")).id).toBe(approved.adminUserId);
  });

  it("a legacy replacement invalidates unused access tokens while remaining consumable", async () => {
    const { actor, registration, approved } = await approvedRegistration();
    const old = await issueAccessToken(actor, approved.adminUserId);
    expect(await resolveAccessToken(old.token)).not.toBeNull();
    const replacement = await createActivationTokenForRegistration(registration.id, actor);
    expect(await resolveAccessToken(old.token)).toBeNull();
    await expect(resetAccountFromToken(old.token, "OldLink-Password-123")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await activateAccount(replacement.token, "LegacyReplacement-Password-123");
    expect((await authenticate(approved.username, "LegacyReplacement-Password-123")).id).toBe(approved.adminUserId);
  });
});
