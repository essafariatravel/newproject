/**
 * PHASE 2.1 — Wallet statement PDF: strict own-agency authZ + ledger-derived math.
 */
import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, authUser, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { walletTransactions } from "@/db/schema";
import { buildWalletStatementPdf, getAgencyWalletStatement, parseStatementRange } from "@/lib/wallet-statement";
import { AppError } from "@/lib/types";

suiteSetup();

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function actors() {
  const superAdmin = authUser({ id: (await userByEmail("superadmin@test.example")).id, email: "superadmin@test.example", role: "SUPER_ADMIN" });
  const aAdmin = authUser({ id: (await userByEmail("a-admin@test.example")).id, email: "a-admin@test.example", role: "AGENCY_ADMIN" });
  const aUser = authUser({ id: (await userByEmail("a-user@test.example")).id, email: "a-user@test.example", role: "AGENCY_USER" });
  const bAdmin = authUser({ id: (await userByEmail("b-admin@test.example")).id, email: "b-admin@test.example", role: "AGENCY_ADMIN" });
  const agencyA = await agencyByEmail("ops@agencya.example");
  const agencyB = await agencyByEmail("ops@agencyb.example");
  return { superAdmin, aAdmin, aUser, bAdmin, agencyA, agencyB };
}

async function ledgerRow(p: {
  agencyId: string;
  amount: string;
  currency: string;
  before: string;
  after: string;
  ageDays: number;
  type?: string;
  reason?: string;
}) {
  await db.insert(walletTransactions).values({
    agencyId: p.agencyId,
    type: p.type ?? "CREDIT",
    amount: p.amount,
    currency: p.currency,
    balanceBefore: p.before,
    balanceAfter: p.after,
    reason: p.reason ?? "statement test row",
    actorId: null,
    createdAt: new Date(NOW - p.ageDays * DAY),
  });
}

describe("wallet statement — authZ (own agency only, AGENCY_ADMIN only)", () => {
  it("rejects anonymous users", async () => {
    const res = await getAgencyWalletStatement({ actor: undefined, from: "2026-08-01", to: "2026-08-31" }).catch((e) => e);
    expect((res as AppError).code).toBe("AUTH_REQUIRED");
  });

  it("rejects platform staff roles (the statement is an agency-admin tool)", async () => {
    const { superAdmin } = await actors();
    const res = await getAgencyWalletStatement({ actor: superAdmin, from: "2026-08-01", to: "2026-08-31" }).catch((e) => e);
    expect((res as AppError).code).toBe("FORBIDDEN");
  });

  it("rejects AGENCY_USER even for their own agency", async () => {
    const { aUser, agencyA } = await actors();
    const res = await getAgencyWalletStatement({ actor: { ...aUser, agencyId: agencyA.id }, from: "2026-08-01", to: "2026-08-31" }).catch((e) => e);
    expect((res as AppError).code).toBe("FORBIDDEN");
  });

  it("never honors a foreign agency id passed by the caller", async () => {
    const { aAdmin, agencyA, agencyB } = await actors();
    const res = await getAgencyWalletStatement({
      actor: { ...aAdmin, agencyId: agencyA.id },
      agencyId: agencyB.id, // cross-tenant attempt
      from: "2026-08-01",
      to: "2026-08-31",
    }).catch((e) => e);
    expect((res as AppError).code).toBe("FORBIDDEN");
  });

  it("accepts an AGENCY_ADMIN whose own agency id matches", async () => {
    const { aAdmin, agencyA } = await actors();
    const res = await getAgencyWalletStatement({ actor: { ...aAdmin, agencyId: agencyA.id }, agencyId: agencyA.id, from: "2010-01-01", to: "2010-01-02" });
    expect(res.agency.id).toBe(agencyA.id);
  });
});

describe("wallet statement — range validation", () => {
  it("rejects inverted, malformed, future and over-long ranges", () => {
    expect(() => parseStatementRange({ from: "2026-09-10", to: "2026-09-01" })).toThrowError(/'from' date/);
    expect(() => parseStatementRange({ from: "10/09/2026", to: "2026-10-01" })).toThrowError(/YYYY-MM-DD/);
    expect(() => parseStatementRange({ from: "2026-09-01", to: "2999-01-01" })).toThrowError(/future/);
    expect(() => parseStatementRange({ from: "2023-01-01", to: "2025-06-01" })).toThrowError(/400 days/);
  });

  it("clips inclusive day bounds and defaults to the last 30 days", () => {
    const r = parseStatementRange({ from: "2026-08-01", to: "2026-09-01" });
    expect(r.from.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(r.to.getUTCHours()).toBe(23);
    const d = parseStatementRange({});
    expect(Math.round((d.to.getTime() - d.from.getTime()) / DAY)).toBeGreaterThanOrEqual(30);
  });
});

describe("wallet statement — math, strictly from the ledger", () => {
  it("computes opening/credits/debits/closing per currency, excluding out-of-range rows", async () => {
    const { aAdmin, agencyA } = await actors();
    await ledgerRow({ agencyId: agencyA.id, amount: "300.00", currency: "EUR", before: "0.00", after: "300.00", ageDays: 40, reason: "old top-up" });
    await ledgerRow({ agencyId: agencyA.id, amount: "100.00", currency: "EUR", before: "300.00", after: "400.00", ageDays: 10, reason: "top-up" });
    await ledgerRow({ agencyId: agencyA.id, amount: "40.00", currency: "EUR", before: "400.00", after: "360.00", ageDays: 8, type: "APPLICATION_CHARGE", reason: "charge" });
    await ledgerRow({ agencyId: agencyA.id, amount: "55.50", currency: "DZD", before: "0.00", after: "55.50", ageDays: 6, reason: "DZD top-up" });

    const statement = await getAgencyWalletStatement({
      actor: { ...aAdmin, agencyId: agencyA.id },
      from: isoDay(new Date(NOW - 20 * DAY)),
      to: isoDay(new Date(NOW)),
    });

    // primary currency section first
    expect(statement.sections[0]!.currency).toBe("EUR");
    const eur = statement.sections.find((s) => s.currency === "EUR")!;
    expect(eur.openingBalance).toBe(300); // balance_before of first in-range row (the 20-day top-up)
    expect(eur.totalCredits).toBe(100);
    expect(eur.totalDebits).toBe(40);
    expect(eur.closingBalance).toBe(360);
    expect(eur.transactions.length).toBe(2);

    const dzd = statement.sections.find((s) => s.currency === "DZD")!;
    expect(dzd.totalCredits).toBe(55.5);
    expect(dzd.totalDebits).toBe(0);
    expect(dzd.transactions.length).toBe(1);
    // The 40-day-old row is out of range: it must not leak into totals.
    expect(statement.sections.find((s) => s.currency === "EUR")!.transactions.some((t) => t.amount === 300)).toBe(false);
  });

  it("empty periods yield zeros with opening = closing = current balance", async () => {
    const { bAdmin, agencyB } = await actors();
    const statement = await getAgencyWalletStatement({
      actor: { ...bAdmin, agencyId: agencyB.id },
      from: "2010-01-01",
      to: "2010-02-01",
    });
    expect(statement.sections.length).toBe(1);
    const s = statement.sections[0]!;
    expect(s.totalCredits).toBe(0);
    expect(s.totalDebits).toBe(0);
    expect(s.openingBalance).toBe(s.closingBalance);
    expect(s.transactions.length).toBe(0);
  });
});

describe("wallet statement — PDF", () => {
  it("produces a real PDF entirely server-side, deterministic for identical input", async () => {
    const { aAdmin, agencyA } = await actors();
    const statement = await getAgencyWalletStatement({
      actor: { ...aAdmin, agencyId: agencyA.id },
      from: isoDay(new Date(NOW - 20 * DAY)),
      to: isoDay(new Date(NOW)),
    });
    const pdf = await buildWalletStatementPdf(statement);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
    const pdf2 = await buildWalletStatementPdf(statement);
    expect(pdf2.equals(pdf)).toBe(true);
  });
});
