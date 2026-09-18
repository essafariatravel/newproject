import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import { applicants, applications, documents, walletTransactions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getApplicationForUser, createDraftApplication, submitApplication } from "@/lib/applications";
import { assertApplicationAccess, getDocumentForUser, uploadDocument } from "@/lib/documents";
import { getTransactions, getBalance } from "@/lib/wallet";
import { adjustWallet } from "@/lib/wallet";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";

let appAId: string;
let docAId: string;

async function setupSharedFile() {
  const staffA = await userByEmail("a-admin@test.example");
  const agencyA = await agencyByEmail("ops@agencya.example");
  const visa = (await db.execute(sql`select id from visa_types where code = 'FR-SCH-TOUR'`)).rows[0] as { id: string };
  const app = await createDraftApplication({ agencyId: agencyA.id, visaTypeId: visa.id, createdBy: staffA });
  appAId = app.id;
  await db.insert(applicants).values({
    applicationId: app.id,
    firstName: "Leila",
    lastName: "Haddad",
    dateOfBirth: "1990-01-01",
    nationality: "Moroccan",
    passportNumber: "ZZ1234567",
    passportExpiryDate: "2030-01-01",
  });
  const applicant = (await db.select().from(applicants).where(eq(applicants.applicationId, app.id)))[0]!;
  const checklist = (await db.execute(sql`select id, document_type_id from checklist_items where application_id = ${app.id} and required = true order by sort_order limit 1`)).rows[0] as { id: string; document_type_id: string };
  const doc = await uploadDocument({
    applicationId: app.id,
    actor: staffA,
    file: { name: "passport.pdf", type: "application/pdf", size: 1024, data: Buffer.from("test-document") },
    checklistItemId: checklist.id,
    applicantId: applicant.id,
  });
  docAId = doc.id;
}

describe("tenant isolation", () => {
  it("sets up an agency A file with a document", setupSharedFile);

  it("agency A can access its own application", async () => {
    const staffA = await userByEmail("a-admin@test.example");
    const row = await getApplicationForUser(appAId, staffA);
    expect(row.app.id).toBe(appAId);
  });

  it("agency B is denied agency A's application (IDOR → 404-equivalent)", async () => {
    const staffB = await userByEmail("b-admin@test.example");
    await expect(getApplicationForUser(appAId, staffB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("agency B is denied agency A's document chain", async () => {
    const staffB = await userByEmail("b-admin@test.example");
    await expect(assertApplicationAccess(appAId, staffB)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getDocumentForUser(docAId, staffB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("agency B cannot see agency A transactions or balance", async () => {
    const agencyA = await agencyByEmail("ops@agencya.example");
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staff = await userByEmail("accounting@test.example");
    await adjustWallet({ agencyId: agencyA.id, amount: 500, reason: "isolation fixture", actor: staff });
    const txA = await getTransactions(agencyA.id);
    const txB = await getTransactions(agencyB.id);
    expect(txA.length).toBeGreaterThan(0);
    expect(txB.length).toBe(0);
    // direct ledger query scoped by agency
    const all = await db.select().from(walletTransactions).where(eq(walletTransactions.agencyId, agencyB.id));
    expect(all.length).toBe(0);
    const balA = await getBalance(agencyA.id);
    const balB = await getBalance(agencyB.id);
    expect(Number(balA.balance)).toBe(500);
    expect(Number(balB.balance)).toBe(0);
  });

  it("applicant rows are only reachable through the owning application", async () => {
    const staffB = await userByEmail("b-admin@test.example");
    const applicant = (await db.select().from(applicants).where(eq(applicants.applicationId, appAId)))[0]!;
    // any applicant access goes through assertApplicationAccess(applicationId) — B is denied
    await expect(assertApplicationAccess(applicant.applicationId, staffB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("fabricated ids cannot be smuggled in (upload validates checklist membership)", async () => {
    const staffB = await userByEmail("b-admin@test.example");
    // B tries to upload into A's application with a fabricated checklist item id
    await expect(
      uploadDocument({
        applicationId: appAId,
        actor: staffB,
        file: { name: "hack.pdf", type: "application/pdf", size: 10, data: Buffer.from("x") },
        checklistItemId: "00000000-0000-0000-0000-0000000000aa",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("submission + document gate interplay", () => {
  it("agency cannot submit while required documents are missing", async () => {
    const staffA = await userByEmail("a-admin@test.example");
    await expect(submitApplication({ applicationId: appAId, actor: staffA })).rejects.toMatchObject({
      code: "CHECKLIST_INCOMPLETE",
    });
  });
});

describe("wallet service guards", () => {
  it("rejects debit below zero (non-negative constraint)", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staff = await userByEmail("accounting@test.example");
    await expect(
      adjustWallet({ agencyId: agencyB.id, amount: -10, reason: "should fail", actor: staff }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("rejects zero amounts", async () => {
    const agencyB = await agencyByEmail("ops@agencyb.example");
    const staff = await userByEmail("accounting@test.example");
    await expect(adjustWallet({ agencyId: agencyB.id, amount: 0, reason: "zero", actor: staff })).rejects.toMatchObject({
      code: "INVALID_AMOUNT",
    });
  });
});

describe("documents table direct probes", () => {
  it("document belongs to agency A's application", async () => {
    const rows = await db.select().from(documents).where(eq(documents.id, docAId));
    expect(rows[0]).toBeDefined();
    const app = (await db.select().from(applications).where(eq(applications.id, rows[0]!.applicationId)))[0]!;
    const agencyA = await agencyByEmail("ops@agencya.example");
    expect(app.agencyId).toBe(agencyA.id);
  });
});

