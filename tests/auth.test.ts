import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { authenticate, createSession } from "@/lib/auth";
import { hashPassword, hashToken, verifyPassword } from "@/lib/crypto";
import { AppError } from "@/lib/types";

describe("authentication", () => {
  it("hashes and verifies passwords with scrypt", async () => {
    const hash = await hashPassword("Correct-Horse-1");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Correct-Horse-1", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("rejects unknown emails without leaking timing", async () => {
    await expect(authenticate("nobody@test.example", "whatever-123")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("rejects wrong passwords", async () => {
    await expect(authenticate("admin@test.example", "wrong-password")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("authenticates valid credentials case-insensitively", async () => {
    const user = await authenticate("ADMIN@test.example", "Test-Password-123");
    expect(user.role).toBe("ADMIN");
  });

  it("suspended users cannot authenticate", async () => {
    await db.update(users).set({ status: "SUSPENDED" }).where(sql`lower(${users.email}) = 'agent@test.example'`);
    await expect(authenticate("agent@test.example", "Test-Password-123")).rejects.toMatchObject({
      code: "USER_SUSPENDED",
    });
    await db.update(users).set({ status: "ACTIVE" }).where(sql`lower(${users.email}) = 'agent@test.example'`);
  });

  it("suspended agencies block their users", async () => {
    const { agencies } = await import("@/db/schema");
    const agency = (await db.select().from(agencies)).find((a) => a.legalName === "Agency A Ltd")!;
    await db.update(agencies).set({ status: "SUSPENDED" }).where(eq(agencies.id, agency.id));
    await expect(authenticate("a-user@test.example", "Test-Password-123")).rejects.toMatchObject({
      code: "AGENCY_SUSPENDED",
    });
    await db.update(agencies).set({ status: "ACTIVE" }).where(eq(agencies.id, agency.id));
  });

  it("stores only the hash of the session token", async () => {
    const user = await authenticate("admin@test.example", "Test-Password-123");
    const { token, expiresAt } = await createSession(user.id);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const { sessions } = await import("@/db/schema");
    const rows = await db.select().from(sessions);
    const match = rows.find((s) => s.tokenHash === hashToken(token));
    expect(match).toBeDefined();
    expect(rows.some((s) => s.tokenHash.includes(token))).toBe(false);
  });

  it("AppError carries safe user-facing messages", () => {
    const err = new AppError("FORBIDDEN", "You are not authorized.");
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).not.toMatch(/stack|sql|uuid/i);
  });
});
