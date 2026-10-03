import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { nextIp, registrationData, registrationPdf, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { agencyRegistrationDocuments, auditLogs, checklistItems, documentBlobs, users, visaTypes } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { createDraftApplication } from "@/lib/applications";
import { getDocumentForUser, uploadDocument } from "@/lib/documents";
import { submitAgencyRegistration } from "@/lib/registrations";
import { sha256Hex } from "@/lib/file-integrity";
import { GET as downloadDossierFile } from "@/app/api/documents/[id]/route";
import { GET as downloadRegistrationFile } from "@/app/api/registrations/[id]/documents/[docId]/route";

suiteSetup();
afterEach(() => { request.cookie = ""; });

async function downloadAuditCount() {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs)
    .where(sql`${auditLogs.action} in ('DOCUMENT_DOWNLOADED','REGISTRATION_DOCUMENT_DOWNLOADED')`);
  return row!.count;
}

describe("forced password change protects private file reads", () => {
  it.each(["a-admin@test.example", "admin@test.example"])("denies dossier files for locked %s while preserving unlocked downloads", async (email) => {
    const owner = await userByEmail("a-admin@test.example");
    const [visa] = await db.select().from(visaTypes).where(eq(visaTypes.code, "FR-SCH-TOUR"));
    const app = await createDraftApplication({ agencyId: owner.agencyId!, visaTypeId: visa!.id, createdBy: owner });
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.applicationId, app.id));
    const pdf = registrationPdf();
    const doc = await uploadDocument({ applicationId: app.id, actor: owner, checklistItemId: item!.id, file: pdf });
    const actor = await userByEmail(email);
    request.cookie = (await createSession(actor.id)).token;
    const unlocked = await downloadDossierFile(new Request(`http://localhost/api/documents/${doc.id}`), { params: Promise.resolve({ id: doc.id }) });
    expect(unlocked.status).toBe(200);
    expect(Buffer.from(await unlocked.arrayBuffer())).toEqual(pdf.data);
    const audits = await downloadAuditCount();
    await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, actor.id));
    try {
      const locked = await downloadDossierFile(new Request(`http://localhost/api/documents/${doc.id}`), { params: Promise.resolve({ id: doc.id }) });
      expect(locked.status).toBe(403);
      expect(await locked.json()).toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
      expect(await downloadAuditCount()).toBe(audits);
      await expect(getDocumentForUser(doc.id, { ...actor, mustChangePassword: true })).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    } finally { await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, actor.id)); }
  });

  it("denies locked Staff registration downloads before resolving file identifiers", async () => {
    const pdf = registrationPdf();
    const reg = await submitAgencyRegistration({ data: registrationData(), files: [pdf], ipAddress: nextIp() });
    const [doc] = await db.select().from(agencyRegistrationDocuments).where(eq(agencyRegistrationDocuments.registrationId, reg.id));
    const actor = await userByEmail("admin@test.example");
    request.cookie = (await createSession(actor.id)).token;
    const unlocked = await downloadRegistrationFile(new Request(`http://localhost/api/registrations/${reg.id}/documents/${doc!.id}`), { params: Promise.resolve({ id: reg.id, docId: doc!.id }) });
    expect(unlocked.status).toBe(200);
    expect(Buffer.from(await unlocked.arrayBuffer())).toEqual(pdf.data);
    const audits = await downloadAuditCount();
    await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, actor.id));
    try {
      for (const docId of [doc!.id, "00000000-0000-0000-0000-000000000001"]) {
        const locked = await downloadRegistrationFile(new Request(`http://localhost/api/registrations/${reg.id}/documents/${docId}`), { params: Promise.resolve({ id: reg.id, docId }) });
        expect(locked.status).toBe(403);
        expect(await locked.json()).toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
      }
      expect(await downloadAuditCount()).toBe(audits);
    } finally { await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, actor.id)); }
  });
  it("refuses a same-size tampered dossier blob before download/audit", async () => {
    const owner = await userByEmail("a-admin@test.example");
    const [visa] = await db.select().from(visaTypes).where(eq(visaTypes.code, "FR-SCH-TOUR"));
    const app = await createDraftApplication({ agencyId: owner.agencyId!, visaTypeId: visa!.id, createdBy: owner });
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.applicationId, app.id));
    const pdf = registrationPdf();
    const doc = await uploadDocument({ applicationId: app.id, actor: owner, checklistItemId: item!.id, file: pdf });
    expect(doc.sha256).toBe(sha256Hex(pdf.data));

    request.cookie = (await createSession(owner.id)).token;
    const beforeAudit = await downloadAuditCount();
    const [blob] = await db.select().from(documentBlobs).where(eq(documentBlobs.key, doc.storageKey));
    expect(blob).toBeDefined();
    const tampered = Buffer.from(blob!.data);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
    await db.update(documentBlobs).set({ data: tampered }).where(eq(documentBlobs.key, doc.storageKey));
    try {
      const response = await downloadDossierFile(new Request(`http://localhost/api/documents/${doc.id}`), { params: Promise.resolve({ id: doc.id }) });
      expect(response.status).toBe(500);
      expect(await downloadAuditCount()).toBe(beforeAudit);
    } finally {
      await db.update(documentBlobs).set({ data: blob!.data }).where(eq(documentBlobs.key, doc.storageKey));
    }
  });

  it("refuses a same-size tampered registration blob before download/audit", async () => {
    const pdf = registrationPdf();
    const reg = await submitAgencyRegistration({ data: registrationData(), files: [pdf], ipAddress: nextIp() });
    const [doc] = await db.select().from(agencyRegistrationDocuments).where(eq(agencyRegistrationDocuments.registrationId, reg.id));
    expect(doc).toBeDefined();
    expect(doc!.sha256).toBe(sha256Hex(pdf.data));

    const actor = await userByEmail("admin@test.example");
    request.cookie = (await createSession(actor.id)).token;
    const beforeAudit = await downloadAuditCount();
    const [blob] = await db.select().from(documentBlobs).where(eq(documentBlobs.key, doc!.storageKey));
    expect(blob).toBeDefined();
    const tampered = Buffer.from(blob!.data);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
    await db.update(documentBlobs).set({ data: tampered }).where(eq(documentBlobs.key, doc!.storageKey));
    try {
      const response = await downloadRegistrationFile(new Request(`http://localhost/api/registrations/${reg.id}/documents/${doc!.id}`), { params: Promise.resolve({ id: reg.id, docId: doc!.id }) });
      expect(response.status).toBe(500);
      expect(await downloadAuditCount()).toBe(beforeAudit);
    } finally {
      await db.update(documentBlobs).set({ data: blob!.data }).where(eq(documentBlobs.key, doc!.storageKey));
    }
  });

});
