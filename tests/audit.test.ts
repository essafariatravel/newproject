import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import { applicants as applicantsTb, auditLogs, checklistItems } from "@/db/schema";
import { sql } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { createDraftApplication, submitApplication, changeApplicationStatus } from "@/lib/applications";
import { uploadDocument } from "@/lib/documents";
import { adjustWallet } from "@/lib/wallet";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";

describe("audit logging", () => {
  it("records actor, role, agency, action, entity and metadata for sensitive actions", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const staffA = await userByEmail("a-admin@test.example");
    const _superAdmin = await userByEmail("superadmin@test.example");
    const accounting = await userByEmail("accounting@test.example");

    // wallet
    await adjustWallet({ agencyId: agency.id, amount: 250, reason: "audit verification", actor: accounting });

    // application lifecycle
    const visaId = (
      (await db.execute(sql`select id from visa_types where code='JP-BUS'`)).rows[0] as { id: string }
    ).id;
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visaId, createdBy: staffA });
    await db.insert(applicantsTb).values({
      applicationId: app.id,
      firstName: "Aud",
      lastName: "Itor",
      dateOfBirth: "1993-09-09",
      nationality: "Japanese",
      passportNumber: "JP4433221",
      passportExpiryDate: "2033-01-01",
    });
    const required = await db
      .select()
      .from(checklistItems)
      .where(sql`${checklistItems.applicationId} = ${app.id} and ${checklistItems.required} = true`);
    for (const item of required) {
      await uploadDocument({
        applicationId: app.id,
        actor: staffA,
        file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 512, data: Buffer.from("d") },
        checklistItemId: item.id,
      });
    }
    await submitApplication({ applicationId: app.id, actor: staffA });
    const agent = await userByEmail("agent@test.example");
    await changeApplicationStatus({ applicationId: app.id, toStatusCode: "DOCUMENTS_CHECKING", actor: agent });

    const actions = (await db.select().from(auditLogs)).map((a) => a.action);
    expect(actions).toContain("WALLET_CREDIT");
    expect(actions).toContain("APPLICATION_CREATED");
    expect(actions).toContain("DOCUMENT_UPLOADED");
    expect(actions).toContain("APPLICATION_SUBMITTED");
    expect(actions).toContain("STATUS_CHANGED");

    // actor + role recorded
    const credit = (await db.select().from(auditLogs).where(sql`${auditLogs.action} = 'WALLET_CREDIT'`)).pop()!;
    expect(credit.actorEmail).toBe(accounting.email);
    expect(credit.actorRole).toBe("ACCOUNTING");
    expect(credit.agencyId).toBe(agency.id);
    expect(credit.metadata).toBeTruthy();
  });

  it("recordAudit never throws into business flow", async () => {
    // invalid foreign keys are swallowed and logged, not raised
    await expect(
      recordAudit({
        actor: null,
        action: "X_TEST",
        entity: "test",
        entityId: "00000000-0000-0000-0000-0000000000ee",
        agencyId: "00000000-0000-0000-0000-0000000000ef",
      }),
    ).resolves.toBeUndefined();
  });
});
