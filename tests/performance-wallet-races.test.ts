import { and, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { agencies, applicants, checklistItems, walletTransactions } from "@/db/schema";
import { createDraftApplication, submitApplication } from "@/lib/applications";
import { uploadDocument } from "@/lib/documents";
import { adjustWallet } from "@/lib/wallet";

suiteSetup();

async function visaId(): Promise<string> {
  const row = (await db.execute(sql`select id from visa_types where code='JP-BUS' limit 1`)).rows[0] as
    | { id: string }
    | undefined;
  if (!row) throw new Error("JP-BUS fixture is missing.");
  return row.id;
}

async function makeSubmittableApp(
  agencyId: string,
  actor: Awaited<ReturnType<typeof userByEmail>>,
  serial: number,
): Promise<{ id: string; fee: number }> {
  const app = await createDraftApplication({ agencyId, visaTypeId: await visaId(), createdBy: actor });
  await db.insert(applicants).values({
    applicationId: app.id,
    firstName: "PERF",
    lastName: `Race${serial}`,
    dateOfBirth: "1990-01-01",
    nationality: "Algerian",
    passportNumber: `PFR${String(serial).padStart(7, "0")}`,
    passportExpiryDate: "2033-01-01",
  });

  const required = await db
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.applicationId, app.id), eq(checklistItems.required, true)));

  for (const item of required) {
    await uploadDocument({
      applicationId: app.id,
      actor,
      checklistItemId: item.id,
      file: {
        name: `${item.documentTypeCode}.pdf`,
        type: "application/pdf",
        size: 512,
        data: Buffer.from("%PDF-1.4 performance race fixture"),
      },
    });
  }

  return { id: app.id, fee: Number(app.fee) };
}

async function setWalletBalance(
  agencyId: string,
  amount: number,
  actor: Awaited<ReturnType<typeof userByEmail>>,
) {
  const current = Number((await db.select({ balance: agencies.balance }).from(agencies).where(eq(agencies.id, agencyId)))[0]!.balance);
  if (current > 0) {
    await adjustWallet({
      agencyId,
      amount: -current,
      reason: "PERF normalize wallet before race",
      actor,
    });
  }
  if (amount > 0) {
    await adjustWallet({
      agencyId,
      amount,
      reason: "PERF fund wallet for race",
      actor,
    });
  }
}

describe("performance-gate wallet race invariants", () => {
  it("50 identical concurrent submission attempts produce exactly one charge", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const agencyUser = await userByEmail("b-admin@test.example");
    const accounting = await userByEmail("accounting@test.example");
    const app = await makeSubmittableApp(agency.id, agencyUser, 1);
    expect(app.fee).toBeGreaterThan(0);
    await setWalletBalance(agency.id, app.fee * 2, accounting);

    const outcomes = await Promise.allSettled(
      Array.from({ length: 50 }, () => submitApplication({ applicationId: app.id, actor: agencyUser })),
    );
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);

    const charges = await db
      .select()
      .from(walletTransactions)
      .where(and(
        eq(walletTransactions.applicationId, app.id),
        eq(walletTransactions.type, "APPLICATION_CHARGE"),
      ));
    expect(charges).toHaveLength(1);
    expect(Number(charges[0]!.balanceAfter)).toBeGreaterThanOrEqual(0);
    expect(Number(charges[0]!.balanceBefore) - Number(charges[0]!.amount)).toBeCloseTo(
      Number(charges[0]!.balanceAfter),
      2,
    );
  }, 60_000);

  it("50 distinct concurrent submissions against funds for 10 allow exactly 10 debits and never go negative", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const agencyUser = await userByEmail("b-admin@test.example");
    const accounting = await userByEmail("accounting@test.example");

    const apps: Array<{ id: string; fee: number }> = [];
    for (let i = 0; i < 50; i++) apps.push(await makeSubmittableApp(agency.id, agencyUser, i + 100));
    const fee = apps[0]!.fee;
    expect(fee).toBeGreaterThan(0);
    expect(apps.every((app) => app.fee === fee)).toBe(true);

    await setWalletBalance(agency.id, fee * 10, accounting);

    const outcomes = await Promise.allSettled(
      apps.map((app) => submitApplication({ applicationId: app.id, actor: agencyUser })),
    );
    const successful = outcomes.filter((result) => result.status === "fulfilled");
    expect(successful).toHaveLength(10);

    const applicationIds = apps.map((app) => app.id);
    const charges = await db
      .select()
      .from(walletTransactions)
      .where(and(
        inArray(walletTransactions.applicationId, applicationIds),
        eq(walletTransactions.type, "APPLICATION_CHARGE"),
      ));

    expect(charges).toHaveLength(10);
    expect(new Set(charges.map((charge) => charge.applicationId)).size).toBe(10);
    for (const charge of charges) {
      expect(Number(charge.balanceAfter)).toBeGreaterThanOrEqual(0);
      expect(Number(charge.balanceBefore) - Number(charge.amount)).toBeCloseTo(Number(charge.balanceAfter), 2);
    }

    const finalBalance = Number(
      (await db.select({ balance: agencies.balance }).from(agencies).where(eq(agencies.id, agency.id)))[0]!.balance,
    );
    expect(finalBalance).toBeCloseTo(0, 2);
  }, 120_000);
});
