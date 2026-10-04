import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { applicants, applications, checklistItems, documentBlobs, documents } from "@/db/schema";
import { pool } from "@/lib/db";
import { createLegacyReconciliationService } from "@/lib/legacy-reconciliation";
import { ReconciliationWarning } from "@/components/reconciliation-warning";
import { createDraftApplication, getDecisionDocuments, recordApplicationDecision } from "@/lib/applications";

suiteSetup();
beforeEach(async () => { await resetData(); await seedFixtures(); });
afterEach(() => vi.unstubAllEnvs());
const bytes = Buffer.from("%PDF-1.4 synthetic official decision");
const file = { name: "decision.pdf", type: "application/pdf", size: bytes.length, data: bytes };

async function processing() {
  const actor = await userByEmail("admin@test.example"), owner = await userByEmail("a-admin@test.example");
  const visa = (await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string };
  const app = await createDraftApplication({ agencyId: owner.agencyId!, visaTypeId: visa.id, createdBy: actor });
  const state = (await db.execute(sql`select id from statuses where code='IN_PROCESS'`)).rows[0] as { id: string };
  await db.update(applications).set({ statusId: state.id, submittedAt: new Date() }).where(eq(applications.id, app.id));
  return { app, actor };
}
async function decided() {
  const { app, actor } = await processing();
  const decision = await recordApplicationDecision({ applicationId: app.id, actor, outcome: "APPROVED", file });
  const [doc] = await db.select().from(documents).where(eq(documents.id, decision.documentId));
  return { app, actor, doc: doc! };
}

describe("official decision presentation uses verified canonical documents", () => {
  it("does not present a generic unfinished approval upload as an official decision", async () => {
    const { app, actor } = await processing();
    const type = (await db.execute(sql`select id from document_types where code='DECISION_VISA_APPROVAL'`)).rows[0] as { id: string };
    const key = `test-unfinished/${crypto.randomUUID()}`;
    await db.insert(documentBlobs).values({ key, data: bytes, mimeType: file.type, sizeBytes: bytes.length });
    await db.insert(documents).values({ applicationId: app.id, documentTypeId: type.id, originalFilename: file.name,
      storageKey: key, mimeType: file.type, sizeBytes: bytes.length, uploadedBy: actor.id, status: "UPLOADED" });
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("presents the genuine persisted file from the canonical decision workflow", async () => {
    const { app, doc } = await decided();
    expect((await getDecisionDocuments(app.id)).map(row => row.id)).toEqual([doc.id]);
  });

  it("does not present an accepted historical record without its reviewer as valid proof", async () => {
    const { app, doc } = await decided();
    await db.update(documents).set({ reviewedBy: null }).where(eq(documents.id, doc.id));
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("does not present an accepted historical record without its uploader as valid proof", async () => {
    const { app, doc } = await decided();
    await db.update(documents).set({ uploadedBy: null }).where(eq(documents.id, doc.id));
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("does not present an accepted record when its original stored bytes are missing", async () => {
    const { app, doc } = await decided();
    await db.delete(documentBlobs).where(eq(documentBlobs.key, doc.storageKey));
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("does not present an accepted record when blob bytes disagree with the persisted size", async () => {
    const { app, doc } = await decided();
    await db.update(documentBlobs).set({ data: Buffer.from("damaged") }).where(eq(documentBlobs.key, doc.storageKey));
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it("keeps an unverified storage provider out of the official-proof presentation", async () => {
    const { app } = await decided();
    vi.stubEnv("STORAGE_PROVIDER", "supabase");
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
  });

  it.each(["review-time", "applicant-link", "checklist-link", "blob-mime", "unsupported-mime", "corrupt-signature"] as const)("never certifies malformed %s proof as healthy in reconciliation or dossier warnings", async defect => {
    const { app, actor, doc } = await decided();
    if (defect === "review-time") await db.update(documents).set({ reviewedAt: null }).where(eq(documents.id, doc.id));
    if (defect === "applicant-link") {
      const [traveller] = await db.insert(applicants).values({applicationId:app.id,fullName:"Synthetic malformed proof",firstName:"Synthetic",lastName:"proof",nationality:"DZ"}).returning();
      await db.update(documents).set({applicantId:traveller!.id}).where(eq(documents.id,doc.id));
    }
    if (defect === "checklist-link") {
      const [slot] = await db.select().from(checklistItems).where(eq(checklistItems.applicationId,app.id));
      await db.update(documents).set({checklistItemId:slot!.id}).where(eq(documents.id,doc.id));
    }
    if (defect === "blob-mime") await db.update(documentBlobs).set({mimeType:"image/jpeg"}).where(eq(documentBlobs.key,doc.storageKey));
    if (defect === "unsupported-mime") {
      await db.update(documents).set({mimeType:"application/octet-stream"}).where(eq(documents.id,doc.id));
      await db.update(documentBlobs).set({mimeType:"application/octet-stream"}).where(eq(documentBlobs.key,doc.storageKey));
    }
    if (defect === "corrupt-signature") await db.update(documentBlobs).set({data:Buffer.alloc(doc.sizeBytes)}).where(eq(documentBlobs.key,doc.storageKey));
    expect(await getDecisionDocuments(app.id)).toHaveLength(0);
    const reconciliation=createLegacyReconciliationService(pool);
    await reconciliation.scan(actor);
    const issue=(await reconciliation.list(actor)).find(issue=>issue.applicationId===app.id&&issue.kind==="MISSING_OFFICIAL_DECISION");
    expect(issue).toBeDefined();
    await expect(reconciliation.disposition(actor,{issueId:issue!.id,outcome:"RESTORED",note:"Synthetic malformed original remains unresolved."})).rejects.toMatchObject({code:"RECONCILIATION_UNRESOLVED"});
    expect(await ReconciliationWarning({applicationId:app.id,user:actor,locale:"en"})).not.toBeNull();
  });
});
