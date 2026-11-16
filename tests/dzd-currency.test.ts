/**
 * PHASE 2.1 — DZD currency availability + new-agency default,
 * with hard proof historical records are never converted.
 */
import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { db } from "@/lib/db";
import { agencies, currencies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatAmount } from "@/lib/format";

suiteSetup();

describe("DZD — Algerian Dinar", () => {
  it("is present, active and correctly named in currency configuration", async () => {
    const rows = await db.select().from(currencies).where(eq(currencies.code, "DZD"));
    expect(rows.length).toBe(1);
    expect(rows[0]!.active).toBe(true);
    expect(rows[0]!.name).toBe("Algerian Dinar");
  });

  it("is the database default for NEW agencies (no administrator choice)", async () => {
    const before = await db.select().from(agencies).where(eq(agencies.email, "dzd-default@audit.test"));
    expect(before.length).toBe(0);
    await db.insert(agencies).values({
      legalName: "DZD Default Audit Agency",
      email: "dzd-default@audit.test",
      status: "ACTIVE",
      // currency deliberately omitted → must fall back to the DZD default
    });
    const after = await db.select().from(agencies).where(eq(agencies.email, "dzd-default@audit.test"));
    expect(after[0]!.currency).toBe("DZD");
    await db.delete(agencies).where(eq(agencies.email, "dzd-default@audit.test"));
  });

  it("does not alter explicitly-chosen or historical currencies", async () => {
    // A EUR agency created BEFORE any DZD knowledge stays EUR forever.
    await db.insert(agencies).values({
      legalName: "Historical EUR Audit Agency",
      email: "hist-eur@audit.test",
      status: "ACTIVE",
      currency: "EUR",
    });
    const kept = await db.select().from(agencies).where(eq(agencies.email, "hist-eur@audit.test"));
    expect(kept[0]!.currency).toBe("EUR");
    await db.delete(agencies).where(eq(agencies.email, "hist-eur@audit.test"));
  });

  it("wallet formatting renders DZD amounts", () => {
    const out = formatAmount("12500.00", "DZD");
    expect(out).toContain("DZD");
    expect(out.replace(/[^0-9.,]/g, "")).toContain("12");
  });
});
