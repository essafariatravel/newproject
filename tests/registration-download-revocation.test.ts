import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures, userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
import { db } from "@/lib/db";
import { agencyRegistrationDocuments, agencyRegistrations, auditLogs } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { updateAccount } from "@/lib/account-security";
import { storageProvider } from "@/lib/storage";
import { GET as downloadRegistration } from "@/app/api/registrations/[id]/documents/[docId]/route";

suiteSetup();
beforeEach(async () => { await resetData(); await seedFixtures(); });
afterEach(() => { vi.restoreAllMocks(); request.cookie = ""; });

async function privateRegistrationDocument() {
  // A synthetic historical record exercises download authorization without
  // publishing any owner legal text or sending a registration externally.
  const [registration] = await db.insert(agencyRegistrations).values({ reference: "REG-REVOCATION-TEST", legalName: "Synthetic registration",
    phone: "+213000000000", email: "synthetic-registration@example.test", contactFirstName: "Synthetic", contactLastName: "Contact",
    contactEmail: "synthetic-contact@example.test", contactPhone: "+213000000000", businessType: "TRAVEL_AGENCY",
    termsAccepted: true, privacyAcknowledged: true, infoConfirmed: true }).returning();
  const data = Buffer.from("%PDF-1.4 private registration revocation fixture");
  const key = `agency-registrations/${registration!.id}/${crypto.randomUUID()}`;
  await storageProvider().put(key, data, "application/pdf");
  const [document] = await db.insert(agencyRegistrationDocuments).values({ registrationId: registration!.id,
    category: "COMMERCIAL_REGISTRATION", originalFilename: "private-registration.pdf", mimeType: "application/pdf",
    sizeBytes: data.length, storageKey: key }).returning();
  const staff = await userByEmail("admin@test.example");
  request.cookie = (await createSession(staff.id)).token;
  return { staff, id: registration!.id, docId: document!.id, data };
}

describe("registration downloads revalidate identity after private storage retrieval", () => {
  for (const mode of ["forced sign-out", "suspension followed by reactivation"] as const) {
    it(`returns no registration bytes after ${mode} during storage retrieval`, async () => {
      const fixture = await privateRegistrationDocument();
      const provider = storageProvider(), get = provider.get.bind(provider);
      vi.spyOn(provider, "get").mockImplementationOnce(async key => {
        const stored = await get(key), owner = await userByEmail("superadmin@test.example");
        if (mode === "forced sign-out") await updateAccount(owner, fixture.staff.id, { forceSignOut: true });
        else { await updateAccount(owner, fixture.staff.id, { toggleStatus: true }); await updateAccount(owner, fixture.staff.id, { toggleStatus: true }); }
        return stored;
      });
      const response = await downloadRegistration(new Request("http://localhost/api/registrations/document"), { params: Promise.resolve({ id: fixture.id, docId: fixture.docId }) });
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain("%PDF");
      expect(await db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.action, "REGISTRATION_DOCUMENT_DOWNLOADED"))).toHaveLength(0);
    });
  }

  it("returns the genuine stored bytes and attributes a durable audit for current authorized Staff", async () => {
    const fixture = await privateRegistrationDocument();
    const response = await downloadRegistration(new Request("http://localhost/api/registrations/document"), { params: Promise.resolve({ id: fixture.id, docId: fixture.docId }) });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(fixture.data);
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.action, "REGISTRATION_DOCUMENT_DOWNLOADED"));
    expect(rows).toHaveLength(1); expect(rows[0]!.actorId).toBe(fixture.staff.id);
    expect(rows[0]!.entityId).toBe(fixture.docId);
  });
});
