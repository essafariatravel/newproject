import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { agencies, auditLogs, users, walletTransactions } from "@/db/schema";
import { updateAccount } from "@/lib/account-security";
import { createTopupRequest } from "@/lib/topup";
import { listRequirementsForVisaType, submitVisaRequest } from "@/lib/requests";
import { storageProvider } from "@/lib/storage";
import type { AuthUser } from "@/lib/types";

suiteSetup();
beforeEach(async () => { await resetData(); await seedFixtures(); });
afterEach(() => vi.restoreAllMocks());
const data = Buffer.from("%PDF-1.4 synthetic authorized replay fixture");
const file = { name: "replay.pdf", type: "application/pdf", size: data.length, data };

async function capturedActor() {
  const actor = await userByEmail("a-admin@test.example");
  const [row] = await db.select({ credentialVersion: users.credentialVersion }).from(users).where(eq(users.id, actor.id));
  return { ...actor, credentialVersion: row!.credentialVersion };
}
type Revocation = "suspension" | "forced sign-out" | "suspension followed by reactivation" | "role change";
async function revoke(actor: AuthUser, mode: Revocation) {
  const owner = await userByEmail("superadmin@test.example");
  if (mode === "forced sign-out") await updateAccount(owner, actor.id, { forceSignOut: true });
  else if (mode === "role change") await updateAccount(owner, actor.id, { role: "AGENCY_USER" });
  else { await updateAccount(owner, actor.id, { toggleStatus: true }); if (mode === "suspension followed by reactivation") await updateAccount(owner, actor.id, { toggleStatus: true }); }
}
async function nativeInput(actor: AuthUser) {
  await db.update(agencies).set({ balance: "1000.00" }).where(eq(agencies.id, actor.agencyId!));
  const visa = (await db.execute(sql`select id,country_id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string; country_id: string };
  const requirements = await listRequirementsForVisaType(visa.id);
  return { actor, countryId: visa.country_id, visaTypeId: visa.id, idempotencyKey: crypto.randomUUID(),
    travellers: [{ fullName: "Synthetic traveller", nationality: "DZ" }],
    documents: requirements.filter(row => row.required).map(row => ({ documentTypeId: row.documentTypeId, file })) };
}

describe("idempotent replays still require current authorization", () => {
  for (const mode of ["suspension", "forced sign-out", "suspension followed by reactivation", "role change"] as const) {
    it(`denies a top-up replay after ${mode}`, async () => {
      const actor = await capturedActor(), idempotencyKey = crypto.randomUUID();
      await createTopupRequest({ actor, agencyId: actor.agencyId!, amount: 125, proof: file, idempotencyKey });
      await revoke(actor, mode);
      const audits = await db.select({ id: auditLogs.id }).from(auditLogs);
      const upload = vi.spyOn(storageProvider(), "put");
      await expect(createTopupRequest({ actor, agencyId: actor.agencyId!, amount: 125, idempotencyKey }))
        .rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(upload).not.toHaveBeenCalled();
      expect(await db.select({ id: auditLogs.id }).from(auditLogs)).toEqual(audits);
      expect(await db.select({ id: walletTransactions.id }).from(walletTransactions)).toHaveLength(0);
    });

    it(`denies a submitted dossier replay after ${mode}`, async () => {
      const actor = await capturedActor(), input = await nativeInput(actor);
      await submitVisaRequest(input);
      await revoke(actor, mode);
      const ledger = await db.select().from(walletTransactions);
      const upload = vi.spyOn(storageProvider(), "put");
      await expect(submitVisaRequest(input)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(upload).not.toHaveBeenCalled();
      expect(await db.select().from(walletTransactions)).toEqual(ledger);
    });
  }

  it("replays an authorized top-up without requiring another proof upload", async () => {
    const actor = await capturedActor(), idempotencyKey = crypto.randomUUID();
    const created = await createTopupRequest({ actor, agencyId: actor.agencyId!, amount: 125, proof: file, idempotencyKey });
    const upload = vi.spyOn(storageProvider(), "put");
    expect(await createTopupRequest({ actor, agencyId: actor.agencyId!, amount: 125, idempotencyKey })).toEqual(created);
    expect(upload).not.toHaveBeenCalled();
  });

  it("replays an authorized submitted request without another upload or debit", async () => {
    const actor = await capturedActor(), input = await nativeInput(actor);
    const created = await submitVisaRequest(input), upload = vi.spyOn(storageProvider(), "put");
    const replayed = await submitVisaRequest(input);
    expect(replayed.applicationId).toBe(created.applicationId); expect(replayed.reused).toBe(true);
    expect(upload).not.toHaveBeenCalled();
    expect(await db.select({ id: walletTransactions.id }).from(walletTransactions)).toHaveLength(1);
  });
});
