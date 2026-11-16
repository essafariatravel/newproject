import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { applicants, applications, notifications, visaTypes } from "@/db/schema";
import { createDraftApplication } from "@/lib/applications";
import { listNotificationsForUser } from "@/lib/queries";
import { NotificationsPage } from "@/components/notifications-page";
import * as uiI18n from "@/lib/ui-i18n";

suiteSetup();

describe("notification details follow the reader's locale", () => {
  it("localizes historic dossier details for staff and agency without changing stored snapshots or free-text notes", async () => {
    const staff = await userByEmail("admin@test.example");
    const agencyUser = await userByEmail("a-admin@test.example");
    const agency = await agencyByEmail("ops@agencya.example");
    const [seed] = await db.select().from(visaTypes).where(eq(visaTypes.code, "FR-SCH-TOUR"));
    const [visa] = await db.insert(visaTypes).values({
      ...seed!, id: undefined, code: "FR-NOTIFICATION-I18N",
      name: "First-Time Sticker Visa (30D/90D)",
      nameFr: "Visa autocollant – première demande (30 j/90 j)",
      nameAr: "تأشيرة ملصقة – طلب أول (30 يومًا/90 يومًا)",
    }).returning();
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa!.id, createdBy: staff });
    await db.insert(applicants).values({
      applicationId: app.id, firstName: "BOB", lastName: "TEST", fullName: "BOB TEST",
      dateOfBirth: "1988-08-08", nationality: "Algerian", passportNumber: "I18N12345", passportExpiryDate: "2032-01-01",
    });
    const staffBody = "The submitted visa needs review.";
    const agencyBody = "PASSPORT FLOU RENVOYER UN AUTRE D'UNE MEILLEURE QUALITE";
    await db.insert(notifications).values([
      { userId: staff.id, applicationId: app.id, agencyId: agency.id, type: "APPLICATION_SUBMITTED", title: "Application submitted", body: staffBody, link: `/admin/applications/${app.id}` },
      { userId: agencyUser.id, applicationId: app.id, agencyId: agency.id, type: "DOCUMENT_REQUESTED", title: "Document requested", body: agencyBody, link: `/portal/applications/${app.id}` },
    ]);

    for (const [locale, country, programme] of [
      ["en", "France", visa!.name],
      ["fr", "France", visa!.nameFr!],
      ["ar", "فرنسا", visa!.nameAr!],
    ] as const) {
      vi.spyOn(uiI18n, "getUiLocale").mockResolvedValue(locale);
      const staffHtml = renderToStaticMarkup(await NotificationsPage({ user: staff, basePath: "/admin/notifications" }));
      const agencyHtml = renderToStaticMarkup(await NotificationsPage({ user: agencyUser, basePath: "/portal/notifications" }));
      for (const html of [staffHtml, agencyHtml]) {
        expect(html).toContain(`<bdi>${country}</bdi>`);
        expect(html).toContain(`<bdi>${programme}</bdi>`);
        expect(html).toContain("<bdi>BOB TEST</bdi>");
        if (locale !== "en") expect(html).not.toContain(`<bdi>${visa!.name}</bdi>`);
      }
      expect(staffHtml).toContain(agency.tradingName || agency.legalName);
      expect(agencyHtml).not.toContain(agency.tradingName || agency.legalName);
      // Written instructions are user content and must not be silently translated.
      expect(agencyHtml.replaceAll("&#x27;", "'")).toContain(agencyBody);
      expect(staffHtml).not.toContain(agencyBody);
    }

    const [stored] = await db.select().from(applications).where(eq(applications.id, app.id));
    expect(stored?.visaTypeName).toBe(visa!.name);
    expect(stored?.countryName).toBe("France");
    expect(await listNotificationsForUser(agencyUser.id)).toHaveLength(1);
  });
});
