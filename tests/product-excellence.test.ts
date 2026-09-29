import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { sessions, users } from "@/db/schema";
import { touchPresence, onlineUserCount } from "@/lib/presence";
import { parseReportFilters } from "@/lib/report-filters";
import { reportData } from "@/lib/queries";
import { adjustWallet } from "@/lib/wallet";
import { toCsv } from "@/lib/tabular-export";
suiteSetup();

describe("product excellence boundaries", () => {
  it("counts distinct active users with a recent valid session heartbeat, without identities", async () => {
    const user = await userByEmail("b-admin@test.example");
    const [first, second] = await db.insert(sessions).values([
      { userId: user.id, tokenHash: "presence-test-1", expiresAt: new Date(Date.now() + 3600000) },
      { userId: user.id, tokenHash: "presence-test-2", expiresAt: new Date(Date.now() + 3600000) },
    ]).returning();
    await touchPresence(user.id, first!.tokenHash); await touchPresence(user.id, second!.tokenHash);
    expect(await onlineUserCount()).toBe(1);
    await db.execute(sql`update session_presence set last_seen_at=now()-interval '3 minutes'`);
    expect(await onlineUserCount()).toBe(0);
    await touchPresence(user.id, first!.tokenHash);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, first!.id));
    expect(await onlineUserCount()).toBe(0);
    await touchPresence(user.id, second!.tokenHash);
    await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.id, user.id));
    expect(await onlineUserCount()).toBe(0);
    await db.update(users).set({ status: "ACTIVE" }).where(eq(users.id, user.id));
    await db.delete(sessions).where(and(eq(sessions.userId, user.id), sql`${sessions.tokenHash} like 'presence-test-%'`));
  });

  it("applies the same agency/date filter to report wallet totals and validates dates", async () => {
    const agency = await agencyByEmail("ops@agencyb.example"), other = await agencyByEmail("ops@agencya.example");
    const actor = await userByEmail("admin@test.example");
    await adjustWallet({ agencyId: agency.id, amount: 123, actor, reason: "filtered report" });
    await adjustWallet({ agencyId: other.id, amount: 456, actor, reason: "other report" });
    const result = await reportData(parseReportFilters({ agency: agency.id }));
    expect(Number(result.walletFlow!.credits)).toBe(123);
    expect(result.byAgency.every((row) => row.agencyId === agency.id)).toBe(true);
    const empty = await reportData(parseReportFilters({ agency: agency.id, from: "2000-01-01", to: "2000-01-01" }));
    expect(Number(empty.walletFlow!.credits)).toBe(0);
    expect(() => parseReportFilters({ from: "2026-02-30" })).toThrow();
    expect(() => parseReportFilters({ from: "2026-03-01", to: "2026-02-01" })).toThrow();
  });

  it("writes French Excel CSV with BOM, separator, escaped Arabic and safe formulas while preserving numeric debits", () => {
    const csv = toCsv([{ key: "name", header: "Agence" }, { key: "amount", header: "Montant" }], [
      { name: 'وكالة; "Voyage"\nParis', amount: -80 }, { name: "=HYPERLINK(1)", amount: 10 },
    ], { locale: "fr", excel: true });
    expect(Buffer.from(csv).subarray(0, 3).toString("hex")).toBe("efbbbf");
    expect(csv).toContain('sep=;\r\nAgence;Montant\r\n"وكالة; ""Voyage""\nParis";-80');
    expect(csv).toContain('"\'=HYPERLINK(1)";10');
  });
});
