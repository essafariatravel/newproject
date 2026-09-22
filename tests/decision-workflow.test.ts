/**
 * PHASE 2.1 — Final-decision workflow: upload + atomic transition + stamps,
 * config-gated outcomes, tenant-safe downloads. Direct transitions to final
 * outcomes are locked outside this workflow.
 */
import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
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
async function appAt(statusAfterSubmit: "IN_PROCESS" | "EMBASSY_SENT" = "IN_PROCESS") {
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
    IN_PROCESS: ["DOCUMENTS_CHECKING", "IN_PROCESS"],
    EMBASSY_SENT: ["DOCUMENTS_CHECKING", "IN_PROCESS", "EMBASSY_SENT"],
  };
  for (const s of PATH[statusAfterSubmit] ?? []) {
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: s, actor: staff });
  }
  return { app, agency, staffB, staff };
}

/** Freshly SUBMITTED app without any walk (documents-stage assertions). */
async function submittedAppForDecision() {
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
    firstName: "Early",
    lastName: "Decide",
    dateOfBirth: "1990-01-01",
    nationality: "Japanese",
    passportNumber: "JP5543210",
    passportExpiryDate: "2034-01-01",
  });
  const required = await db
    .select()
    .from(checklistItems)
    .where(sql`${checklistItems.applicationId} = ${app.id} and ${checklistItems.required} = true`);
  for (const item of required) {
    const rows = (await db.execute(sql`select id from document_types where code=${item.documentTypeCode}`)).rows as Array<{ id: string }>;
    void rows; // uploads go through the checklist item directly
    await uploadDocument({
      applicationId: app.id,
      actor: staffB,
      file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 512, data: PDF },
      checklistItemId: item.id,
    });
  }
  await submitApplication({ applicationId: app.id, actor: staffB });
  return { app, staff };
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
  it("changeApplicationStatus to APPROVED/REJECTED throws DECISION_REQUIRED", async () => {
    const { app, staff } = await appAt("IN_PROCESS");
    for (const to of ["APPROVED", "REJECTED"]) {
      await expect(
        changeApplicationStatus({ applicationId: app.id, toStatusCode: to, actor: staff }),
      ).rejects.toMatchObject({ code: "DECISION_REQUIRED" });
    }
  });

  it("decisionOutcomesForStatus only offers outcomes in production statuses", () => {
    expect(decisionOutcomesForStatus("DRAFT")).toEqual([]);
    expect(decisionOutcomesForStatus("SUBMITTED")).toEqual([]);
    expect(decisionOutcomesForStatus("DOCUMENTS_CHECKING")).toEqual([]);
    expect(decisionOutcomesForStatus("DOCUMENTS_REQUESTED")).toEqual([]);
    // EMBASSY_SENT is OPTIONAL: finals reachable directly from IN_PROCESS
    expect(decisionOutcomesForStatus("IN_PROCESS")).toEqual(["APPROVED", "REJECTED"]);
    expect(decisionOutcomesForStatus("EMBASSY_SENT")).toEqual(["APPROVED", "REJECTED"]);
    // retired codes never offer outcomes anymore
    expect(decisionOutcomesForStatus("AWAITING_DECISION")).toEqual([]);
    expect(decisionOutcomesForStatus("PROCESSING")).toEqual([]);
    expect(decisionOutcomesForStatus("EMBASSY_SUBMISSION")).toEqual([]);
  });
});

describe("decision workflow — audit-proof success paths", () => {
  it("APPROVED decision: document stored + typed + ACCEPTED, status+decisionAt stamped, history+audit+notifications written", async () => {
    const { app, agency, staff } = await appAt("IN_PROCESS");
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
    const { app, staff } = await appAt("IN_PROCESS");
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
    const { app, staff } = await appAt("IN_PROCESS");
    const { documentId } = await recordApplicationDecision({
      applicationId: app.id,
      outcome: "REJECTED",
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
    const { app, staff } = await appAt("IN_PROCESS");
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
    expect(await currentStatus(app.id)).toBe("IN_PROCESS");
    expect((await getDecisionDocuments(app.id)).length).toBe(0);
  });

  it("blocks decisions from wrong statuses and from finished applications", async () => {
    const { app, staff } = await appAt("IN_PROCESS");
    // submitted-level app: walk back? Instead build a fresh pre-decision scenario:
    // this app is IN_PROCESS; first close it, then attempt again
    await recordApplicationDecision({ applicationId: app.id, outcome: "APPROVED", actor: staff, file: { name: "ok.pdf", type: "application/pdf", size: PDF.length, data: PDF } });
    await expect(
      recordApplicationDecision({ applicationId: app.id, outcome: "REJECTED", actor: staff, file: { name: "late.pdf", type: "application/pdf", size: PDF.length, data: PDF } }),
    ).rejects.toMatchObject({ code: "BAD_STATE" });
    // still exactly one decision document (nothing partial)
    expect((await getDecisionDocuments(app.id)).length).toBe(1);
  });

  it("IN_PROCESS → APPROVED directly is valid (EMBASSY_SENT remains optional, Phase 2.2)", async () => {
    const { app, staff } = await appAt("IN_PROCESS");
    const res = await recordApplicationDecision({
      applicationId: app.id,
      outcome: "APPROVED",
      actor: staff,
      file: { name: "visa-direct.pdf", type: "application/pdf", size: PDF.length, data: PDF },
    });
    expect(res.statusCode).toBe("APPROVED");
    expect(await currentStatus(app.id)).toBe("APPROVED");
  });

  it("IN_PROCESS → REJECTED directly is valid without touching the embassy", async () => {
    const { app, staff } = await appAt("IN_PROCESS");
    // never walked through EMBASSY_SENT — the direct decision must succeed
    await recordApplicationDecision({
      applicationId: app.id,
      outcome: "REJECTED",
      actor: staff,
      file: { name: "refusal-direct.pdf", type: "application/pdf", size: PDF.length, data: PDF },
    });
    expect(await currentStatus(app.id)).toBe("REJECTED");
    const history = await db
      .select({ code: statuses.code })
      .from(applicationStatusHistory)
      .innerJoin(statuses, eq(statuses.id, applicationStatusHistory.toStatusId))
      .where(eq(applicationStatusHistory.applicationId, app.id));
    expect(history.some((h) => h.code === "EMBASSY_SENT")).toBe(false);
  });

  it("rejections from DOCUMENTS_CHECKING are still impossible (finals need IN_PROCESS+)", async () => {
    const { app, staff } = await submittedAppForDecision();
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "DOCUMENTS_CHECKING", actor: staff });
    await expect(
      recordApplicationDecision({
        applicationId: app.id,
        outcome: "APPROVED",
        actor: staff,
        file: { name: "early.pdf", type: "application/pdf", size: PDF.length, data: PDF },
      }),
    ).rejects.toMatchObject({ code: "BAD_STATE" });
    expect((await getDecisionDocuments(app.id)).length).toBe(0);
  });

  it("rejects agency actors entirely (staff-only workflow)", async () => {
    const { app, staffB } = await appAt("IN_PROCESS");
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

describe("canonical decision model — duplicate Refused/Rejected eliminated", () => {
  it("legacy REFUSED outcome is no longer accepted by the decision workflow", async () => {
    const { app, staff } = await appAt("IN_PROCESS");
    await expect(
      recordApplicationDecision({
        applicationId: app.id,
        // @ts-expect-error REFUSED is not a canonical outcome anymore
        outcome: "REFUSED",
        actor: staff,
        file: { name: "legacy.pdf", type: "application/pdf", size: PDF.length, data: PDF },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await getDecisionDocuments(app.id)).length).toBe(0);
  });

  it("legacy REFUSED status, if present, is inactive with no transitions", async () => {
    const refusedRows = await db.select().from(statuses).where(eq(statuses.code, "REFUSED"));
    if (refusedRows.length) {
      expect(refusedRows[0]!.active).toBe(false);
    }
    const edges = await db.execute(
      sql`select count(*)::int as n from status_transitions t join statuses f on f.id=t.from_status_id join statuses tt on tt.id=t.to_status_id where f.code='REFUSED' or tt.code='REFUSED'`,
    );
    expect((edges.rows[0] as { n: number }).n).toBe(0);
  });

  it("APPROVED is reachable only from IN_PROCESS and EMBASSY_SENT in workflow config", async () => {
    const edges = await db.execute(
      sql`select f.code as from_code from status_transitions t join statuses f on f.id=t.from_status_id join statuses tt on tt.id=t.to_status_id where tt.code='APPROVED' order by 1`,
    );
    expect((edges.rows as Array<{ from_code: string }>).map((r) => r.from_code)).toEqual(["EMBASSY_SENT", "IN_PROCESS"]);
  });
});
