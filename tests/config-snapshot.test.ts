import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import { applications, checklistItems, visaRequirements, visaTypes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { createDraftApplication, resyncChecklist } from "@/lib/applications";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";

async function visaId() {
  return ((await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string }).id;
}

describe("configuration propagation & historical integrity", () => {
  it("changing the visa fee affects NEW applications but never existing ones", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const staffA = await userByEmail("a-admin@test.example");
    const vid = await visaId();

    const oldApp = await createDraftApplication({ agencyId: agency.id, visaTypeId: vid, createdBy: staffA });
    expect(oldApp.fee).toBe("120.00");

    // admin changes the fee
    await db.update(visaTypes).set({ fee: "150.00", processingMaxDays: 30 }).where(eq(visaTypes.id, vid));

    const newApp = await createDraftApplication({ agencyId: agency.id, visaTypeId: vid, createdBy: staffA });
    expect(newApp.fee).toBe("150.00");
    expect(newApp.processingMaxDays).toBe(30);

    const oldRow = (await db.select().from(applications).where(eq(applications.id, oldApp.id)))[0]!;
    expect(oldRow.fee).toBe("120.00"); // historical snapshot preserved
    expect(oldRow.processingMaxDays).toBe(25);

    // restore
    await db.update(visaTypes).set({ fee: "120.00", processingMaxDays: 25 }).where(eq(visaTypes.id, vid));
  });

  it("deactivating a requirement preserves submitted checklists; drafts re-sync additions", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const staffA = await userByEmail("a-admin@test.example");
    const vid = await visaId();

    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: vid, createdBy: staffA });
    const before = await db.select().from(checklistItems).where(eq(checklistItems.applicationId, app.id));
    expect(before.length).toBe(4);

    // add a new document type requirement — drafts resync, nothing is destroyed
    const extra = (
      await db.execute(sql`select id from document_types where code='INSURANCE'`)
    ).rows[0] as { id: string };
    await db.insert(visaRequirements).values({ visaTypeId: vid, documentTypeId: extra.id, required: true, sortOrder: 35 });
    await resyncChecklist(app.id, vid);
    const afterAdd = await db.select().from(checklistItems).where(eq(checklistItems.applicationId, app.id));
    expect(afterAdd.length).toBe(5);
    expect(afterAdd.some((i) => i.documentTypeCode === "INSURANCE")).toBe(true);

    // remove the requirement from the catalogue — existing checklist items are preserved
    await db.delete(visaRequirements).where(sql`${visaRequirements.visaTypeId} = ${vid} and ${visaRequirements.documentTypeId} = ${extra.id}`);
    await resyncChecklist(app.id, vid);
    const afterRemove = await db.select().from(checklistItems).where(eq(checklistItems.applicationId, app.id));
    expect(afterRemove.length).toBe(5); // historical meaning preserved
  });

  it("visa type rename does not rewrite historical applications", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const staffA = await userByEmail("a-admin@test.example");
    const vid = await visaId();
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: vid, createdBy: staffA });
    await db.update(visaTypes).set({ name: "France Schengen Tourist (renamed)" }).where(eq(visaTypes.id, vid));
    const row = (await db.select().from(applications).where(eq(applications.id, app.id)))[0]!;
    expect(row.visaTypeName).toBe("France Schengen Tourist");
    await db.update(visaTypes).set({ name: "France Schengen Tourist" }).where(eq(visaTypes.id, vid));
  });

  it("reference numbers are unique", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const staffA = await userByEmail("a-admin@test.example");
    const vid = await visaId();
    const refs = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: vid, createdBy: staffA });
      refs.add(app.reference);
    }
    expect(refs.size).toBe(5);
  });
});
