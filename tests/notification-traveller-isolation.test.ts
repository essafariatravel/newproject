import { describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { applicants, applications, notifications, visaTypes } from "@/db/schema";
import { createDraftApplication } from "@/lib/applications";
import { listNotificationsForUser } from "@/lib/queries";

suiteSetup();

describe("notification traveller data isolation", () => {
  it("never borrows an unrelated applicant for a registration notification", async () => {
    const owner = await userByEmail("a-admin@test.example");
    const otherAgency = await userByEmail("b-admin@test.example");
    const visa = (await db.select().from(visaTypes).limit(1))[0]!;
    const application = await createDraftApplication({
      agencyId: owner.agencyId!,
      visaTypeId: visa.id,
      createdBy: owner,
    });
    await db.insert(applicants).values({
      applicationId: application.id,
      firstName: "Synthetic",
      lastName: "Traveller",
      fullName: "SYNTHETIC OTHER AGENCY TRAVELLER",
      nationality: "Moroccan",
    });
    const [registration] = await db.insert(notifications).values({
      userId: otherAgency.id,
      type: "REGISTRATION_SUBMITTED",
      title: "New registration without any application",
      body: "Synthetic registration for isolation test",
      applicationId: null,
    }).returning({ id: notifications.id });
    const [linked] = await db.insert(notifications).values({
      userId: owner.id,
      agencyId: owner.agencyId!,
      type: "APPLICATION_SUBMITTED",
      title: "Synthetic application",
      body: "Synthetic application notification",
      applicationId: application.id,
    }).returning({ id: notifications.id });
    try {
      const recipientRows = await listNotificationsForUser(otherAgency.id, 100);
      const unrelated = recipientRows.find((row) => row.id === registration!.id);
      expect(unrelated).toBeDefined();
      expect(unrelated!.applicationId).toBeNull();
      expect(unrelated!.travellerName).toBeNull();
      expect(unrelated!.destination).toBeNull();
      expect(unrelated!.reference).toBeNull();

      const ownerRows = await listNotificationsForUser(owner.id, 100);
      const related = ownerRows.find((row) => row.id === linked!.id);
      expect(related).toBeDefined();
      expect(related!.applicationId).toBe(application.id);
      expect(related!.travellerName).toBe("SYNTHETIC OTHER AGENCY TRAVELLER");
      expect(related!.reference).toBe(application.reference);
    } finally {
      await db.delete(notifications).where(inArray(notifications.id, [registration!.id, linked!.id]));
      await db.delete(applicants).where(eq(applicants.applicationId, application.id));
      await db.delete(applications).where(eq(applications.id, application.id));
    }
  });
});
