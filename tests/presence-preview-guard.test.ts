import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { sessions } from "@/db/schema";
import { qualifiedTable } from "@/lib/database-schema";
import { touchPresence } from "@/lib/presence";

suiteSetup();
afterEach(() => vi.unstubAllEnvs());

async function createPresenceSession() {
  const user = await userByEmail("b-admin@test.example");
  const [session] = await db.insert(sessions).values({
    userId: user.id,
    tokenHash: `preview-presence-${crypto.randomUUID()}`,
    expiresAt: new Date(Date.now() + 3600000),
  }).returning();
  return session!;
}

describe("North Star read-only Preview presence writes", () => {
  const environments = [
    { name: "suppresses the North Star Vercel Preview", vercel: "1", scope: "preview", branch: "design/essafaria-northstar", suppressed: true },
    { name: "preserves Production even with the North Star branch", vercel: "1", scope: "production", branch: "design/essafaria-northstar", suppressed: false },
    { name: "preserves another Vercel Preview branch", vercel: "1", scope: "preview", branch: "feature/existing-portal", suppressed: false },
    { name: "preserves a similarly named but different Preview branch", vercel: "1", scope: "preview", branch: "design/essafaria-northstar-extra", suppressed: false },
    { name: "preserves Vercel Development", vercel: "1", scope: "development", branch: "design/essafaria-northstar", suppressed: false },
    { name: "preserves non-Vercel behavior with Preview metadata", vercel: "0", scope: "preview", branch: "design/essafaria-northstar", suppressed: false },
    { name: "preserves behavior when branch metadata is absent", vercel: "1", scope: "preview", branch: undefined, suppressed: false },
    { name: "preserves behavior when Preview scope is absent", vercel: "1", scope: undefined, branch: "design/essafaria-northstar", suppressed: false },
    { name: "preserves an unconfigured local environment", vercel: undefined, scope: undefined, branch: undefined, suppressed: false },
  ];

  it.each(environments)("$name", async ({ vercel, scope, branch, suppressed }) => {
    vi.stubEnv("VERCEL", vercel);
    vi.stubEnv("VERCEL_ENV", scope);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", branch);
    const session = await createPresenceSession();
    try {
      await touchPresence(session.userId, session.tokenHash);
      const result = await db.execute(sql`select session_id from ${sql.raw(qualifiedTable("session_presence"))} where session_id=${session.id}`);
      expect(result.rows).toEqual(suppressed ? [] : [{ session_id: session.id }]);
      // Heartbeats must not change authentication-session metadata in any environment.
      const [after] = await db.select().from(sessions).where(eq(sessions.id, session.id));
      expect(after).toEqual(session);
    } finally {
      await db.delete(sessions).where(eq(sessions.id, session.id));
    }
  });

  it("does not refresh an existing presence row during North Star read-only Preview QA", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "design/essafaria-northstar");
    const session = await createPresenceSession();
    const lastSeenAt = new Date("2020-01-01T00:00:00.000Z");
    try {
      await db.execute(sql`insert into ${sql.raw(qualifiedTable("session_presence"))} (session_id, last_seen_at) values (${session.id}, ${lastSeenAt.toISOString()}::timestamptz)`);
      await touchPresence(session.userId, session.tokenHash);
      const result = await db.execute(sql`select last_seen_at from ${sql.raw(qualifiedTable("session_presence"))} where session_id=${session.id}`);
      expect(result.rows).toHaveLength(1);
      expect(new Date(String(result.rows[0]?.last_seen_at)).toISOString()).toBe(lastSeenAt.toISOString());
    } finally {
      await db.delete(sessions).where(eq(sessions.id, session.id));
    }
  });
});
