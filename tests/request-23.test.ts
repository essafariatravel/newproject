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

/* ------------------------------------------------------------------ */
/*  Phase 2-Final — the final request flow: country-first 3 steps,     */
/*  exactly ONE applicant (full name + nationality code only), no DOB/ */
/*  passport/email/phone, atomic single charge, no draft artifacts.    */
/* ------------------------------------------------------------------ */

let funded = false;
async function ensureFunds() {
  if (funded) return;
  const agency = await agencyByEmail("ops@agencyb.example");
  const superAdmin = await userByEmail("admin@test.example");
  await adjustWallet({ agencyId: agency.id, amount: 500000, reason: "request-final test funding", actor: superAdmin });
  funded = true;
}

async function visaRow(code = "JP-BUS") {
  return (await db.execute(sql`select id, country_id from visa_types where code = ${code}`)).rows[0] as {
    id: string;
    country_id: string;
  };
}

async function requirementTypeIds(vId: string) {
  return (await db.execute(
    sql`select vr.document_type_id as id, vr.required from visa_requirements vr
        join document_types dt on dt.id = vr.document_type_id
        where vr.visa_type_id = ${vId} and vr.active and dt.active order by vr.sort_order`,
  )).rows as { id: string; required: boolean }[];
}

function doc(typeId: string, name = "scan.pdf", size = 2048) {
  return { documentTypeId: typeId, file: { name, type: "application/pdf", size, data: Buffer.alloc(size, 1) } };
}

function applicant() {
  return { fullName: "Amine Bekkali", nationality: "DZ" };
}

async function baseInput(key: string) {
  await ensureFunds();
  const agency = await agencyByEmail("ops@agencyb.example");
  const actor = await userByEmail("b-admin@test.example");
  const v = await visaRow();
  const reqs = await requirementTypeIds(v.id);
  return {
    agency, actor, vId: v.id, countryId: v.country_id, reqs,
    input: {
      actor,
      idempotencyKey: key,
      countryId: v.country_id,
      visaTypeId: v.id,
      priorityCode: "STANDARD",
      agencyNotes: "Business trip in October.",
      travellers: [applicant()],
      documents: reqs.map((r) => doc(r.id)),
      ipAddress: null,
    },
  };
}

describe("Phase 2-Final — atomic simplified request submission", () => {
  it("exposes the final enumerated validation codes (18, stable identifiers)", () => {
    expect(REQUEST_VALIDATION_CODES).toHaveLength(18);
    expect(new Set(REQUEST_VALIDATION_CODES).size).toBe(18);
    for (const c of [
      "COUNTRY_REQUIRED", "COUNTRY_INVALID", "COUNTRY_VISA_MISMATCH",
      "APPLICANT_REQUIRED", "APPLICANT_LIMIT", "APPLICANT_FULL_NAME",
      "APPLICANT_NATIONALITY", "APPLICANT_NATIONALITY_INVALID",
      "REQUIRED_DOCUMENT_MISSING", "FILE_TOO_LARGE",
    ]) {
      expect(REQUEST_VALIDATION_CODES).toContain(c);
    }
  });

  it("happy path: ONE application SUBMITTED from birth, ONE applicant (full name + nationality code), no passport/DOB fields stored", async () => {
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
    expect(row.applicants).toBe(1); // exactly one
    expect(row.documents).toBe(row.checklist);
    expect(row.charges).toBe(1);

    const ap = (await db.execute(
      sql`select full_name, nationality, first_name, last_name, date_of_birth, passport_number, passport_expiry_date, email, phone
            from applicants where application_id = ${result.applicationId}`,
    )).rows[0] as Record<string, unknown>;
    expect(ap.full_name).toBe("Amine Bekkali");
    expect(ap.nationality).toBe("DZ"); // stable identifier stored, never a label
    expect(ap.first_name).toBe("Amine Bekkali");
    expect(ap.last_name).toBe("");
    expect(ap.date_of_birth).toBeNull();
    expect(ap.passport_number).toBeNull();
    expect(ap.passport_expiry_date).toBeNull();
    expect(ap.email).toBeNull();
    expect(ap.phone).toBeNull();

    const bucketDoc = (await db.select().from(documents).where(eq(documents.applicationId, result.applicationId)))[0]!;
    expect(bucketDoc.storageKey).toContain(result.applicationId);
  });

  it("idempotent replay: same key returns the same application and never charges twice", async () => {
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
    expect(after.b).toBe(before.b);
    const charges = await db
      .select()
      .from(walletTransactions)
      .where(and(eq(walletTransactions.applicationId, first.applicationId), eq(walletTransactions.type, "APPLICATION_CHARGE")));
    expect(charges).toHaveLength(1);
  });

  it("server-side validations: country required, country/visa mismatch, exactly one applicant, full name, nationality", async () => {
    const { input } = await baseInput(crypto.randomUUID());

    await expect(submitVisaRequest({ ...input, idempotencyKey: "" })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    await expect(submitVisaRequest({ ...input, countryId: "" })).rejects.toMatchObject({ code: "COUNTRY_REQUIRED" });
    await expect(submitVisaRequest({ ...input, visaTypeId: crypto.randomUUID() })).rejects.toMatchObject({ code: "VISA_TYPE_INVALID" });
    await expect(submitVisaRequest({ ...input, priorityCode: "NOPE" })).rejects.toMatchObject({ code: "PRIORITY_INVALID" });

    // A crafted visa under a DIFFERENT active country is rejected.
    const other = (await db.execute(
      sql`select country_id from visa_types where active and country_id <> ${input.countryId} limit 1`,
    )).rows[0] as { country_id: string } | undefined;
    if (other) {
      await expect(submitVisaRequest({ ...input, countryId: other.country_id })).rejects.toMatchObject({ code: "COUNTRY_VISA_MISMATCH" });
    }

    await expect(submitVisaRequest({ ...input, travellers: [] })).rejects.toMatchObject({ code: "APPLICANT_REQUIRED" });
    await expect(
      submitVisaRequest({ ...input, travellers: [applicant(), { fullName: "Second Person", nationality: "FR" }] }),
    ).rejects.toMatchObject({ code: "APPLICANT_LIMIT" }); // crafted multi-traveller payload rejected
    await expect(submitVisaRequest({ ...input, travellers: [{ fullName: "", nationality: "DZ" }] })).rejects.toMatchObject({ code: "APPLICANT_FULL_NAME" });
    await expect(submitVisaRequest({ ...input, travellers: [{ fullName: "Amine Bekkali", nationality: "" }] })).rejects.toMatchObject({ code: "APPLICANT_NATIONALITY" });
    await expect(submitVisaRequest({ ...input, travellers: [{ fullName: "Amine Bekkali", nationality: "Algérie" }] })).rejects.toMatchObject({ code: "APPLICANT_NATIONALITY_INVALID" });
    await expect(submitVisaRequest({ ...input, travellers: [{ fullName: "Amine Bekkali", nationality: "XX" }] })).rejects.toMatchObject({ code: "APPLICANT_NATIONALITY_INVALID" });
    await expect(submitVisaRequest({ ...input, agencyNotes: "x".repeat(1200) })).rejects.toMatchObject({ code: "NOTES_TOO_LONG" });
  });

  it("historical legacy applicant rows (passport/DOB playbook) remain insertable & readable", async () => {
    const { input } = await baseInput(crypto.randomUUID());
    const result = await submitVisaRequest(input);
    // Simulate a pre-Phase-2-Final row written with the legacy columns.
    await db.execute(sql`
      insert into applicants (application_id, first_name, last_name, date_of_birth, gender, nationality,
                              passport_number, passport_issue_date, passport_expiry_date, email, phone)
      values (${result.applicationId}, 'Yacine', 'Merbah', '1988-03-02', 'MALE', 'Algerian',
              'DZ9988776', '2020-06-01', '2030-05-31', 'y.facility@example', '+213550000000')`);
    const rows = await db.execute(
      sql`select full_name, first_name, last_name, nationality, passport_number, date_of_birth
            from applicants where application_id = ${result.applicationId} order by created_at desc`,
    );
    const legacy = rows.rows[0] as Record<string, unknown>;
    expect(legacy.full_name).toBeNull(); // untouched by the new flow
    expect(legacy.passport_number).toBe("DZ9988776");
    expect(legacy.date_of_birth).not.toBeNull();
  });

  it("rejects missing required documents, oversized, empty & bad-type files — before wallet touch", async () => {
    const { agency, input, reqs } = await baseInput(crypto.randomUUID());
    const firstRequired = reqs.find((r) => r.required)!;
    const before = (await db.execute(sql`select balance::text as b from agencies where id = ${agency.id}`)).rows[0] as { b: string };

    await expect(
      submitVisaRequest({ ...input, documents: input.documents.filter((d) => d.documentTypeId !== firstRequired.id) }),
    ).rejects.toMatchObject({ code: "REQUIRED_DOCUMENT_MISSING" });

    const hugeSet = input.documents.map((d) =>
      d.documentTypeId === reqs[0]!.id ? doc(reqs[0]!.id, "huge.pdf", MAX_UPLOAD_BYTES + 1) : d,
    );
    await expect(submitVisaRequest({ ...input, documents: hugeSet })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });

    const emptySet = input.documents.map((d, idx) =>
      idx === 0 ? { ...d, file: { ...d.file, size: 0, data: Buffer.alloc(0) } } : d,
    );
    await expect(submitVisaRequest({ ...input, documents: emptySet })).rejects.toMatchObject({ code: "EMPTY_FILE" });

    const exeSet = input.documents.map((d) =>
      d.documentTypeId === reqs[0]!.id
        ? { documentTypeId: reqs[0]!.id, file: { name: "x.exe", type: "application/x-msdownload", size: 100, data: Buffer.alloc(100) } }
        : d,
    );
    await expect(submitVisaRequest({ ...input, documents: exeSet })).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });

    const after = (await db.execute(sql`select balance::text as b from agencies where id = ${agency.id}`)).rows[0] as { b: string };
    expect(after.b).toBe(before.b);
  });

  it("2 MB cap is the single platform constant (portal + registration + staff)", () => {
    expect(MAX_UPLOAD_BYTES).toBe(2 * 1024 * 1024);
    const src = readFileSync("src/lib/types.ts", "utf8");
    expect(src).toContain("MAX_UPLOAD_BYTES = 2 * 1024 * 1024");
  });

  it("never leaves a DRAFT behind (SUBMITTED from insert; history starts at null)", async () => {
    const { input } = await baseInput(crypto.randomUUID());
    const result = await submitVisaRequest(input);
    const appRows = await db.select().from(applications).where(eq(applications.id, result.applicationId));
    const draft = await db.execute(sql`select id from statuses where code = 'DRAFT'`);
    expect(appRows[0]!.statusId).not.toBe((draft.rows[0] as { id: string }).id);
    const hist = await db.execute(sql`select from_status_id, to_status_id from application_status_history where application_id = ${result.applicationId}`);
    expect((hist.rows[0] as Record<string, unknown>).from_status_id).toBeNull();
  });

  it("checklist snapshot comes from the visa-type requirement configuration", async () => {
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
