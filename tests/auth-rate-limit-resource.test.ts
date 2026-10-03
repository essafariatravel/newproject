import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { db } from "@/lib/db";
import { authRateLimits } from "@/db/schema";
import { requestAccountRecovery } from "@/lib/account-recovery";

suiteSetup();

describe("authentication rate-limit resource safety", () => {
  it("does not create new recovery identity counters after the source IP is blocked", async () => {
    const before = Number((await db.select({ n: sql<number>`count(*)::int` }).from(authRateLimits))[0]?.n ?? 0);
    const ip = "203.0.113.250";
    for (let i = 0; i < 22; i += 1) {
      await requestAccountRecovery(`unknown-${i}@rate-limit.example`, ip);
    }
    const after = Number((await db.select({ n: sql<number>`count(*)::int` }).from(authRateLimits))[0]?.n ?? 0);

    // One shared IP key + at most the first 20 identity keys. Attempts beyond
    // the IP limit must not create attacker-controlled identity rows.
    expect(after - before).toBe(21);
  });
});
