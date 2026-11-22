import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
import { createSession } from "./helpers/authenticated-session";
import { db } from "@/lib/db";
import { sessions } from "@/db/schema";
import { hashToken } from "@/lib/crypto";
import { getSessionUser, touchCurrentSession } from "@/lib/auth";
import { activeSessions } from "@/lib/session-security";
import { SESSION_POLICIES, SESSION_WARNING_MS, sessionPolicy } from "@/lib/identity-policy";
import { GET as getSessionStatus } from "@/app/api/session/route";

suiteSetup();
afterEach(() => { request.cookie = ""; });

async function sessionAgedBy(email: string, minutes: number) {
  const user = await userByEmail(email);
  const { token } = await createSession(user.id);
  const tokenHash = hashToken(token);
  const lastActivityAt = new Date(Date.now() - minutes * 60_000);
  await db.update(sessions).set({ lastActivityAt }).where(eq(sessions.tokenHash, tokenHash));
  request.cookie = token;
  return { user, tokenHash, lastActivityAt };
}

describe("server-enforced session idle windows: agencies 120m, all Staff 60m", () => {
  it("keeps absolute expiry unchanged (24h agency; 12h Staff) and warns at 5m", () => {
    expect(SESSION_POLICIES.agency).toEqual({ idleMs: 120 * 60_000, absoluteMs: 24 * 60 * 60_000 });
    expect(SESSION_POLICIES.staff).toEqual({ idleMs: 60 * 60_000, absoluteMs: 12 * 60 * 60_000 });
    expect(SESSION_WARNING_MS).toBe(5 * 60_000);
    expect(sessionPolicy("00000000-0000-0000-0000-000000000001")).toBe(SESSION_POLICIES.agency);
    expect(sessionPolicy(null)).toBe(SESSION_POLICIES.staff);
  });

  it.each(["a-user@test.example", "a-admin@test.example"])(
    "accepts agency sessions before 120 minutes, without renewing on GET: %s",
    async email => {
      const { user, tokenHash, lastActivityAt } = await sessionAgedBy(email, 119);
      expect((await getSessionUser())?.id).toBe(user.id);
      const status = await getSessionStatus();
      expect(status.status).toBe(200);
      expect(status.headers.get("Cache-Control")).toBe("no-store");
      const body = await status.json() as {
        authenticated: boolean; idleDeadlineAt: string; absoluteExpiresAt: string; serverNow: string;
      };
      expect(body.authenticated).toBe(true);
      expect(Date.parse(body.idleDeadlineAt) - lastActivityAt.getTime()).toBe(120 * 60_000);
      expect(Date.parse(body.absoluteExpiresAt)).toBeGreaterThan(Date.parse(body.serverNow));
      const [session] = await db.select({ lastActivityAt: sessions.lastActivityAt })
        .from(sessions).where(eq(sessions.tokenHash, tokenHash));
      expect(session!.lastActivityAt.getTime()).toBe(lastActivityAt.getTime());
    },
  );

  it.each(["a-user@test.example", "a-admin@test.example"])(
    "rejects agency sessions after 120 minutes on page, poll and explicit touch: %s",
    async email => {
      await sessionAgedBy(email, 121);
      expect(await getSessionUser()).toBeNull();
      expect((await getSessionStatus()).status).toBe(401);
      expect(await touchCurrentSession()).toBe(false);
    },
  );

  it.each(["superadmin@test.example", "admin@test.example", "accounting@test.example", "agent@test.example"])(
    "accepts all Staff roles at 59 minutes and allows explicit interaction: %s",
    async email => {
      const { user, tokenHash } = await sessionAgedBy(email, 59);
      expect((await getSessionUser())?.id).toBe(user.id);
      expect((await getSessionStatus()).status).toBe(200);
      expect(await touchCurrentSession()).toBe(true);
      const [session] = await db.select({ lastActivityAt: sessions.lastActivityAt })
        .from(sessions).where(eq(sessions.tokenHash, tokenHash));
      expect(session!.lastActivityAt.getTime()).toBeGreaterThan(Date.now() - 2 * 60_000);
    },
  );

  it.each(["superadmin@test.example", "admin@test.example", "accounting@test.example", "agent@test.example"])(
    "rejects all Staff roles at 61 minutes: %s",
    async email => {
      await sessionAgedBy(email, 61);
      expect(await getSessionUser()).toBeNull();
      expect((await getSessionStatus()).status).toBe(401);
      expect(await touchCurrentSession()).toBe(false);
    },
  );

  it("does not renew a session from background polling, then explicitly renews on real interaction", async () => {
    const { tokenHash, lastActivityAt } = await sessionAgedBy("a-user@test.example", 119);
    const status = await getSessionStatus();
    expect(status.status).toBe(200);
    const [before] = await db.select({ lastActivityAt: sessions.lastActivityAt })
      .from(sessions).where(eq(sessions.tokenHash, tokenHash));
    expect(before!.lastActivityAt.getTime()).toBe(lastActivityAt.getTime());
    expect(await touchCurrentSession()).toBe(true);
    const [after] = await db.select({ lastActivityAt: sessions.lastActivityAt })
      .from(sessions).where(eq(sessions.tokenHash, tokenHash));
    expect(after!.lastActivityAt.getTime()).toBeGreaterThan(lastActivityAt.getTime());
    expect((await getSessionStatus()).status).toBe(200);
  });

  it("keeps absolute expiry authoritative regardless of fresh user activity", async () => {
    const { tokenHash } = await sessionAgedBy("a-user@test.example", 2);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(sessions.tokenHash, tokenHash));
    expect((await getSessionStatus()).status).toBe(401);
    expect(await touchCurrentSession()).toBe(false);
  });

  it("lists valid Staff sessions through 59 minutes but not after 60 minutes", async () => {
    const { tokenHash } = await sessionAgedBy("superadmin@test.example", 59);
    const actor = await getSessionUser();
    expect(actor).not.toBeNull();
    expect((await activeSessions(actor!)).some(row => row.id === actor!.sessionId)).toBe(true);
    await db.update(sessions).set({ lastActivityAt: new Date(Date.now() - 61 * 60_000) })
      .where(eq(sessions.tokenHash, tokenHash));
    expect((await activeSessions(actor!)).some(row => row.id === actor!.sessionId)).toBe(false);
  });

  it("shows agency sessions in their valid 2-hour interval", async () => {
    await sessionAgedBy("a-admin@test.example", 90);
    const actor = await getSessionUser();
    expect(actor?.agencyId).toBeTruthy();
    expect((await activeSessions(actor!)).some(row => row.id === actor!.sessionId)).toBe(true);
  });
});
