/**
 * PHASE 2.1 — Final-decision workflow: upload + atomic transition + stamps,
 * config-gated outcomes, tenant-safe downloads. Direct transitions to final
 * outcomes are locked outside this workflow.
 */
import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, authUser, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import {
  applicants as applicantsTb,
  applicationStatusHistory,
  applications,
  auditLogs,
  checklistItems,
  documents,
  notifications,
  statuses,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  changeApplicationStatus,
  createDraftApplication,
  decisionOutcomesForStatus,
  getDecisionDocuments,
  recordApplicationDecision,
  submitApplication,
} from "@/lib/applications";
import { getDocumentForUser, uploadDocument } from "@/lib/documents";
import { adjustWallet } from "@/lib/wallet";
import { storageProvider } from "@/lib/storage";

suiteSetup();

const PDF = Buffer.from("%PDF-1.7 decision letter stub content");

async function particularStaff(role: "ADMIN" | "VISA_AGENT" = "ADMIN") {
  return userByEmail(role === "ADMIN" ? "admin@test.example" : "agent@test.example");
}

async function statusIdOf(code: string): Promise<string> {
  const rows = await db.select().from(statuses).where(eq(statuses.code, code));
  return rows[0]!.id;
}

/** Build a submitted application owned by Agency B and choose its status. */
async function appAt(statusAfterSubmit: "PROCESSING" | "AWAITING_DECISION" | "EMBASSY_SUBMISSION" = "AWAITING_DECISION") {
  const agency = await agencyByEmail("ops@agencyb.example");
  const staffB = await userByEmail("b-admin@test.example");
  const superAdmin = await userByEmail("superadmin@test.example");
  const staff = await particularStaff();
  await adjustWallet({ agencyId: agency.id, amount: 250, reason: "decision funding", actor: superAdmin });
  const visaTypeId = ((
    await db.execute(sql`select id from visa_types where code='JP-BUS'`)
  ).rows[0] as { id: string }).id;
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId, createdBy: staffB });
  await db.insert(applicantsTb).values({
    applicationId: app.id,
    firstName: "Decision",
    lastName: "Craft",
    dateOfBirth: "1988-06-06",
    nationality: "Japanese",
    passportNumber: "JP0009998",
    passportExpiryDate: "2033-01-01",
  });
  const required = await db
    .select()
    .from(checklistItems)
    .where(sql`${checklistItems.applicationId} = ${app.id} and ${checklistItems.required} = true`);
  for (const item of required) {
    await uploadDocument({
      applicationId: app.id,
      actor: staffB,
      file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 512, data: PDF },
      checklistItemId: item.id,
    });
  }
  await submitApplication({ applicationId: app.id, actor: staffB });
  const PATH: Record<string, string[]> = {
    PROCESSING: ["UNDER_REVIEW", "PROCESSING"],
    AWAITING_DECISION: ["UNDER_REVIEW", "PROCESSING", "AWAITING_DECISION"],
    EMBASSY_SUBMISSION: ["UNDER_REVIEW", "PROCESSING", "EMBASSY_SUBMISSION"],
  };
  for (const s of PATH[statusAfterSubmit] ?? []) {
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: s, actor: staff });
  }
  return { app, agency, staffB, staff };
}

async function currentStatus(applicationId: string): Promise<string> {
  const rows = await db
    .select({ code: statuses.code })
    .from(applications)
    .innerJoin(statuses, eq(statuses.id, applications.statusId))
    .where(eq(applications.id, applicationId));
  return rows[0]!.code;
}

describe("decision workflow — direct final outcomes are locked", () => {
  it("changeApplicationStatus to APPROVED/REFUSED/REJECTED throws DECISION_REQUIRED", async () => {
    const { app, staff } = await appAt("PROCESSING");
    for (const to of ["APPROVED", "REFUSED", "REJECTED"]) {
      await expect(
        changeApplicationStatus({ applicationId: app.id, toStatusCode: to, actor: staff }),
      ).rejects.toMatchObject({ code: "DECISION_REQUIRED" });
    }
  });

  it("decisionOutcomesForStatus only offers outcomes in production statuses", () => {
    expect(decisionOutcomesForStatus("UNDER_REVIEW")).toEqual([]);
    expect(decisionOutcomesForStatus("SUBMITTED")).toEqual([]);
    expect(decisionOutcomesForStatus("COMPLETED")).toEqual([]);
    expect(decisionOutcomesForStatus("AWAITING_DECISION")).toEqual(["APPROVED", "REFUSED", "REJECTED"]);
    expect(decisionOutcomesForStatus("PROCESSING")).toEqual(["REFUSED", "REJECTED"]);
    expect(decisionOutcomesForStatus("EMBASSY_SUBMISSION")).toEqual(["REJECTED"]);
  });
});

describe("decision workflow — audit-proof success paths", () => {
  it("APPROVED decision: document stored + typed + ACCEPTED, status+decisionAt stamped, history+audit+notifications written", async () => {
    const { app, agency, staff } = await appAt("AWAITING_DECISION");
    const result = await recordApplicationDecision({
      applicationId: app.id,
      outcome: "APPROVED",
      actor: staff,
      file: { name: "visa-copy.pdf", type: "application/pdf", size: PDF.length, data: PDF },
      ipAddress: "203.0.113.9",
    });
    expect(result.statusCode).toBe("APPROVED");

    // status + decisionAt
    const now = await db.select().from(applications).where(eq(applications.id, app.id));
    const approvedId = await statusIdOf("APPROVED");
    expect(now[0]!.statusId).toBe(approvedId);
    expect(now[0]!.decisionAt).toBeTruthy();

    // the document: decision type, no applicant/checklist, ACCEPTED, opened storage path
    const docRows = await db.select().from(documents).where(eq(documents.id, result.documentId));
    const doc = docRows[0]!;
    expect(doc.applicationId).toBe(app.id);
    expect(doc.applicantId).toBeNull();
    expect(doc.checklistItemId).toBeNull();
    expect(doc.status).toBe("ACCEPTED");
    expect(doc.uploadedBy).toBe(staff.id);
    const typeRow = await db.execute(sql`select code from document_types where id=${doc.documentTypeId}`);
    expect((typeRow.rows[0] as { code: string }).code).toBe("DECISION_VISA_APPROVAL");
    const blob = await storageProvider().get(doc.storageKey);
    expect(blob.data.subarray(0, 4).toString("latin1")).toBe("%PDF");

    // history exactly once
    const hist = await db.select().from(applicationStatusHistory).where(and(eq(applicationStatusHistory.applicationId, app.id), eq(applicationStatusHistory.toStatusId, approvedId)));
    expect(hist.length).toBe(1);

    // audit
    const audits = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, app.id), eq(auditLogs.action, "APPLICATION_DECISION_RECORDED")));
    expect(audits.length).toBe(1);
    expect((audits[0]!.metadata as { outcome: string }).outcome).toBe("APPROVED");

    // agency notified on its portal
    const notes = await db.select().from(notifications).where(eq(notifications.type, "APPLICATION_DECISION"));
    expect(notes.some((n) => n.agencyId === agency.id && n.applicationId === app.id)).toBe(true);
  });

  it("REJECTED decision uses the refusal-letter document type and stamps decisionAt", async () => {
    const { app, staff } = await appAt("AWAITING_DECISION");
    const result = await recordApplicationDecision({
      applicationId: app.id,
      outcome: "REJECTED",
      actor: staff,
      file: { name: "embassy-rejection.pdf", type: "application/pdf", size: PDF.length, data: PDF },
    });
    expect(result.statusCode).toBe("REJECTED");
    const doc = (await db.select().from(documents).where(eq(documents.id, result.documentId)))[0]!;
    const typeRow = await db.execute(sql`select code from document_types where id=${doc.documentTypeId}`);
    expect((typeRow.rows[0] as { code: string }).code).toBe("DECISION_REFUSAL_LETTER");
    const appRow = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(appRow.decisionAt).toBeTruthy();
    expect(await currentStatus(app.id)).toBe("REJECTED");
  });

  it("decision documents appear via getDecisionDocuments and are downloadable server-side with full tenant isolation", async () => {
    const { app, staff } = await appAt("AWAITING_DECISION");
    const { documentId } = await recordApplicationDecision({
      applicationId: app.id,
      outcome: "REFUSED",
      actor: staff,
      file: { name: "refusal.pdf", type: "application/pdf", size: PDF.length, data: PDF },
    });
    const listed = await getDecisionDocuments(app.id);
    expect(listed.length).toBe(1);
    expect(listed[0]!.id).toBe(documentId);
    expect(listed[0]!.typeCode).toBe("DECISION_REFUSAL_LETTER");
    expect(listed[0]!.status).toBe("ACCEPTED");

    // agency B user (owner) can fetch the blob — and agency A cannot
    const agencyBAdmin = await userByEmail("b-admin@test.example");
    const fetched = await getDocumentForUser(documentId, agencyBAdmin);
    expect(fetched.doc.id).toBe(documentId);
    const agencyAAdmin = await userByEmail("a-admin@test.example");
    await expect(getDocumentForUser(documentId, agencyAAdmin)).rejects.toMatchObject({ code: expect.any(String) });
  });
});

describe("decision workflow — validation and bad states", () => {
  it("rejects missing files and unsupported types/content", async () => {
    const { app, staff } = await appAt("AWAITING_DECISION");
    await expect(
      recordApplicationDecision({
        applicationId: app.id,
        outcome: "APPROVED",
        actor: staff,
        file: { name: "empty.pdf", type: "application/pdf", size: 0, data: Buffer.from("") },
      }),
    ).rejects.toMatchObject({ code: "NO_FILE" });
    await expect(
      recordApplicationDecision({
        applicationId: app.id,
        outcome: "APPROVED",
        actor: staff,
        file: { name: "trojan.exe", type: "application/x-executable", size: 10, data: Buffer.from("MZ12345678") },
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_TYPE" });
    await expect(
      recordApplicationDecision({
        applicationId: app.id,
        outcome: "APPROVED",
        actor: staff,
        file: { name: "fake.pdf", type: "application/pdf", size: 10, data: Buffer.from("not really") },
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_TYPE" });
    // nothing half-written: still awaiting decision, zero decision docs
    expect(await currentStatus(app.id)).toBe("AWAITING_DECISION");
    expect((await getDecisionDocuments(app.id)).length).toBe(0);
  });

  it("blocks decisions from wrong statuses and from finished applications", async () => {
    const { app, staff } = await appAt("AWAITING_DECISION");
    // submitted-level app: walk back? Instead build a fresh pre-decision scenario:
    // this app is AWAITING_DECISION; first close it, then attempt again
    await recordApplicationDecision({ applicationId: app.id, outcome: "APPROVED", actor: staff, file: { name: "ok.pdf", type: "application/pdf", size: PDF.length, data: PDF } });
    await expect(
      recordApplicationDecision({ applicationId: app.id, outcome: "REFUSED", actor: staff, file: { name: "late.pdf", type: "application/pdf", size: PDF.length, data: PDF } }),
    ).rejects.toMatchObject({ code: "BAD_STATE" });
    // still exactly one decision document (nothing partial)
    expect((await getDecisionDocuments(app.id)).length).toBe(1);
  });

  it("APPROVED is double-gated (must pass Awaiting Decision)", async () => {
    const { app, staff } = await appAt("PROCESSING");
    await expect(
      recordApplicationDecision({
        applicationId: app.id,
        outcome: "APPROVED",
        actor: staff,
        file: { name: "jump.pdf", type: "application/pdf", size: PDF.length, data: PDF },
      }),
    ).rejects.toMatchObject({ code: "BAD_STATE" });
  });

  it("rejects agency actors entirely (staff-only workflow)", async () => {
    const { app, staffB } = await appAt("AWAITING_DECISION");
    await expect(
      recordApplicationDecision({
        applicationId: app.id,
        outcome: "APPROVED",
        actor: staffB,
        file: { name: "no.pdf", type: "application/pdf", size: PDF.length, data: PDF },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getDecisionDocuments(app.id)).length).toBe(0);
  });
});
