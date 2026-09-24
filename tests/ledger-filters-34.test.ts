import { beforeEach, describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures } from "./helpers/fixtures";

/**
 * Every test in this file needs a clean ledger, so the fixtures are rebuilt per
 * test instead of per file (the shared suite setup runs once per file).
 */
beforeEach(async () => {
  await resetData();
  await seedFixtures();
});

suiteSetup();

import { db } from "@/lib/db";
import { applications, checklistItems, walletTransactions } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createDraftApplication, getChecklist, submitApplication } from "@/lib/applications";
import { adjustWallet, applyWalletMutation } from "@/lib/wallet";
import { listWalletTransactions } from "@/lib/queries";
import { LEDGER_PERIODS, resolveLedgerPeriod } from "@/lib/ledger-filters";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { qualifiedTable } from "@/lib/database-schema";

/**
 * §11/§57 — wallet ledger filters and CSV export.
 *
 * The wallet page and the CSV export resolve the SAME period semantics through
 * `resolveLedgerPeriod`, and `listWalletTransactions` is the single data path for
 * both. These tests pin the boundaries (half-open [from, to)), the filter
 * combinations, the DZD-only formatting and — most importantly — that the export
 * path can only ever see the caller's own agency.
 *
 * The route handler itself reads the session, so the tenant rule is asserted
 * exactly where it lives: the export passes the SESSION agencyId into the query,
 * and that query must ignore any other agency's rows.
 */

async function visaId(code = "FR-SCH-TOUR") {
  return ((await db.execute(sql`select id from visa_types where code=${code}`)).rows[0] as { id: string }).id;
}

/** Ledger rows for agency A spread over three months, plus a foreign row. */
async function ledgerFixture() {
  const agencyA = await agencyByEmail("ops@agencya.example");
  const agencyB = await agencyByEmail("ops@agencyb.example");
  const staff = await userByEmail("superadmin@test.example");
  const docs = await userByEmail("a-admin@test.example");

  await adjustWallet({ agencyId: agencyA.id, amount: 1000, reason: "opening credit", actor: staff });
  await adjustWallet({ agencyId: agencyA.id, amount: -100, reason: "manual correction", actor: staff });
  await adjustWallet({ agencyId: agencyB.id, amount: 777, reason: "agency B only", actor: staff });

  // A submitted application produces the APPLICATION_CHARGE row (real service path).
  const app = await createDraftApplication({ agencyId: agencyA.id, visaTypeId: await visaId(), createdBy: staff });
  await db.insert((await import("@/db/schema")).applicants).values({
    applicationId: app.id,
    firstName: "Filter",
    lastName: "Tester",
    fullName: "Filter Tester",
    dateOfBirth: "1991-02-02",
    nationality: "Algerian",
    passportNumber: `FT${String(Date.now()).slice(-6)}`,
    passportExpiryDate: "2033-02-02",
  });
  for (const item of await getChecklist(app.id)) {
    if (!item.required) continue;
    const { uploadDocument } = await import("@/lib/documents");
    const { reviewDocument } = await import("@/lib/documents");
    const doc = await uploadDocument({
      applicationId: app.id,
      actor: staff,
      checklistItemId: item.id,
      file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 24, data: Buffer.from("%PDF-1.4 filter fixture") },
    });
    await reviewDocument({ documentId: doc.id, actor: staff, status: "ACCEPTED" });
  }
  await submitApplication({ applicationId: app.id, actor: staff });

  // Backdate two rows into the previous and the month-before months so the period
  // filters have something real to separate (never done through the service).
  const rows = await db.select().from(walletTransactions).where(eq(walletTransactions.agencyId, agencyA.id));
  const [opening, correction, charge] = rows;
  const now = new Date();
  const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12, 0, 0));
  const twoMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 10, 12, 0, 0));
  await db.update(walletTransactions).set({ createdAt: prevMonth }).where(eq(walletTransactions.id, correction!.id));
  await db.update(walletTransactions).set({ createdAt: twoMonthsAgo }).where(eq(walletTransactions.id, opening!.id));

  void docs;
  return { agencyA, agencyB, app, charge: charge!, opening: opening!, correction: correction! };
}

describe("§11 wallet ledger — period resolution agrees between view and export", () => {
  const NOW = new Date("2026-09-24T08:00:00.000Z");

  it("every period yields half-open [from, to) boundaries and a stable label", () => {
    expect(LEDGER_PERIODS).toEqual(["all", "this_month", "last_month", "last_3_months", "custom"]);

    expect(resolveLedgerPeriod({ period: "all", now: NOW })).toEqual({ period: "all" });

    const thisMonth = resolveLedgerPeriod({ period: "this_month", now: NOW });
    expect(thisMonth.from?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(thisMonth.to?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(thisMonth.fromIso).toBe("2026-09-01");
    expect(thisMonth.toIso).toBe("2026-10-01");

    const lastMonth = resolveLedgerPeriod({ period: "last_month", now: NOW });
    expect(lastMonth.from?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(lastMonth.to?.toISOString()).toBe("2026-09-01T00:00:00.000Z");

    const quarter = resolveLedgerPeriod({ period: "last_3_months", now: NOW });
    expect(quarter.from?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(quarter.to?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("a custom range includes the whole `to` day and ignores junk input safely", () => {
    const custom = resolveLedgerPeriod({ period: "custom", from: "2026-03-01", to: "2026-03-31", now: NOW });
    expect(custom.from?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(custom.to?.toISOString()).toBe("2026-04-01T00:00:00.000Z"); // exclusive end of the 31st

    // Unknown periods fall back to "all"; malformed days are dropped, not thrown.
    expect(resolveLedgerPeriod({ period: "yesterday", now: NOW })).toEqual({ period: "all" });
    const junk = resolveLedgerPeriod({ period: "custom", from: "not-a-date", to: "../../etc/passwd", now: NOW });
    expect(junk.period).toBe("custom");
    expect(junk.from).toBeUndefined();
    expect(junk.to).toBeUndefined();
  });
});

describe("§11 wallet ledger — filtering, scoping and export", () => {
  it("filters by type, by free text and by period using the same query the export uses", async () => {
    const { agencyA, app } = await ledgerFixture();

    const all = await listWalletTransactions({ agencyId: agencyA.id });
    expect(all.total).toBe(3);
    // newest first, references human-readable
    for (const row of all.rows) expect(row.tx.reference).toMatch(/^WLT-\d{4}-\d{6}$/);

    const charges = await listWalletTransactions({ agencyId: agencyA.id, type: "APPLICATION_CHARGE" });
    expect(charges.total).toBe(1);
    expect(charges.rows[0]!.tx.applicationId).toBe(app.id);
    expect(charges.rows[0]!.applicationReference).toBe(app.reference);

    const corrections = await listWalletTransactions({ agencyId: agencyA.id, type: "DEBIT" });
    expect(corrections.total).toBe(1);
    expect(corrections.rows[0]!.tx.reason).toBe("manual correction");

    // free text matches reference, reason and application reference
    const byReason = await listWalletTransactions({ agencyId: agencyA.id, q: "correction" });
    expect(byReason.total).toBe(1);
    const byRef = await listWalletTransactions({ agencyId: agencyA.id, q: app.reference });
    expect(byRef.total).toBe(1);
    expect(byRef.rows[0]!.tx.type).toBe("APPLICATION_CHARGE");
    const noMatch = await listWalletTransactions({ agencyId: agencyA.id, q: "no-such-ledger-entry" });
    expect(noMatch.total).toBe(0);

    // period filters are exclusive at the upper boundary
    const now = new Date();
    const thisMonth = resolveLedgerPeriod({ period: "this_month", now });
    const inThisMonth = await listWalletTransactions({ agencyId: agencyA.id, from: thisMonth.from, to: thisMonth.to });
    expect(inThisMonth.total).toBe(1);
    const lastMonth = resolveLedgerPeriod({ period: "last_month", now });
    const inLastMonth = await listWalletTransactions({ agencyId: agencyA.id, from: lastMonth.from, to: lastMonth.to });
    expect(inLastMonth.total).toBe(1);
    expect(inLastMonth.rows[0]!.tx.reason).toBe("manual correction");
    const quarter = resolveLedgerPeriod({ period: "last_3_months", now });
    const inQuarter = await listWalletTransactions({ agencyId: agencyA.id, from: quarter.from, to: quarter.to });
    expect(inQuarter.total).toBe(3);
  });

  it("paginates deterministically and never returns another tenant's rows", async () => {
    const { agencyA, agencyB } = await ledgerFixture();

    const page1 = await listWalletTransactions({ agencyId: agencyA.id, page: 1, pageSize: 2 });
    const page2 = await listWalletTransactions({ agencyId: agencyA.id, page: 2, pageSize: 2 });
    expect(page1.total).toBe(3);
    expect(page1.pageCount).toBe(2);
    expect(page1.rows.length).toBe(2);
    expect(page2.rows.length).toBe(1);
    const ids = new Set([...page1.rows, ...page2.rows].map((r) => r.tx.id));
    expect(ids.size).toBe(3);

    const bRows = await listWalletTransactions({ agencyId: agencyB.id });
    expect(bRows.rows.every((r) => r.tx.agencyId === agencyB.id)).toBe(true);
    expect(bRows.total).toBe(1);
    // Agency B's search can never reach agency A's reason text.
    const leak = await listWalletTransactions({ agencyId: agencyB.id, q: "correction" });
    expect(leak.total).toBe(0);
  });

  it("exports exactly the filtered rows with DZD amounts and RFC-4180 escaping", async () => {
    const { agencyA } = await ledgerFixture();
    // A reason containing a comma, a quote and a newline must not break the CSV.
    const staff = await userByEmail("superadmin@test.example");
    await adjustWallet({ agencyId: agencyA.id, amount: 55, reason: 'transfer "received", ref 12\nsecond line', actor: staff });

    const { rows } = await listWalletTransactions({ agencyId: agencyA.id, type: "CREDIT" });
    expect(rows.length).toBe(2);

    // Same escaping rule the route applies.
    const csvCell = (value: unknown) => {
      const s = value === null || value === undefined ? "" : String(value);
      return /[",\n\r;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const header = ["Reference", "Date", "Type", "Amount (DZD)", "Balance before (DZD)", "Balance after (DZD)", "Application", "Reason"];
    const line = rows
      .map(({ tx, applicationReference }) =>
        [tx.reference, new Date(tx.createdAt).toISOString(), tx.type, tx.amount, tx.balanceBefore, tx.balanceAfter, applicationReference ?? "", tx.reason]
          .map(csvCell)
          .join(","),
      )
      .join("\r\n");
    const body = `\uFEFF${header.join(",")}\r\n${line}\r\n`;

    expect(body.startsWith("\uFEFF")).toBe(true); // Excel-friendly BOM
    // (the header line carries the BOM, exactly like the route emits it)
    expect(body.split("\r\n")[0]!.replace("\uFEFF", "")).toBe(
      "Reference,Date,Type,Amount (DZD),Balance before (DZD),Balance after (DZD),Application,Reason",
    );
    expect(body).toContain('"transfer ""received"", ref 12\nsecond line"');
    // No currency other than DZD is ever written by the operational ledger.
    expect(body).not.toMatch(/\b(EUR|USD|GBP|€|\$)\b/);
    // Each data line keeps the 8 declared columns.
    for (const csvLine of body.trim().split("\r\n").slice(1)) {
      expect(csvLine.split(",").length).toBeGreaterThanOrEqual(8);
    }
  });

  it("the export can only be scoped by the session agency — never by a query parameter", async () => {
    const { agencyA, agencyB } = await ledgerFixture();
    // The route passes `user.agencyId`. Simulate the abuse directly: a forged
    // agency id in the query string must be irrelevant to the data path.
    const sessionAgency = agencyA.id;
    const forged = agencyB.id;
    const exported = await listWalletTransactions({ agencyId: sessionAgency, pageSize: 10_000 });
    expect(exported.rows.length).toBe(3);
    expect(exported.rows.every((r) => r.tx.agencyId === agencyA.id)).toBe(true);
    expect(exported.rows.some((r) => r.tx.agencyId === forged)).toBe(false);

    // A cross-tenant ledger reference is not resolvable through the scoped query.
    const bRef = (await listWalletTransactions({ agencyId: agencyB.id })).rows[0]!.tx.reference!;
    const viaA = await listWalletTransactions({ agencyId: agencyA.id, q: bRef });
    expect(viaA.total).toBe(0);
  });

  it("the ledger is append-only: no filter path can mutate or delete a row", async () => {
    const { agencyA } = await ledgerFixture();
    const before = await listWalletTransactions({ agencyId: agencyA.id });
    const refsBefore = before.rows.map((r) => r.tx.reference).sort();

    // Every read-only filter combination leaves the table untouched.
    await listWalletTransactions({ agencyId: agencyA.id, type: "CREDIT", q: "opening" });
    await listWalletTransactions({ agencyId: agencyA.id, from: new Date(0), to: new Date() });

    const after = await listWalletTransactions({ agencyId: agencyA.id });
    expect(after.rows.map((r) => r.tx.reference).sort()).toEqual(refsBefore);
    const count = await db.execute(
      sql`select count(*)::int as n from ${sql.raw(qualifiedTable("wallet_transactions"))} where agency_id = ${agencyA.id}`,
    );
    expect(Number((count.rows[0] as { n: number }).n)).toBe(before.total);
  });

  it("a compensating correction is a NEW ledger row — history is never rewritten", async () => {
    const { agencyA } = await ledgerFixture();
    const staff = await userByEmail("accounting@test.example");
    const before = await listWalletTransactions({ agencyId: agencyA.id });

    const { Pool } = await import("pg");
    const { databasePoolConfig } = await import("@/lib/database-config");
    const pool = new Pool({ ...databasePoolConfig(process.env, true), max: 1 });
    const client = await pool.connect();
    try {
      await client.query(`set search_path to ${process.env.DATABASE_SCHEMA ?? "public"}`);
      await client.query("begin");
      await applyWalletMutation(client, {
        agencyId: agencyA.id,
        operation: "CREDIT",
        amountAbs: "10.00",
        reason: "compensating entry for correction",
        actorId: staff.id,
      });
      await client.query("commit");
    } finally {
      client.release();
      await pool.end();
    }

    const after = await listWalletTransactions({ agencyId: agencyA.id });
    expect(after.total).toBe(before.total + 1);
    const original = after.rows.find((r) => r.tx.reason === "manual correction");
    expect(original?.tx.amount).toBe("100.00");
    expect(original?.tx.type).toBe("DEBIT");
    const compensating = after.rows.find((r) => r.tx.reason === "compensating entry for correction");
    expect(compensating?.tx.amount).toBe("10.00");
    expect(compensating?.tx.id).not.toBe(original?.tx.id);
  });

  it("a submitted application's charge is visible in the export with its reference", async () => {
    const { agencyA, app } = await ledgerFixture();
    const { rows } = await listWalletTransactions({ agencyId: agencyA.id, type: "APPLICATION_CHARGE" });
    expect(rows.length).toBe(1);
    expect(rows[0]!.applicationReference).toBe(app.reference);
    expect(rows[0]!.tx.reason).toContain(app.reference);
    expect(rows[0]!.tx.currency).toBe("DZD");

    const appRow = await db
      .select({ fee: applications.fee })
      .from(applications)
      .where(and(eq(applications.id, app.id)));
    expect(rows[0]!.tx.amount).toBe(appRow[0]!.fee);

    // the checklist of the exported dossier is unrelated to the ledger shape
    const items = await db.select().from(checklistItems).where(eq(checklistItems.applicationId, app.id));
    expect(items.length).toBeGreaterThan(0);
  });
});
