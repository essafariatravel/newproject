import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import { applications, checklistItems, documents, walletTransactions } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { REQUEST_VALIDATION_CODES, submitVisaRequest } from "@/lib/requests";
import { MAX_UPLOAD_BYTES } from "@/lib/types";
import { adjustWallet } from "@/lib/wallet";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";

let funded = false;
async function ensureFunds() {
  if (funded) return;
  const agency = await agencyByEmail("ops@agencyb.example");
  const superAdmin = await userByEmail("admin@test.example");
  await adjustWallet({ agencyId: agency.id, amount: 500000, reason: "request-23 test funding", actor: superAdmin });
  funded = true;
}

async function visaId(code = "JP-BUS") {
  return ((await db.execute(sql`select id from visa_types where code = ${code}`)).rows[0] as { id: string }).id;
}

async function requirementTypeIds(vId: string) {
  const rows = (await db.execute(
    sql`select vr.document_type_id as id, vr.required from visa_requirements vr
        join document_types dt on dt.id = vr.document_type_id
        where vr.visa_type_id = ${vId} and vr.active and dt.active order by vr.sort_order`,
  )).rows as { id: string; required: boolean }[];
  return rows;
}

function doc(typeId: string, name = "scan.pdf", size = 2048) {
  return { documentTypeId: typeId, file: { name, type: "application/pdf", size, data: Buffer.alloc(size, 1) } };
}

function traveller() {
  return {
    firstName: "Amine", lastName: "Bekkali", dateOfBirth: "1990-05-14",
    nationality: "Algerian", passportNumber: "DZ1234567",
    passportIssueDate: "2021-01-10", passportExpiryDate: "2031-01-09",
    email: null, phone: null,
  };
}

async function baseInput(key: string) {
  await ensureFunds();
  const agency = await agencyByEmail("ops@agencyb.example");
  const actor = await userByEmail("b-admin@test.example");
  const vId = await visaId();
  const reqs = await requirementTypeIds(vId);
  return {
    agency, actor, vId, reqs,
    input: {
      actor,
      idempotencyKey: key,
      visaTypeId: vId,
      priorityCode: "STANDARD",
      agencyNotes: "Group trip in October.",
      travellers: [traveller()],
      documents: reqs.map((r) => doc(r.id)),
      ipAddress: null,
    },
  };
}

describe("Phase 2.3 — atomic 3-step visa request submission", () => {
  it("exposes the enumerated validation codes (17, stable identifiers)", () => {
    expect(REQUEST_VALIDATION_CODES).toHaveLength(17);
    expect(new Set(REQUEST_VALIDATION_CODES).size).toBe(17);
    expect(REQUEST_VALIDATION_CODES).toContain("REQUIRED_DOCUMENT_MISSING");
    expect(REQUEST_VALIDATION_CODES).toContain("FILE_TOO_LARGE");
  });

  it("happy path creates ONE application in SUBMITTED with checklist, applicant, documents and a single wallet charge", async () => {
    const { input } = await baseInput(crypto.randomUUID());
    const result = await submitVisaRequest(input);
    expect(result.reused).toBe(false);
    expect(result.reference).toMatch(/^EVT-\d{2}-[A-Z2-9]{8}$/);

    const rows = await db.execute(sql`
      select a.reference, s.code as status, a.submitted_at is not null as submitted,
             a.submitted_price::text as submitted_price,
             (select count(*)::int from checklist_items ci where ci.application_id = a.id) as checklist,
             (select count(*)::int from applicants ap where ap.application_id = a.id) as applicants,
             (select count(*)::int from documents d where d.application_id = a.id) as documents,
             (select count(*)::int from wallet_transactions wt where wt.application_id = a.id and wt.type = 'APPLICATION_CHARGE') as charges
        from applications a join statuses s on s.id = a.status_id where a.id = ${result.applicationId}`);
    const row = rows.rows[0] as Record<string, unknown>;
    expect(row.status).toBe("SUBMITTED");
    expect(row.submitted).toBe(true);
    expect(row.submitted_price).not.toBeNull();
    expect(row.checklist).toBeGreaterThan(0);
    expect(row.applicants).toBe(1);
    expect(row.documents).toBe(row.checklist);
    expect(row.charges).toBe(1);

    // document rows carry a storage key + blob was written (db provider default)
    const bucketDoc = (await db.select().from(documents).where(eq(documents.applicationId, result.applicationId)))[0]!;
    expect(bucketDoc.storageKey).toContain(result.applicationId);
    expect(bucketDoc.sizeBytes).toBe(2048);
  });

  it("idempotent replay: same idempotency key returns the same application and never charges twice", async () => {
    const key = crypto.randomUUID();
    const { agency, input } = await baseInput(key);
    const first = await submitVisaRequest(input);
    const before = (await db.execute(sql`select balance::text as b from agencies where id = ${agency.id}`)).rows[0] as { b: string };
    const second = await submitVisaRequest(input);
    const third = await submitVisaRequest(input);
    expect(second.reused).toBe(true);
    expect(second.applicationId).toBe(first.applicationId);
    expect(third.applicationId).toBe(first.applicationId);
    const after = (await db.execute(sql`select balance::text as b from agencies where id = ${agency.id}`)).rows[0] as { b: string };
    expect(after.b).toBe(before.b); // replays never move the wallet
    const charges = await db
      .select()
      .from(walletTransactions)
      .where(and(eq(walletTransactions.applicationId, first.applicationId), eq(walletTransactions.type, "APPLICATION_CHARGE")));
    expect(charges).toHaveLength(1);
  });

  it("enforces the enumerated validations server-side", async () => {
    const { input } = await baseInput(crypto.randomUUID());

    await expect(submitVisaRequest({ ...input, idempotencyKey: "" })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    await expect(submitVisaRequest({ ...input, visaTypeId: crypto.randomUUID() })).rejects.toMatchObject({ code: "VISA_TYPE_INVALID" });
    await expect(submitVisaRequest({ ...input, priorityCode: "NOPE" })).rejects.toMatchObject({ code: "PRIORITY_INVALID" });
    await expect(submitVisaRequest({ ...input, travellers: [] })).rejects.toMatchObject({ code: "TRAVELLER_REQUIRED" });
    await expect(submitVisaRequest({ ...input, travellers: [{ ...traveller(), firstName: "" }] })).rejects.toMatchObject({ code: "TRAVELLER_NAME" });
    await expect(submitVisaRequest({ ...input, travellers: [{ ...traveller(), dateOfBirth: "2999-01-01" }] })).rejects.toMatchObject({ code: "TRAVELLER_BIRTH_DATE" });
    await expect(submitVisaRequest({ ...input, travellers: [{ ...traveller(), passportNumber: "!!" }] })).rejects.toMatchObject({ code: "TRAVELLER_PASSPORT" });
    await expect(submitVisaRequest({ ...input, travellers: [{ ...traveller(), passportExpiryDate: "2020-01-01" }] })).rejects.toMatchObject({ code: "TRAVELLER_PASSPORT_EXPIRY" });
    await expect(submitVisaRequest({ ...input, agencyNotes: "x".repeat(1200) })).rejects.toMatchObject({ code: "NOTES_TOO_LONG" });
  });

  it("rejects missing REQUIRED documents, oversized files, empty files and bad types — before the wallet is touched", async () => {
    const { agency, input, reqs } = await baseInput(crypto.randomUUID());
    const firstRequired = reqs.find((r) => r.required)!;
    const before = (await db.execute(sql`select balance::text as b from agencies where id = ${agency.id}`)).rows[0] as { b: string };

    await expect(
      submitVisaRequest({ ...input, documents: input.documents.filter((d) => d.documentTypeId !== firstRequired.id) }),
    ).rejects.toMatchObject({ code: "REQUIRED_DOCUMENT_MISSING" });

    const hugeSet = input.documents.map((d) =>
      d.documentTypeId === reqs[0]!.id ? doc(reqs[0]!.id, "huge.pdf", MAX_UPLOAD_BYTES + 1) : d,
    );
    await expect(
      submitVisaRequest({ ...input, documents: hugeSet }),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });

    const emptySet = input.documents.map((d, idx) =>
      idx === 0 ? { ...d, file: { ...d.file, size: 0, data: Buffer.alloc(0) } } : d,
    );
    await expect(
      submitVisaRequest({ ...input, documents: emptySet }),
    ).rejects.toMatchObject({ code: "EMPTY_FILE" });

    const exeSet = input.documents.map((d) =>
      d.documentTypeId === reqs[0]!.id
        ? { documentTypeId: reqs[0]!.id, file: { name: "x.exe", type: "application/x-msdownload", size: 100, data: Buffer.alloc(100) } }
        : d,
    );
    await expect(
      submitVisaRequest({ ...input, documents: exeSet }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });

    const after = (await db.execute(sql`select balance::text as b from agencies where id = ${agency.id}`)).rows[0] as { b: string };
    expect(after.b).toBe(before.b);
  });

  it("2 MB cap is the single platform constant (portal + registration + staff)", () => {
    expect(MAX_UPLOAD_BYTES).toBe(2 * 1024 * 1024);
    const src = readFileSync("src/lib/types.ts", "utf8");
    expect(src).toContain("MAX_UPLOAD_BYTES = 2 * 1024 * 1024");
  });

  it("the 3-step flow never leaves a DRAFT behind (application is SUBMITTED from insert)", async () => {
    const { input } = await baseInput(crypto.randomUUID());
    const result = await submitVisaRequest(input);
    const appRows = await db.select().from(applications).where(eq(applications.id, result.applicationId));
    const draft = await db.execute(sql`select id from statuses where code = 'DRAFT'`);
    expect(appRows[0]!.statusId).not.toBe((draft.rows[0] as { id: string }).id);
    const hist = await db.execute(sql`select from_status_id, to_status_id from application_status_history where application_id = ${result.applicationId}`);
    expect((hist.rows[0] as Record<string, unknown>).from_status_id).toBeNull();
  });

  it("checklist snapshot comes from the visa-type requirement config (rectification 9)", async () => {
    const { input, reqs } = await baseInput(crypto.randomUUID());
    const result = await submitVisaRequest(input);
    const items = await db.select().from(checklistItems).where(eq(checklistItems.applicationId, result.applicationId));
    expect(items.length).toBe(reqs.length);
    for (const item of items) {
      const src = reqs.find((r) => r.id === item.documentTypeId)!;
      expect(item.required).toBe(src.required);
    }
  });
});
