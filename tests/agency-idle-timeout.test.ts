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
import { SESSION_POLICIES, sessionPolicy } from "@/lib/identity-policy";
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

describe("agency inactivity — 15 minutes, enforced on the server", () => {
  it("keeps a 15-minute agency idle limit, 30-minute Staff limit and existing absolute expiry", () => {
    expect(SESSION_POLICIES.agency).toEqual({ idleMs: 15 * 60_000, absoluteMs: 24 * 60 * 60_000 });
    expect(SESSION_POLICIES.staff).toEqual({ idleMs: 30 * 60_000, absoluteMs: 12 * 60 * 60_000 });
    expect(sessionPolicy("00000000-0000-0000-0000-000000000001")).toBe(SESSION_POLICIES.agency);
    expect(sessionPolicy(null)).toBe(SESSION_POLICIES.staff);
  });

  it.each(["a-user@test.example", "a-admin@test.example"])(
    "rejects an inactive agency session on reads and interactions: %s",
    async (email) => {
      await sessionAgedBy(email, 16);
      expect(await getSessionUser()).toBeNull();
      expect((await getSessionStatus()).status).toBe(401);
      expect(await touchCurrentSession()).toBe(false);
    },
  );

  it("allows genuine activity before 15 minutes to renew the agency session", async () => {
    const { user, tokenHash, lastActivityAt } = await sessionAgedBy("a-user@test.example", 14);
    expect((await getSessionUser())?.id).toBe(user.id);
    expect(await touchCurrentSession()).toBe(true);
    const [row] = await db.select({ lastActivityAt: sessions.lastActivityAt })
      .from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
    expect(row!.lastActivityAt.getTime()).toBeGreaterThan(lastActivityAt.getTime());
  });

  it("does not prolong an agency session when the browser only checks authentication", async () => {
    const { tokenHash, lastActivityAt } = await sessionAgedBy("a-user@test.example", 14);
    expect((await getSessionStatus()).status).toBe(200);
    const [row] = await db.select({ lastActivityAt: sessions.lastActivityAt })
      .from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
    expect(row!.lastActivityAt.getTime()).toBe(lastActivityAt.getTime());
  });

  it("keeps a Staff session valid after 16 minutes of inactivity", async () => {
    const { user } = await sessionAgedBy("superadmin@test.example", 16);
    expect((await getSessionUser())?.id).toBe(user.id);
    expect((await getSessionStatus()).status).toBe(200);
    expect(await touchCurrentSession()).toBe(true);
  });
});
