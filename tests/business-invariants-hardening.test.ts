import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { db, pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { applications, applicants, auditLogs, documents, documentRequests, visaTypes, walletTopupRequests, walletTransactions } from "@/db/schema";
import { changeApplicationStatus, createDraftApplication, getChecklist, getDecisionDocuments, recordApplicationDecision, submitApplication } from "@/lib/applications";
import { requestAdditionalDocument, requestDocumentReplacement } from "@/lib/document-requests";
import { uploadDocument } from "@/lib/documents";
import { createTopupRequest, processTopupRequest, topupRequestById } from "@/lib/topup";
import { adjustWallet, getBalance } from "@/lib/wallet";
import { storageProvider } from "@/lib/storage";

suiteSetup();
const receipt = () => {
  const data = Buffer.from("%PDF-1.7 bank transfer receipt");
  return { name: "bank-transfer.pdf", type: "application/pdf", size: data.length, data };
};

beforeEach(async () => {
  await db.update(walletTopupRequests).set({ status: "CANCELLED" }).where(eq(walletTopupRequests.status, "PENDING"));
});

async function dossier(submit = true) {
  const agency = await agencyByEmail("ops@agencya.example");
  const actor = await userByEmail("a-admin@test.example");
  const staff = await userByEmail("admin@test.example");
  const visa = (await db.execute(sql`select id from visa_types where code='JP-BUS'`)).rows[0] as { id: string };
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa.id, createdBy: actor });
  if (submit) {
    await adjustWallet({ agencyId: agency.id, amount: 1000, reason: "Hardening test funding", actor: staff });
    await db.insert(applicants).values({ applicationId: app.id, fullName: "Amina Kaci", firstName: "Amina", lastName: "Kaci", nationality: "DZ" });
    for (const item of await getChecklist(app.id)) if (item.required) {
      await uploadDocument({ applicationId: app.id, checklistItemId: item.id, actor, file: receipt() });
    }
    await submitApplication({ applicationId: app.id, actor });
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "DOCUMENTS_CHECKING", actor: staff });
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "IN_PROCESS", actor: staff });
  }
  return { app, agency, actor, staff };
}

describe("canonical workflow integrity", () => {
  it("cannot submit a draft through the generic transition without the submission gate and charge", async () => {
    const { app, actor } = await dossier(false);
    await expect(changeApplicationStatus({ applicationId: app.id, toStatusCode: "SUBMITTED", actor })).rejects.toMatchObject({ code: "SUBMISSION_REQUIRED" });
    const current = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(current.statusId).toBe(app.statusId);
    expect(current.submittedAt).toBeNull();
    expect(await db.select().from(walletTransactions).where(eq(walletTransactions.applicationId, app.id))).toHaveLength(0);
  });

  it("rejects forged decision bypass flags on generic transitions", async () => {
    const { app, staff } = await dossier();
    await expect(changeApplicationStatus({ applicationId: app.id, toStatusCode: "APPROVED", actor: staff, viaDecision: true } as Parameters<typeof changeApplicationStatus>[0])).rejects.toMatchObject({ code: "DECISION_REQUIRED" });
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("requires an official file before making any final decision", async () => {
    const { app, staff } = await dossier();
    const before = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    await expect(recordApplicationDecision({ applicationId: app.id, outcome: "APPROVED", actor: staff } as Parameters<typeof recordApplicationDecision>[0])).rejects.toMatchObject({ code: "NO_FILE" });
    const after = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(after.statusId).toBe(before.statusId);
    expect(after.decisionAt).toBeNull();
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("an official-file storage failure leaves the decision and documents untouched", async () => {
    const { app, staff } = await dossier();
    const before = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    const storage = vi.spyOn(storageProvider(), "put").mockRejectedValueOnce(new Error("Storage unavailable"));
    try {
      await expect(recordApplicationDecision({ applicationId: app.id, outcome: "APPROVED", actor: staff, file: receipt() })).rejects.toThrow("Storage unavailable");
    } finally { storage.mockRestore(); }
    expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]!.statusId).toBe(before.statusId);
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("concurrent staff replacement requests leave one open slot which locks after one upload", async () => {
    const { app, actor, staff } = await dossier();
    const item = (await getChecklist(app.id))[0]!;
    await Promise.all(Array.from({ length: 6 }, () => requestDocumentReplacement({ applicationId: app.id, checklistItemId: item.id, actor: staff, reason: "Please replace this scan." })));
    expect(await db.select().from(documentRequests).where(and(eq(documentRequests.applicationId, app.id), eq(documentRequests.status, "OPEN")))).toHaveLength(1);
    await uploadDocument({ applicationId: app.id, checklistItemId: item.id, actor, file: receipt() });
    expect(await db.select().from(documentRequests).where(and(eq(documentRequests.applicationId, app.id), eq(documentRequests.status, "OPEN")))).toHaveLength(0);
    await expect(uploadDocument({ applicationId: app.id, checklistItemId: item.id, actor, file: receipt() })).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });
    expect(await db.select().from(documents).where(eq(documents.checklistItemId, item.id))).toHaveLength(2);
  });

  it("a final decision closes outstanding requests so terminal dossiers never demand an impossible upload", async () => {
    const { app, staff } = await dossier();
    const item = (await getChecklist(app.id))[0]!;
    await requestDocumentReplacement({ applicationId: app.id, checklistItemId: item.id, actor: staff, reason: "Please replace this scan." });
    await recordApplicationDecision({ applicationId: app.id, outcome: "REJECTED", actor: staff, file: receipt() });
    expect(await db.select().from(documentRequests).where(and(eq(documentRequests.applicationId, app.id), eq(documentRequests.status, "OPEN")))).toHaveLength(0);
  });

  it("required embassy programmes cannot skip their embassy stage", async () => {
    const { app, staff } = await dossier();
    await db.update(visaTypes).set({ embassyApplicability: "APPLICABLE" }).where(eq(visaTypes.id, app.visaTypeId));
    try {
      await expect(recordApplicationDecision({ applicationId: app.id, outcome: "APPROVED", actor: staff, file: receipt() })).rejects.toMatchObject({ code: "EMBASSY_REQUIRED" });
      expect(await getDecisionDocuments(app.id)).toHaveLength(0);
    } finally { await db.update(visaTypes).set({ embassyApplicability: "OPTIONAL" }).where(eq(visaTypes.id, app.visaTypeId)); }
  });

  it("concurrent additional requests create one slot and relock after fulfillment", async () => {
    const { app, actor, staff } = await dossier();
    const dt = (await db.execute(sql`select id from document_types where code='INSURANCE'`)).rows[0] as { id: string };
    await Promise.all(Array.from({ length: 5 }, () => requestAdditionalDocument({ applicationId: app.id, documentTypeId: dt.id, actor: staff, reason: "Please provide insurance." })));
    const open = await db.select().from(documentRequests).where(and(eq(documentRequests.applicationId, app.id), eq(documentRequests.status, "OPEN")));
    expect(open).toHaveLength(1);
    await uploadDocument({ applicationId: app.id, checklistItemId: open[0]!.checklistItemId, actor, file: receipt() });
    await expect(uploadDocument({ applicationId: app.id, checklistItemId: open[0]!.checklistItemId, actor, file: receipt() })).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });
  });
});

describe("proof and immutable money", () => {
  it("requires persisted proof before accepting a top-up request", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    await expect(createTopupRequest({ agencyId: agency.id, amount: 100, actor })).rejects.toMatchObject({ code: "NO_FILE" });
  });

  it("an agency member and a forged foreign tenant cannot create financial requests", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    for (const email of ["a-admin@test.example", "b-user@test.example"]) {
      await expect(createTopupRequest({ agencyId: agency.id, amount: 100, actor: await userByEmail(email), proof: receipt() } as Parameters<typeof createTopupRequest>[0])).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("stores proof and a pending request without changing the balance", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    const before = await getBalance(agency.id);
    const created = await createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof: receipt() } as Parameters<typeof createTopupRequest>[0]);
    const row = await topupRequestById(created.id) as unknown as { proofStorageKey: string; proofFilename: string };
    expect(row.proofFilename).toBe("bank-transfer.pdf");
    expect(row.proofStorageKey).toBeTruthy();
    expect((await storageProvider().get(row.proofStorageKey)).data.equals(receipt().data)).toBe(true);
    expect(await getBalance(agency.id)).toEqual(before);
  });

  it("receipt records are unavailable to foreign tenants and ordinary agency members", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    const created = await createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof: receipt() } as Parameters<typeof createTopupRequest>[0]);
    const read = topupRequestById as (id: string, actor: Awaited<ReturnType<typeof userByEmail>>) => ReturnType<typeof topupRequestById>;
    await expect(read(created.id, await userByEmail("b-admin@test.example"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(read(created.id, await userByEmail("a-user@test.example"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("concurrent identical receipt submissions reuse one request and one stored proof", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    const key = crypto.randomUUID();
    const results = await Promise.all(Array.from({ length: 3 }, () => createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof: receipt(), idempotencyKey: key } as Parameters<typeof createTopupRequest>[0])));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    const rows = await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.agencyId, agency.id));
    expect(rows.filter((r) => r.status === "PENDING")).toHaveLength(1);
    const blobs = (await db.execute(sql`select count(*)::int as n from document_blobs where key like ${`topup-proofs/${agency.id}/${results[0]!.id}/%`}`)).rows[0] as { n: number };
    expect(blobs.n).toBe(1);
  });

  it("rejects oversized or disguised receipts before persisting a request", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    for (const proof of [{ ...receipt(), size: 2 * 1024 * 1024 + 1 }, { ...receipt(), name: "receipt.pdf", data: Buffer.from("not a PDF") }]) {
      await expect(createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof } as Parameters<typeof createTopupRequest>[0])).rejects.toThrow();
    }
    expect(await db.select().from(walletTopupRequests).where(and(eq(walletTopupRequests.agencyId, agency.id), eq(walletTopupRequests.status, "PENDING")))).toHaveLength(0);
  });

  it("rolls back a top-up rejection when its audit row cannot be persisted", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const actor = await userByEmail("a-admin@test.example");
    const staff = await userByEmail("admin@test.example");
    const created = await createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof: receipt() });
    const fn = qualifiedTable("test_fail_topup_reject_audit");
    const audit = qualifiedTable("audit_logs");
    await pool.query(`create or replace function ${fn}() returns trigger language plpgsql as $probe$
      begin
        if new.action = 'WALLET_TOPUP_REJECTED' then
          raise exception 'synthetic top-up audit failure';
        end if;
        return new;
      end
    $probeimport { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { db, pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { applications, applicants, auditLogs, documents, documentRequests, visaTypes, walletTopupRequests, walletTransactions } from "@/db/schema";
import { changeApplicationStatus, createDraftApplication, getChecklist, getDecisionDocuments, recordApplicationDecision, submitApplication } from "@/lib/applications";
import { requestAdditionalDocument, requestDocumentReplacement } from "@/lib/document-requests";
import { uploadDocument } from "@/lib/documents";
import { createTopupRequest, processTopupRequest, topupRequestById } from "@/lib/topup";
import { adjustWallet, getBalance } from "@/lib/wallet";
import { storageProvider } from "@/lib/storage";

suiteSetup();
const receipt = () => {
  const data = Buffer.from("%PDF-1.7 bank transfer receipt");
  return { name: "bank-transfer.pdf", type: "application/pdf", size: data.length, data };
};

beforeEach(async () => {
  await db.update(walletTopupRequests).set({ status: "CANCELLED" }).where(eq(walletTopupRequests.status, "PENDING"));
});

async function dossier(submit = true) {
  const agency = await agencyByEmail("ops@agencya.example");
  const actor = await userByEmail("a-admin@test.example");
  const staff = await userByEmail("admin@test.example");
  const visa = (await db.execute(sql`select id from visa_types where code='JP-BUS'`)).rows[0] as { id: string };
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa.id, createdBy: actor });
  if (submit) {
    await adjustWallet({ agencyId: agency.id, amount: 1000, reason: "Hardening test funding", actor: staff });
    await db.insert(applicants).values({ applicationId: app.id, fullName: "Amina Kaci", firstName: "Amina", lastName: "Kaci", nationality: "DZ" });
    for (const item of await getChecklist(app.id)) if (item.required) {
      await uploadDocument({ applicationId: app.id, checklistItemId: item.id, actor, file: receipt() });
    }
    await submitApplication({ applicationId: app.id, actor });
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "DOCUMENTS_CHECKING", actor: staff });
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "IN_PROCESS", actor: staff });
  }
  return { app, agency, actor, staff };
}

describe("canonical workflow integrity", () => {
  it("cannot submit a draft through the generic transition without the submission gate and charge", async () => {
    const { app, actor } = await dossier(false);
    await expect(changeApplicationStatus({ applicationId: app.id, toStatusCode: "SUBMITTED", actor })).rejects.toMatchObject({ code: "SUBMISSION_REQUIRED" });
    const current = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(current.statusId).toBe(app.statusId);
    expect(current.submittedAt).toBeNull();
    expect(await db.select().from(walletTransactions).where(eq(walletTransactions.applicationId, app.id))).toHaveLength(0);
  });

  it("rejects forged decision bypass flags on generic transitions", async () => {
    const { app, staff } = await dossier();
    await expect(changeApplicationStatus({ applicationId: app.id, toStatusCode: "APPROVED", actor: staff, viaDecision: true } as Parameters<typeof changeApplicationStatus>[0])).rejects.toMatchObject({ code: "DECISION_REQUIRED" });
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("requires an official file before making any final decision", async () => {
    const { app, staff } = await dossier();
    const before = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    await expect(recordApplicationDecision({ applicationId: app.id, outcome: "APPROVED", actor: staff } as Parameters<typeof recordApplicationDecision>[0])).rejects.toMatchObject({ code: "NO_FILE" });
    const after = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(after.statusId).toBe(before.statusId);
    expect(after.decisionAt).toBeNull();
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("an official-file storage failure leaves the decision and documents untouched", async () => {
    const { app, staff } = await dossier();
    const before = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    const storage = vi.spyOn(storageProvider(), "put").mockRejectedValueOnce(new Error("Storage unavailable"));
    try {
      await expect(recordApplicationDecision({ applicationId: app.id, outcome: "APPROVED", actor: staff, file: receipt() })).rejects.toThrow("Storage unavailable");
    } finally { storage.mockRestore(); }
    expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]!.statusId).toBe(before.statusId);
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("concurrent staff replacement requests leave one open slot which locks after one upload", async () => {
    const { app, actor, staff } = await dossier();
    const item = (await getChecklist(app.id))[0]!;
    await Promise.all(Array.from({ length: 6 }, () => requestDocumentReplacement({ applicationId: app.id, checklistItemId: item.id, actor: staff, reason: "Please replace this scan." })));
    expect(await db.select().from(documentRequests).where(and(eq(documentRequests.applicationId, app.id), eq(documentRequests.status, "OPEN")))).toHaveLength(1);
    await uploadDocument({ applicationId: app.id, checklistItemId: item.id, actor, file: receipt() });
    expect(await db.select().from(documentRequests).where(and(eq(documentRequests.applicationId, app.id), eq(documentRequests.status, "OPEN")))).toHaveLength(0);
    await expect(uploadDocument({ applicationId: app.id, checklistItemId: item.id, actor, file: receipt() })).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });
    expect(await db.select().from(documents).where(eq(documents.checklistItemId, item.id))).toHaveLength(2);
  });

  it("a final decision closes outstanding requests so terminal dossiers never demand an impossible upload", async () => {
    const { app, staff } = await dossier();
    const item = (await getChecklist(app.id))[0]!;
    await requestDocumentReplacement({ applicationId: app.id, checklistItemId: item.id, actor: staff, reason: "Please replace this scan." });
    await recordApplicationDecision({ applicationId: app.id, outcome: "REJECTED", actor: staff, file: receipt() });
    expect(await db.select().from(documentRequests).where(and(eq(documentRequests.applicationId, app.id), eq(documentRequests.status, "OPEN")))).toHaveLength(0);
  });

  it("required embassy programmes cannot skip their embassy stage", async () => {
    const { app, staff } = await dossier();
    await db.update(visaTypes).set({ embassyApplicability: "APPLICABLE" }).where(eq(visaTypes.id, app.visaTypeId));
    try {
      await expect(recordApplicationDecision({ applicationId: app.id, outcome: "APPROVED", actor: staff, file: receipt() })).rejects.toMatchObject({ code: "EMBASSY_REQUIRED" });
      expect(await getDecisionDocuments(app.id)).toHaveLength(0);
    } finally { await db.update(visaTypes).set({ embassyApplicability: "OPTIONAL" }).where(eq(visaTypes.id, app.visaTypeId)); }
  });

  it("concurrent additional requests create one slot and relock after fulfillment", async () => {
    const { app, actor, staff } = await dossier();
    const dt = (await db.execute(sql`select id from document_types where code='INSURANCE'`)).rows[0] as { id: string };
    await Promise.all(Array.from({ length: 5 }, () => requestAdditionalDocument({ applicationId: app.id, documentTypeId: dt.id, actor: staff, reason: "Please provide insurance." })));
    const open = await db.select().from(documentRequests).where(and(eq(documentRequests.applicationId, app.id), eq(documentRequests.status, "OPEN")));
    expect(open).toHaveLength(1);
    await uploadDocument({ applicationId: app.id, checklistItemId: open[0]!.checklistItemId, actor, file: receipt() });
    await expect(uploadDocument({ applicationId: app.id, checklistItemId: open[0]!.checklistItemId, actor, file: receipt() })).rejects.toMatchObject({ code: "UPLOAD_NOT_ALLOWED" });
  });
});

describe("proof and immutable money", () => {
  it("requires persisted proof before accepting a top-up request", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    await expect(createTopupRequest({ agencyId: agency.id, amount: 100, actor })).rejects.toMatchObject({ code: "NO_FILE" });
  });

  it("an agency member and a forged foreign tenant cannot create financial requests", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    for (const email of ["a-admin@test.example", "b-user@test.example"]) {
      await expect(createTopupRequest({ agencyId: agency.id, amount: 100, actor: await userByEmail(email), proof: receipt() } as Parameters<typeof createTopupRequest>[0])).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("stores proof and a pending request without changing the balance", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    const before = await getBalance(agency.id);
    const created = await createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof: receipt() } as Parameters<typeof createTopupRequest>[0]);
    const row = await topupRequestById(created.id) as unknown as { proofStorageKey: string; proofFilename: string };
    expect(row.proofFilename).toBe("bank-transfer.pdf");
    expect(row.proofStorageKey).toBeTruthy();
    expect((await storageProvider().get(row.proofStorageKey)).data.equals(receipt().data)).toBe(true);
    expect(await getBalance(agency.id)).toEqual(before);
  });

  it("receipt records are unavailable to foreign tenants and ordinary agency members", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    const created = await createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof: receipt() } as Parameters<typeof createTopupRequest>[0]);
    const read = topupRequestById as (id: string, actor: Awaited<ReturnType<typeof userByEmail>>) => ReturnType<typeof topupRequestById>;
    await expect(read(created.id, await userByEmail("b-admin@test.example"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(read(created.id, await userByEmail("a-user@test.example"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("concurrent identical receipt submissions reuse one request and one stored proof", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    const key = crypto.randomUUID();
    const results = await Promise.all(Array.from({ length: 3 }, () => createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof: receipt(), idempotencyKey: key } as Parameters<typeof createTopupRequest>[0])));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    const rows = await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.agencyId, agency.id));
    expect(rows.filter((r) => r.status === "PENDING")).toHaveLength(1);
    const blobs = (await db.execute(sql`select count(*)::int as n from document_blobs where key like ${`topup-proofs/${agency.id}/${results[0]!.id}/%`}`)).rows[0] as { n: number };
    expect(blobs.n).toBe(1);
  });

  it("rejects oversized or disguised receipts before persisting a request", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    for (const proof of [{ ...receipt(), size: 2 * 1024 * 1024 + 1 }, { ...receipt(), name: "receipt.pdf", data: Buffer.from("not a PDF") }]) {
      await expect(createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof } as Parameters<typeof createTopupRequest>[0])).rejects.toThrow();
    }
    expect(await db.select().from(walletTopupRequests).where(and(eq(walletTopupRequests.agencyId, agency.id), eq(walletTopupRequests.status, "PENDING")))).toHaveLength(0);
  });

  it("rolls back a top-up rejection when its audit row cannot be persisted", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const actor = await userByEmail("a-admin@test.example");
    const staff = await userByEmail("admin@test.example");
    const created = await createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof: receipt() });
    const fn = qualifiedTable("test_fail_topup_reject_audit");
    const audit = qualifiedTable("audit_logs");
);
    await pool.query(`drop trigger if exists test_fail_topup_reject_audit on ${audit}`);
    await pool.query(`create trigger test_fail_topup_reject_audit before insert on ${audit}
      for each row execute function ${fn}()`);
    try {
      await expect(processTopupRequest({ requestId: created.id, decision: "REJECT", decisionNote: "Bank transfer not received.", actor: staff }))
        .rejects.toThrow(/synthetic top-up audit failure/i);
      const current = (await topupRequestById(created.id))!;
      expect(current.status).toBe("PENDING");
      expect(current.processedAt).toBeNull();
      expect(current.processedBy).toBeNull();
      const audits = await db.select().from(auditLogs)
        .where(and(eq(auditLogs.entityId, created.id), eq(auditLogs.action, "WALLET_TOPUP_REJECTED")));
      expect(audits).toHaveLength(0);
    } finally {
      await pool.query(`drop trigger if exists test_fail_topup_reject_audit on ${audit}`);
      await pool.query(`drop function if exists ${fn}()`);
    }
  });

  it("does not credit a legacy pending request with no proof", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example"), staff = await userByEmail("admin@test.example");
    const [request] = await db.insert(walletTopupRequests).values({ agencyId: agency.id, amount: "100.00", requestedBy: actor.id }).returning();
    const before = await getBalance(agency.id);
    await expect(processTopupRequest({ requestId: request!.id, decision: "CREDIT", actor: staff })).rejects.toMatchObject({ code: "PROOF_REQUIRED" });
    expect(await getBalance(agency.id)).toEqual(before);
    expect((await topupRequestById(request!.id))!.status).toBe("PENDING");
  });

  it("does not credit when the receipt key changes during proof verification", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example"), staff = await userByEmail("admin@test.example");
    const created = await createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof: receipt() });
    const original = (await topupRequestById(created.id))!;
    const replacementKey = `${original.proofStorageKey}/replacement`;
    const provider = storageProvider();
    await provider.put(replacementKey, receipt().data, receipt().type);
    const before = await getBalance(agency.id);
    const ledgerBefore = await db.select().from(walletTransactions).where(eq(walletTransactions.agencyId, agency.id));
    const getProof = provider.get.bind(provider);
    const proofRead = vi.spyOn(provider, "get").mockImplementationOnce(async (key) => {
      const stored = await getProof(key);
      const receiptUpdater = await pool.connect();
      try {
        await receiptUpdater.query("begin");
        // Bound failures if proof verification regresses into holding the request lock.
        await receiptUpdater.query("set local lock_timeout = '500ms'");
        await receiptUpdater.query(`update ${qualifiedTable("wallet_topup_requests")} set proof_storage_key = $2 where id = $1`, [created.id, replacementKey]);
        await receiptUpdater.query("commit");
      } catch (error) {
        await receiptUpdater.query("rollback");
        throw error;
      } finally { receiptUpdater.release(); }
      return stored;
    });
    try {
      await expect(processTopupRequest({ requestId: created.id, decision: "CREDIT", actor: staff })).rejects.toMatchObject({ code: "PROOF_CHANGED" });
    } finally { proofRead.mockRestore(); }
    const current = (await topupRequestById(created.id))!;
    expect(current.proofStorageKey).toBe(replacementKey);
    expect(current.status).toBe("PENDING");
    expect(current.walletTransactionId).toBeNull();
    expect(current.processedAt).toBeNull();
    expect(await getBalance(agency.id)).toEqual(before);
    expect(await db.select().from(walletTransactions).where(eq(walletTransactions.agencyId, agency.id))).toEqual(ledgerBefore);
  });

  it("does not credit a pending request whose stored receipt is missing", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example"), staff = await userByEmail("admin@test.example");
    const created = await createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof: receipt() });
    const original = (await topupRequestById(created.id))!;
    await storageProvider().delete(original.proofStorageKey!);
    const before = await getBalance(agency.id);
    await expect(processTopupRequest({ requestId: created.id, decision: "CREDIT", actor: staff })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await getBalance(agency.id)).toEqual(before);
    expect(await topupRequestById(created.id)).toEqual(original);
  });

  it("keeps duplicate processing precise after the credited receipt is unavailable", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example"), staff = await userByEmail("admin@test.example");
    const created = await createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof: receipt() });
    await processTopupRequest({ requestId: created.id, decision: "CREDIT", actor: staff });
    const processed = (await topupRequestById(created.id))!;
    await storageProvider().delete(processed.proofStorageKey!);
    const before = await getBalance(agency.id);
    await expect(processTopupRequest({ requestId: created.id, decision: "CREDIT", actor: staff })).rejects.toMatchObject({ code: "TOPUP_ALREADY_PROCESSED" });
    expect(await getBalance(agency.id)).toEqual(before);
    expect(await topupRequestById(created.id)).toEqual(processed);
  });

  it("keeps the duplicate error precise when another caller credits during a failed receipt read", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example"), staff = await userByEmail("admin@test.example");
    const created = await createTopupRequest({ agencyId: agency.id, amount: 100, actor, proof: receipt() });
    const before = await getBalance(agency.id);
    const proofRead = vi.spyOn(storageProvider(), "get").mockImplementationOnce(async () => {
      await processTopupRequest({ requestId: created.id, decision: "CREDIT", actor: staff });
      throw new Error("Receipt unavailable after concurrent credit");
    });
    try {
      await expect(processTopupRequest({ requestId: created.id, decision: "CREDIT", actor: staff })).rejects.toMatchObject({ code: "TOPUP_ALREADY_PROCESSED" });
    } finally { proofRead.mockRestore(); }
    expect(Number((await getBalance(agency.id)).balance) - Number(before.balance)).toBe(100);
    const processed = (await topupRequestById(created.id))!;
    expect(processed.status).toBe("PROCESSED");
    expect(await db.select().from(walletTransactions).where(eq(walletTransactions.id, processed.walletTransactionId!))).toHaveLength(1);
  });

  it("manual wallet service refuses agency actors", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("a-admin@test.example");
    const before = await getBalance(agency.id);
    await expect(adjustWallet({ agencyId: agency.id, amount: 100, reason: "Forged agency credit", actor })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getBalance(agency.id)).toEqual(before);
  });

  it("the database refuses edits and deletes of wallet ledger history", async () => {
    const agency = await agencyByEmail("ops@agencya.example"), actor = await userByEmail("admin@test.example");
    const id = await adjustWallet({ agencyId: agency.id, amount: 100, reason: "Ledger protection funding", actor });
    await expect(db.update(walletTransactions).set({ reason: "Altered history" }).where(eq(walletTransactions.id, id))).rejects.toThrow();
    await expect(db.delete(walletTransactions).where(eq(walletTransactions.id, id))).rejects.toThrow();
    expect((await db.select().from(walletTransactions).where(eq(walletTransactions.id, id)))[0]!.reason).toBe("Ledger protection funding");
  });
});
