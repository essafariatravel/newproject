import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { agencies, applications, documentBlobs, documents } from "@/db/schema";
import { createDraftApplication, recordApplicationDecision } from "@/lib/applications";
import { listRequirementsForVisaType, submitVisaRequest } from "@/lib/requests";
import { sha256Hex } from "@/lib/file-integrity";

suiteSetup();
beforeEach(async () => { await resetData(); await seedFixtures(); });
const data = Buffer.from("%PDF-1.4 canonical fingerprint synthetic fixture");
const file = { name: "canonical.pdf", type: "application/pdf", size: data.length, data };

describe("canonical workflows preserve the original file fingerprint", () => {
  it("persists SHA-256 for every document in a native submitted request", async () => {
    const actor = await userByEmail("a-admin@test.example");
    await db.update(agencies).set({ balance: "1000.00" }).where(eq(agencies.id, actor.agencyId!));
    const visa = (await db.execute(sql`select id,country_id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string; country_id: string };
    const requirements = await listRequirementsForVisaType(visa.id);
    const submitted = await submitVisaRequest({ actor, countryId: visa.country_id, visaTypeId: visa.id,
      idempotencyKey: crypto.randomUUID(), travellers: [{ fullName: "Synthetic traveller", nationality: "DZ" }],
      documents: requirements.filter(row => row.required).map(row => ({ documentTypeId: row.documentTypeId, file })) });
    const rows = await db.select({ sha256: documents.sha256, data: documentBlobs.data }).from(documents)
      .innerJoin(documentBlobs, eq(documents.storageKey, documentBlobs.key)).where(eq(documents.applicationId, submitted.applicationId));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) { expect(row.sha256).toBe(sha256Hex(data)); expect(sha256Hex(row.data)).toBe(row.sha256); }
  });

  it("persists SHA-256 on the genuine official decision file", async () => {
    const actor = await userByEmail("admin@test.example"), owner = await userByEmail("a-admin@test.example");
    const visa = (await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string };
    const app = await createDraftApplication({ agencyId: owner.agencyId!, visaTypeId: visa.id, createdBy: actor });
    const state = (await db.execute(sql`select id from statuses where code='IN_PROCESS'`)).rows[0] as { id: string };
    await db.update(applications).set({ statusId: state.id, submittedAt: new Date() }).where(eq(applications.id, app.id));
    const decided = await recordApplicationDecision({ applicationId: app.id, actor, outcome: "APPROVED", file });
    const [row] = await db.select({ sha256: documents.sha256, data: documentBlobs.data }).from(documents)
      .innerJoin(documentBlobs, eq(documents.storageKey, documentBlobs.key)).where(eq(documents.id, decided.documentId));
    expect(row!.sha256).toBe(sha256Hex(data)); expect(sha256Hex(row!.data)).toBe(row!.sha256);
  });
});
