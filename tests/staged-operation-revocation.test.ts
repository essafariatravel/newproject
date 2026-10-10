import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { agencies, applicants, applications, auditLogs, documentBlobs, documents, priorities, statuses, statusTransitions, users, walletTopupRequests, walletTransactions } from "@/db/schema";
import { updateAccount } from "@/lib/account-security";
import { changeApplicationStatus, createDraftApplication, recordApplicationDecision, submitApplication } from "@/lib/applications";
import { listRequirementsForVisaType, submitVisaRequest } from "@/lib/requests";
import { createTopupRequest, processTopupRequest } from "@/lib/topup";
import { storageProvider } from "@/lib/storage";
import type { AuthUser } from "@/lib/types";

suiteSetup();
beforeEach(async () => { await resetData(); await seedFixtures(); });
afterEach(() => vi.restoreAllMocks());

const bytes = Buffer.from("%PDF-1.4 staged revocation regression");
const file = { name: "official.pdf", type: "application/pdf", size: bytes.length, data: bytes };
type CapturedActor = AuthUser & { credentialVersion: number };
type Revocation = "suspension" | "forced sign-out" | "suspension followed by reactivation" | "role change";
const revocations: Revocation[] = ["suspension", "forced sign-out", "suspension followed by reactivation", "role change"];

async function capturedActor(email: string): Promise<CapturedActor> {
  const actor = await userByEmail(email);
  const [row] = await db.select({ version: users.credentialVersion }).from(users).where(eq(users.id, actor.id));
  return { ...actor, credentialVersion: row!.version };
}

async function revoke(actor: CapturedActor, mode: Revocation) {
  const owner = await userByEmail("superadmin@test.example");
  if (mode === "role change") {
    await updateAccount(owner, actor.id, { role: actor.agencyId ? "AGENCY_USER" : "ACCOUNTING" });
  } else if (mode === "forced sign-out") {
    await updateAccount(owner, actor.id, { forceSignOut: true });
  } else {
    await updateAccount(owner, actor.id, { toggleStatus: true });
    if (mode === "suspension followed by reactivation") await updateAccount(owner, actor.id, { toggleStatus: true });
  }
}

/** The real storage write finishes, then a separate authorized identity mutation commits. */
function revokeAfterPut(actor: CapturedActor, mode: Revocation) {
  const provider = storageProvider(), put = provider.put.bind(provider), keys: string[] = [];
  let revoked = false;
  vi.spyOn(provider, "put").mockImplementation(async (key, data, mimeType) => {
    await put(key, data, mimeType); keys.push(key);
    if (!revoked) { revoked = true; await revoke(actor, mode); }
  });
  return keys;
}

async function requestInput(actor: CapturedActor) {
  await db.update(agencies).set({ balance: "1000.00" }).where(eq(agencies.id, actor.agencyId!));
  const visa = (await db.execute(sql`select id,country_id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string; country_id: string };
  const requirements = await listRequirementsForVisaType(visa.id);
  return { actor, countryId: visa.country_id, visaTypeId: visa.id, idempotencyKey: crypto.randomUUID(),
    travellers: [{ fullName: "Staged traveller", nationality: "DZ" }],
    documents: requirements.filter(r => r.required).map(r => ({ documentTypeId: r.documentTypeId, file })) };
}

describe("staged operations revalidate the actor before committing", () => {
  for (const mode of revocations) {
    it(`does not create a top-up after ${mode} during receipt staging`, async () => {
      const actor = await capturedActor("a-admin@test.example"), keys = revokeAfterPut(actor, mode);
      await expect(createTopupRequest({ actor, agencyId: actor.agencyId!, amount: 100, proof: file })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(await db.select().from(walletTopupRequests)).toHaveLength(0);
      expect(await db.select().from(documentBlobs).where(inArray(documentBlobs.key, keys))).toHaveLength(0);
      expect(await db.select().from(auditLogs).where(eq(auditLogs.action, "WALLET_TOPUP_REQUESTED"))).toHaveLength(0);
    });

    it(`does not credit a top-up after ${mode} during receipt verification`, async () => {
      const owner = await capturedActor("a-admin@test.example"), staff = await capturedActor("admin@test.example");
      const topup = await createTopupRequest({ actor: owner, agencyId: owner.agencyId!, amount: 100, proof: file });
      const provider = storageProvider(), get = provider.get.bind(provider);
      vi.spyOn(provider, "get").mockImplementationOnce(async key => { const result = await get(key); await revoke(staff, mode); return result; });
      await expect(processTopupRequest({ requestId: topup.id, actor: staff, decision: "CREDIT" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect((await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.id, topup.id)))[0]!.status).toBe("PENDING");
      expect((await db.select().from(agencies).where(eq(agencies.id, owner.agencyId!)))[0]!.balance).toBe("0.00");
      expect(await db.select().from(walletTransactions)).toHaveLength(0);
      expect(await db.select().from(auditLogs).where(eq(auditLogs.action, "WALLET_TOPUP_PROCESSED"))).toHaveLength(0);
    });

    it(`does not submit or debit after ${mode} during dossier staging`, async () => {
      const actor = await capturedActor("a-admin@test.example"), input = await requestInput(actor), keys = revokeAfterPut(actor, mode);
      await expect(submitVisaRequest(input)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(await db.select().from(applications)).toHaveLength(0);
      expect(await db.select().from(documents)).toHaveLength(0);
      expect(await db.select().from(walletTransactions)).toHaveLength(0);
      expect((await db.select().from(agencies).where(eq(agencies.id, actor.agencyId!)))[0]!.balance).toBe("1000.00");
      expect(await db.select().from(documentBlobs).where(inArray(documentBlobs.key, keys))).toHaveLength(0);
    });

    it(`does not record a final decision after ${mode} during official document staging`, async () => {
      const staff = await capturedActor("admin@test.example"), agencyActor = await capturedActor("a-admin@test.example");
      const visa = (await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string };
      const app = await createDraftApplication({ agencyId: agencyActor.agencyId!, visaTypeId: visa.id, createdBy: staff });
      const state = (await db.execute(sql`select id from statuses where code='IN_PROCESS'`)).rows[0] as { id: string };
      await db.update(applications).set({ statusId: state.id, submittedAt: new Date() }).where(eq(applications.id, app.id));
      const keys = revokeAfterPut(staff, mode);
      await expect(recordApplicationDecision({ applicationId: app.id, actor: staff, outcome: "APPROVED", file })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      const [unchanged] = await db.select().from(applications).where(eq(applications.id, app.id));
      expect(unchanged!.statusId).toBe(state.id); expect(unchanged!.decisionAt).toBeNull();
      expect(await db.select().from(documents).where(eq(documents.applicationId, app.id))).toHaveLength(0);
      expect(await db.select().from(documentBlobs).where(inArray(documentBlobs.key, keys))).toHaveLength(0);
      expect(await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, app.id), eq(auditLogs.action, "APPLICATION_DECISION_RECORDED")))).toHaveLength(0);
    });
  }

  it("does not create a legacy draft with a captured suspended actor", async () => {
    const actor = await capturedActor("a-admin@test.example");
    const visa = (await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string };
    await revoke(actor, "suspension");
    await expect(createDraftApplication({ agencyId: actor.agencyId!, visaTypeId: visa.id, createdBy: actor })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await db.select().from(applications)).toHaveLength(0);
  });

  it("does not perform a generic transition with a captured revoked Staff actor", async () => {
    const staff = await capturedActor("admin@test.example"), agencyActor = await capturedActor("a-admin@test.example");
    const visa = (await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string };
    const app = await createDraftApplication({ agencyId: agencyActor.agencyId!, visaTypeId: visa.id, createdBy: staff });
    const state = (await db.execute(sql`select id from statuses where code='SUBMITTED'`)).rows[0] as { id: string };
    await db.update(applications).set({ statusId: state.id, submittedAt: new Date() }).where(eq(applications.id, app.id));
    await revoke(staff, "forced sign-out");
    await expect(changeApplicationStatus({ applicationId: app.id, toStatusCode: "DOCUMENTS_CHECKING", actor: staff })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]!.statusId).toBe(state.id);
  });

  it("does not debit a legacy submission with a captured revoked Staff actor", async () => {
    const staff = await capturedActor("admin@test.example"), agencyActor = await capturedActor("a-admin@test.example");
    const visa = (await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string };
    const app = await createDraftApplication({ agencyId: agencyActor.agencyId!, visaTypeId: visa.id, createdBy: staff });
    await db.insert(applicants).values({ applicationId: app.id, firstName: "Legacy", lastName: "Traveller", fullName: "Legacy Traveller", nationality: "DZ" });
    await db.update(agencies).set({ balance: "1000.00" }).where(eq(agencies.id, agencyActor.agencyId!));
    await revoke(staff, "forced sign-out");
    await expect(submitApplication({ applicationId: app.id, actor: staff, overrideReason: "Legacy revocation regression fixture" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const [unchanged] = await db.select().from(applications).where(eq(applications.id, app.id));
    expect(unchanged!.submittedAt).toBeNull();
    expect(await db.select().from(walletTransactions)).toHaveLength(0);
    expect((await db.select().from(agencies).where(eq(agencies.id, agencyActor.agencyId!)))[0]!.balance).toBe("1000.00");
  });

  it("does not let an Agency choose Urgent through legacy draft service", async () => {
    const actor = await capturedActor("a-admin@test.example");
    const visa = (await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string };
    await expect(createDraftApplication({ agencyId: actor.agencyId!, visaTypeId: visa.id, createdBy: actor, priorityCode: "URGENT" })).rejects.toMatchObject({ code: "PRIORITY_INVALID" });
    expect(await db.select().from(applications)).toHaveLength(0);
  });

  it("does not create a legacy draft when Standard priority is inactive", async () => {
    const actor = await capturedActor("a-admin@test.example");
    const visa = (await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string };
    await db.update(priorities).set({ active: false }).where(eq(priorities.code, "STANDARD"));
    await expect(createDraftApplication({ agencyId: actor.agencyId!, visaTypeId: visa.id, createdBy: actor })).rejects.toMatchObject({ code: "PRIORITY_INVALID" });
    expect(await db.select().from(applications)).toHaveLength(0);
  });

  it("rejects a generic transition disabled after preflight but before its transaction", async () => {
    const staff = await capturedActor("admin@test.example"), owner = await capturedActor("a-admin@test.example");
    const visa = (await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string };
    const app = await createDraftApplication({ agencyId: owner.agencyId!, visaTypeId: visa.id, createdBy: staff });
    const [submitted] = await db.select().from(statuses).where(eq(statuses.code, "SUBMITTED"));
    const [target] = await db.insert(statuses).values({ code: "SECURITY_REVIEW", name: "Security review", active: true }).returning();
    await db.insert(statusTransitions).values({ fromStatusId: submitted!.id, toStatusId: target!.id, scope: "STAFF" });
    await db.update(applications).set({ statusId: submitted!.id, submittedAt: new Date() }).where(eq(applications.id, app.id));
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementationOnce(async (fn, config) => {
      await db.update(statuses).set({ active: false }).where(eq(statuses.id, target!.id));
      return transaction(fn, config);
    });
    await expect(changeApplicationStatus({ applicationId: app.id, toStatusCode: target!.code, actor: staff })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]!.statusId).toBe(submitted!.id);
  });
});
