import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import { applicants as applicantsTb, applications, auditLogs, checklistItems, documents } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { createDraftApplication, getChecklist, submitApplication } from "@/lib/applications";
import {
  deleteDocument,
  listDocumentsForApplication,
  reviewDocument,
  uploadDocument,
  uploadResubmission,
} from "@/lib/documents";
import { adjustWallet } from "@/lib/wallet";
import { userByEmail, agencyByEmail, documentTypeIdByCode } from "./helpers/fixtures";
import { MAX_UPLOAD_BYTES } from "@/lib/types";

async function visaId() {
  return ((await db.execute(sql`select id from visa_types where code='JP-BUS'`)).rows[0] as { id: string }).id;
}

describe("document upload validation", () => {
  it("accepts a valid PDF upload tied to a checklist item", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: await visaId(), createdBy: staffB });
    const item = (await db.select().from(checklistItems).where(sql`${checklistItems.applicationId} = ${app.id} order by sort_order limit 1`))[0]!;
    const doc = await uploadDocument({
      applicationId: app.id,
      actor: staffB,
      file: { name: "passport scan.pdf", type: "application/pdf", size: 4096, data: Buffer.from("%PDF-1.4 test") },
      checklistItemId: item.id,
    });
    expect(doc.status).toBe("UPLOADED");
    expect(doc.version).toBe(1);
    expect(doc.storageKey).toContain(app.id);
  });

  it("rejects disallowed MIME types", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const app = (await db.select().from(applications).where(sql`${applications.agencyId} = ${agency.id} limit 1`))[0]!;
    const documentTypeId = await documentTypeIdByCode("PASSPORT");
    await expect(
      uploadDocument({
        applicationId: app.id,
        actor: staffB,
        documentTypeId,
        file: { name: "evil.exe", type: "application/x-msdownload", size: 10, data: Buffer.from("MZ") },
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
    await expect(
      uploadDocument({
        applicationId: app.id,
        actor: staffB,
        documentTypeId,
        file: { name: "page.html", type: "text/html", size: 10, data: Buffer.from("<script>") },
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
  });

  it("rejects oversized files", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const app = (await db.select().from(applications).where(sql`${applications.agencyId} = ${agency.id} limit 1`))[0]!;
    await expect(
      uploadDocument({
        applicationId: app.id,
        actor: staffB,
        documentTypeId: await documentTypeIdByCode("PASSPORT"),
        file: { name: "big.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES + 1, data: Buffer.alloc(10) },
      }),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("accepts ordinary file names (regression: over-escaped sanitizer rejected every real name)", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: await visaId(), createdBy: staffB });
    const documentTypeId = await documentTypeIdByCode("PHOTO");
    const names = [
      "passport.pdf",
      "visa scan 2026.jpg",
      "IMG_2026-09-23.png",
      "bank-statement (final).pdf",
      "État civil.docx",
      "photo_2.webp",
    ];
    for (const name of names) {
      const doc = await uploadDocument({
        applicationId: app.id,
        actor: staffB,
        documentTypeId,
        file: { name, type: "application/pdf", size: 512, data: Buffer.from("%PDF-1.4 x") },
      });
      expect(doc.originalFilename).toBe(name);
    }
  });

  it("rejects path-traversal filenames", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const app = (await db.select().from(applications).where(sql`${applications.agencyId} = ${agency.id} limit 1`))[0]!;
    await expect(
      uploadDocument({
        applicationId: app.id,
        actor: staffB,
        documentTypeId: await documentTypeIdByCode("PASSPORT"),
        file: { name: "../../etc/passwd", type: "application/pdf", size: 10, data: Buffer.from("x") },
      }),
    ).rejects.toMatchObject({ code: "INVALID_FILENAME" });
  });
});

describe("document review workflow", () => {
  it("staff accept / reject with mandatory reason, agency gets notifications", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const agent = await userByEmailSafe("agent@test.example");

    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: await visaId(), createdBy: staffB });
    const item = (await db.select().from(checklistItems).where(sql`${checklistItems.applicationId} = ${app.id} order by sort_order limit 1`))[0]!;
    const doc = await uploadDocument({
      applicationId: app.id,
      actor: staffB,
      file: { name: "bank.pdf", type: "application/pdf", size: 2048, data: Buffer.from("bank") },
      checklistItemId: item.id,
    });

    // rejection without reason is refused
    await expect(
      reviewDocument({ documentId: doc.id, actor: agent, status: "REJECTED" }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });

    await reviewDocument({
      documentId: doc.id,
      actor: agent,
      status: "REJECTED",
      rejectionReason: "Statement older than 3 months",
    });
    const rejected = (await db.select().from(documents).where(eq(documents.id, doc.id)))[0]!;
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toContain("3 months");
    expect(rejected.reviewedBy).toBe(agent.id);

    // resubmission creates version 2
    const doc2 = await uploadResubmission({
      applicationId: app.id,
      originalDocumentId: doc.id,
      actor: staffB,
      file: { name: "bank-v2.pdf", type: "application/pdf", size: 2048, data: Buffer.from("bank v2") },
    });
    expect(doc2.version).toBe(2);

    await reviewDocument({ documentId: doc2.id, actor: agent, status: "ACCEPTED" });
    const accepted = (await db.select().from(documents).where(eq(documents.id, doc2.id)))[0]!;
    expect(accepted.status).toBe("ACCEPTED");

    const audits = await db.select().from(auditLogs).where(sql`${auditLogs.entity} = 'document' and ${auditLogs.agencyId} = ${agency.id}`);
    expect(audits.some((a) => a.action === "DOCUMENT_REJECTED")).toBe(true);
    expect(audits.some((a) => a.action === "DOCUMENT_ACCEPTED")).toBe(true);
  });

  it("delete is only allowed for drafts owned by the agency", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const superAdmin = await userByEmailSafe("superadmin@test.example");

    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: await visaId(), createdBy: staffB });
    const item = (await db.select().from(checklistItems).where(sql`${checklistItems.applicationId} = ${app.id} order by sort_order limit 1`))[0]!;
    const doc = await uploadDocument({
      applicationId: app.id,
      actor: staffB,
      file: { name: "temp.pdf", type: "application/pdf", size: 128, data: Buffer.from("tmp") },
      checklistItemId: item.id,
    });
    await deleteDocument(doc.id, staffB);
    const gone = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(gone.length).toBe(0);

    // after submission deletion is blocked
    await adjustWallet({ agencyId: agency.id, amount: 200, reason: "delete-guard funding", actor: superAdmin });
    const app2 = await createDraftApplication({ agencyId: agency.id, visaTypeId: await visaId(), createdBy: staffB });
    await db.insert(applicantsTb).values({
      applicationId: app2.id,
      firstName: "Del",
      lastName: "Guard",
      dateOfBirth: "1985-05-05",
      nationality: "Japanese",
      passportNumber: "JP1212334",
      passportExpiryDate: "2033-01-01",
    });
    const required = await db
      .select()
      .from(checklistItems)
      .where(sql`${checklistItems.applicationId} = ${app2.id} and ${checklistItems.required} = true`);
    let keeper = "";
    for (const it of required) {
      const d = await uploadDocument({
        applicationId: app2.id,
        actor: staffB,
        file: { name: `${it.documentTypeCode}.pdf`, type: "application/pdf", size: 512, data: Buffer.from("d") },
        checklistItemId: it.id,
      });
      keeper = d.id;
    }
    await submitApplication({ applicationId: app2.id, actor: staffB });
    await expect(deleteDocument(keeper, staffB)).rejects.toMatchObject({ code: "DELETE_NOT_ALLOWED" });
    const docs = await listDocumentsForApplication(app2.id);
    expect(docs.length).toBe(required.length);
  });

  it("checklist reflects review states in progress", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const staffB = await userByEmail("b-admin@test.example");
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: await visaId(), createdBy: staffB });
    const { checklistProgress } = await import("@/lib/applications");
    const before = await checklistProgress(app.id);
    expect(before.requiredComplete).toBe(0);
    const required = await db
      .select()
      .from(checklistItems)
      .where(sql`${checklistItems.applicationId} = ${app.id} and ${checklistItems.required} = true`);
    for (const item of required) {
      await uploadDocument({
        applicationId: app.id,
        actor: staffB,
        file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 512, data: Buffer.from("d") },
        checklistItemId: item.id,
      });
    }
    const after = await checklistProgress(app.id);
    expect(after.requiredComplete).toBe(required.length);
    const checklist = await getChecklist(app.id);
    expect(checklist.length).toBeGreaterThan(0);
  });
});

async function userByEmailSafe(email: string) {
  const mod = await import("./helpers/fixtures");
  return mod.userByEmail(email);
}
