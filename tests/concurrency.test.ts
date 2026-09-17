import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db, pool } from "@/lib/db";
import { applicants as applicantsTb, applications, checklistItems, walletTransactions, agencies } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { createDraftApplication, getStatusByCode, submitApplication } from "@/lib/applications";
import { uploadDocument } from "@/lib/documents";
import { adjustWallet } from "@/lib/wallet";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";

async function visaId() {
  return ((await db.execute(sql`select id from visa_types where code='JP-BUS'`)).rows[0] as { id: string }).id; // 80 USD
}

async function makeSubmittableApp(agencyId: string, createdBy: ReturnType<typeof Object>): Promise<string> {
  const staff = createdBy as never;
  const app = await createDraftApplication({ agencyId, visaTypeId: await visaId(), createdBy: staff });
  await db.insert(applicantsTb).values({
    applicationId: app.id,
    firstName: "Conc",
    lastName: "Currency",
    dateOfBirth: "1990-01-01",
    nationality: "Japanese",
    passportNumber: `JP${Math.floor(Math.random() * 10000000)}`,
    passportExpiryDate: "2033-01-01",
  });
  const required = await db
    .select()
    .from(checklistItems)
    .where(sql`${checklistItems.applicationId} = ${app.id} and ${checklistItems.required} = true`);
  for (const item of required) {
    await uploadDocument({
      applicationId: app.id,
      actor: staff,
      file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 512, data: Buffer.from("d") },
      checklistItemId: item.id,
    });
  }
  return app.id;
}

describe("wallet concurrency against real PostgreSQL", () => {
  it("two simultaneous 80 USD charges against a 100 USD balance: exactly one succeeds", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");
    await adjustWallet({ agencyId: agency.id, amount: 100, reason: "concurrency fixture", actor: superAdmin });

    const app1 = await makeSubmittableApp(agency.id, staffB);
    const app2 = await makeSubmittableApp(agency.id, staffB);

    const results = await Promise.allSettled([
      submitApplication({ applicationId: app1, actor: staffB }),
      submitApplication({ applicationId: app2, actor: staffB }),
    ]);
    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(Error);

    const bal = (await db.select().from(agencies).where(eq(agencies.id, agency.id)))[0]!;
    expect(bal.balance).toBe("20.00");
  });

  it("N=10 parallel submissions cannot overdraw a limited wallet", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");
    const startBalance = Number(agency.balance);
    // fund exactly 4 x 80 = 320
    const funded = 320;
    await adjustWallet({ agencyId: agency.id, amount: funded, reason: "overdraw fixture", actor: superAdmin });

    const apps: string[] = [];
    for (let i = 0; i < 10; i++) {
      apps.push(await makeSubmittableApp(agency.id, staffB));
    }
    const results = await Promise.allSettled(
      apps.map((id) => submitApplication({ applicationId: id, actor: staffB })),
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    expect(succeeded).toBe(4); // 320 / 80 — never more

    const charges = await db
      .select({ total: sql<string>`sum(${walletTransactions.amount})` })
      .from(walletTransactions)
      .where(eq(walletTransactions.agencyId, agency.id));
    const bal = (await db.select().from(agencies).where(eq(agencies.id, agency.id)))[0]!;
    expect(Number(bal.balance)).toBeGreaterThanOrEqual(0);
    // final balance = pre-test balance + topup − exactly the successful charges
    expect(bal.balance).toBe((startBalance + funded - succeeded * 80).toFixed(2));
    void charges;
  });

  it("duplicate concurrent submission of the SAME application charges exactly once", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");
    await adjustWallet({ agencyId: agency.id, amount: 1000, reason: "double-submit fixture", actor: superAdmin });

    const appId = await makeSubmittableApp(agency.id, staffB);
    const draft = await getStatusByCode("DRAFT");

    const results = await Promise.allSettled([
      submitApplication({ applicationId: appId, actor: staffB }),
      submitApplication({ applicationId: appId, actor: staffB }),
      submitApplication({ applicationId: appId, actor: staffB }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok.length).toBe(1);

    const charges = await db
      .select()
      .from(walletTransactions)
      .where(sql`${walletTransactions.applicationId} = ${appId} and ${walletTransactions.type} = 'APPLICATION_CHARGE'`);
    expect(charges.length).toBe(1);
    expect(Number(charges[0]!.amount)).toBe(80);

    const appRow = (await db.select().from(applications).where(eq(applications.id, appId)))[0]!;
    expect(appRow.statusId).not.toBe(draft.id);
  });

  it("raw row-level locking serializes direct balance updates", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    await adjustWallet({
      agencyId: agency.id,
      amount: -Number((await db.select().from(agencies).where(eq(agencies.id, agency.id)))[0]!.balance) + 100,
      reason: "normalize to 100",
      actor: await userByEmail("accounting@test.example"),
    });
    const [r1, r2] = await Promise.all([
      pool.query(`update agencies set balance = balance - 70 where id = $1 and balance >= 70 returning balance`, [agency.id]),
      pool.query(`update agencies set balance = balance - 70 where id = $1 and balance >= 70 returning balance`, [agency.id]),
    ]);
    const wins = (r1.rowCount ?? 0) + (r2.rowCount ?? 0);
    expect(wins).toBe(1);
    const bal = (await db.select().from(agencies).where(eq(agencies.id, agency.id)))[0]!;
    expect(bal.balance).toBe("30.00");
  });
});
