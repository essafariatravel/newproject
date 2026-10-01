import { describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, nextIp, registrationData, registrationPdf, userByEmail } from "./helpers/fixtures";
import { db, pool } from "@/lib/db";
import { agencyRegistrationDocuments, applications, auditLogs, documentBlobs, documents, notifications, walletTransactions } from "@/db/schema";
import { startRegistrationReview, submitAgencyRegistration } from "@/lib/registrations";
import { createRegistrationFollowup, resolveRegistrationFollowup, uploadRegistrationFollowup } from "@/lib/registration-followup";
import { listRequirementsForVisaType, submitVisaRequest } from "@/lib/requests";
import { applyPriceAdjustment, getApplicationPricing } from "@/lib/price-adjustments";
import { adjustWallet, getBalance } from "@/lib/wallet";
import { storageProvider } from "@/lib/storage";
import * as notificationService from "@/lib/notifications";
import * as auditService from "@/lib/audit";

suiteSetup();

// Preserve the configured pool size while also exercising the Vercel budget
// when a developer runs this file with the larger local pool.
async function withThreeClientBudget<T>(run: () => Promise<T>): Promise<T> {
  const reserved: PoolClient[] = [];
  try {
    for (let i = 3; i < (pool.options.max ?? 10); i++) reserved.push(await pool.connect());
    return await run();
  } finally { for (const client of reserved) client.release(); }
}

function threeArrivals() {
  let arrivals = 0;
  let release!: () => void;
  let timer: ReturnType<typeof setTimeout>;
  const ready = new Promise<void>((resolve, reject) => {
    release = resolve;
    timer = setTimeout(() => reject(new Error("Concurrent operations did not reach the gate.")), 5000);
  });
  return async () => {
    if (++arrivals === 3) { clearTimeout(timer); release(); }
    await ready;
  };
}

async function requestInput() {
  const agency = await agencyByEmail("ops@agencyb.example");
  const actor = await userByEmail("b-admin@test.example"), staff = await userByEmail("admin@test.example");
  await adjustWallet({ agencyId: agency.id, amount: 10000, actor: staff, reason: "Pool regression funding" });
  const visa = (await db.execute(sql`select id, country_id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string; country_id: string };
  const requirements = await listRequirementsForVisaType(visa.id);
  return { agency, staff, input: { actor, idempotencyKey: crypto.randomUUID(), countryId: visa.country_id, visaTypeId: visa.id,
    travellers: [{ fullName: "Amina Kaci", nationality: "DZ" }],
    documents: requirements.filter((item) => item.required).map((item) => ({ documentTypeId: item.documentTypeId, file: registrationPdf() })) } };
}

async function followup() {
  const admin = await userByEmail("admin@test.example");
  const reg = await submitAgencyRegistration({ data: registrationData(), files: [], ipAddress: nextIp() });
  await startRegistrationReview(reg.id, admin);
  const values = { actor: admin, registrationId: reg.id, note: "Please send your company certificate.",
    slots: [{ category: "COMMERCIAL_REGISTRATION" as const, label: "Company certificate" }] };
  const issued = await createRegistrationFollowup(values);
  const slot = (await resolveRegistrationFollowup(issued.token))!.slots[0]!;
  return { reg, values, issued, slot };
}

function stagedRequestGate() {
  const provider = storageProvider(), put = provider.put.bind(provider);
  const stagedKeys: string[] = [], perApplication = new Map<string, number>();
  const ready = threeArrivals();
  const spy = vi.spyOn(provider, "put").mockImplementation(async (key, data, mimeType) => {
    await put(key, data, mimeType);
    stagedKeys.push(key);
    const applicationId = key.split("/")[1]!;
    const count = (perApplication.get(applicationId) ?? 0) + 1;
    perApplication.set(applicationId, count);
    // FR-SCH-TOUR has three required fixture documents.
    if (count === 3) await ready();
  });
  return { stagedKeys, spy };
}

describe("three-client pool transaction boundaries", () => {
  it("concurrent follow-up uploads fill one slot and clean every rejected staged blob", async () => {
    const { reg, issued, slot } = await followup();
    const provider = storageProvider(), put = provider.put.bind(provider), arrive = threeArrivals();
    const spy = vi.spyOn(provider, "put").mockImplementation(async (key, data, mimeType) => {
      await arrive();
      return put(key, data, mimeType);
    });
    let results: PromiseSettledResult<void>[];
    try {
      results = await withThreeClientBudget(() => Promise.allSettled(Array.from({ length: 3 }, () =>
        uploadRegistrationFollowup({ token: issued.token, slotId: slot.id, file: registrationPdf() }))));
    } finally { spy.mockRestore(); }
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(2);
    for (const result of rejected) expect(result.reason).toMatchObject({ code: "INVALID_LINK" });
    expect(await db.select().from(agencyRegistrationDocuments).where(eq(agencyRegistrationDocuments.registrationId, reg.id))).toHaveLength(1);
    const blobs = (await db.execute(sql`select count(*)::int as count from document_blobs where key like ${`agency-registrations/${reg.id}/%`}`)).rows[0] as { count: number };
    expect(blobs.count).toBe(1);
    expect(await resolveRegistrationFollowup(issued.token)).toBeNull();
  });

  it("concurrent submissions retain staff and agency notifications after committing", async () => {
    const { agency, staff, input } = await requestInput();
    const before = await getBalance(agency.id), arrive = threeArrivals();
    const staffIds = notificationService.staffUserIds;
    const spy = vi.spyOn(notificationService, "staffUserIds").mockImplementation(async (roles) => {
      await arrive();
      return staffIds(roles);
    });
    let results: Awaited<ReturnType<typeof submitVisaRequest>>[];
    try {
      results = await withThreeClientBudget(() => Promise.all(Array.from({ length: 3 }, () => submitVisaRequest({ ...input, idempotencyKey: crypto.randomUUID() }))));
    } finally { spy.mockRestore(); }
    expect(Number(before.balance) - Number((await getBalance(agency.id)).balance)).toBe(360);
    for (const result of results) {
      expect(await db.select().from(notifications).where(and(eq(notifications.applicationId, result.applicationId), eq(notifications.userId, staff.id), eq(notifications.type, "APPLICATION_SUBMITTED")))).toHaveLength(1);
      expect(await db.select().from(notifications).where(and(eq(notifications.applicationId, result.applicationId), eq(notifications.userId, input.actor.id), eq(notifications.type, "APPLICATION_SUBMITTED")))).toHaveLength(1);
      expect(await db.select().from(walletTransactions).where(and(eq(walletTransactions.applicationId, result.applicationId), eq(walletTransactions.type, "APPLICATION_CHARGE")))).toHaveLength(1);
    }
  });

  it("concurrent adjustments retain one audit and ledger row per committed adjustment", async () => {
    const { agency, staff, input } = await requestInput();
    const submitted = await submitVisaRequest(input), before = await getBalance(agency.id), arrive = threeArrivals();
    const audit = auditService.recordAudit;
    const spy = vi.spyOn(auditService, "recordAudit").mockImplementation(async (entry) => {
      if (entry.action === "PRICE_ADJUSTED") await arrive();
      return audit(entry);
    });
    let results: Awaited<ReturnType<typeof applyPriceAdjustment>>[];
    try {
      results = await withThreeClientBudget(() => Promise.all(Array.from({ length: 3 }, () => applyPriceAdjustment({
        applicationId: submitted.applicationId, actor: staff, type: "DISCOUNT", amount: 10,
        reason: "Concurrent pool regression discount", idempotencyKey: crypto.randomUUID(),
      }))));
    } finally { spy.mockRestore(); }
    expect(Number((await getBalance(agency.id)).balance) - Number(before.balance)).toBe(30);
    expect((await getApplicationPricing(submitted.applicationId))!.effectivePrice).toBe("90.00");
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, submitted.applicationId), eq(auditLogs.action, "PRICE_ADJUSTED")))).toHaveLength(3);
    expect(await db.select().from(walletTransactions).where(inArray(walletTransactions.id, results.map((result) => result.walletTransactionId)))).toHaveLength(3);
  });

  it("rechecks a revoked follow-up token after staging and deletes the rejected blob", async () => {
    const { reg, values, issued, slot } = await followup();
    const provider = storageProvider(), put = provider.put.bind(provider);
    const spy = vi.spyOn(provider, "put").mockImplementationOnce(async (key, data, mimeType) => {
      await put(key, data, mimeType);
      await createRegistrationFollowup(values);
    });
    try {
      await expect(uploadRegistrationFollowup({ token: issued.token, slotId: slot.id, file: registrationPdf() })).rejects.toMatchObject({ code: "INVALID_LINK" });
    } finally { spy.mockRestore(); }
    expect(await db.select().from(agencyRegistrationDocuments).where(eq(agencyRegistrationDocuments.registrationId, reg.id))).toHaveLength(0);
    const blobs = (await db.execute(sql`select count(*)::int as count from document_blobs where key like ${`agency-registrations/${reg.id}/%`}`)).rows[0] as { count: number };
    expect(blobs.count).toBe(0);
  });

  it("cleans concurrent idempotent request staging after releasing each client", async () => {
    const { agency, input } = await requestInput(), before = await getBalance(agency.id);
    const { stagedKeys, spy } = stagedRequestGate();
    let results: Awaited<ReturnType<typeof submitVisaRequest>>[];
    try {
      results = await withThreeClientBudget(() => Promise.all(Array.from({ length: 3 }, () => submitVisaRequest(input))));
    } finally { spy.mockRestore(); }
    expect(new Set(results.map((result) => result.applicationId)).size).toBe(1);
    expect(results.filter((result) => result.reused)).toHaveLength(2);
    expect(Number(before.balance) - Number((await getBalance(agency.id)).balance)).toBe(120);
    const persisted = await db.select().from(documents).where(eq(documents.applicationId, results[0]!.applicationId));
    expect(persisted).toHaveLength(3);
    expect((await db.select().from(documentBlobs).where(inArray(documentBlobs.key, stagedKeys))).map((blob) => blob.key).sort()).toEqual(persisted.map((doc) => doc.storageKey).sort());
  });

  it("cleans all staged request files after concurrent transaction failures", async () => {
    const { agency, staff, input } = await requestInput();
    const balance = await getBalance(agency.id);
    await adjustWallet({ agencyId: agency.id, actor: staff, amount: -Number(balance.balance), reason: "Drain pool regression wallet" });
    const { stagedKeys, spy } = stagedRequestGate();
    let results: PromiseSettledResult<Awaited<ReturnType<typeof submitVisaRequest>>>[];
    try {
      results = await withThreeClientBudget(() => Promise.allSettled(Array.from({ length: 3 }, () => submitVisaRequest({ ...input, idempotencyKey: crypto.randomUUID() }))));
    } finally { spy.mockRestore(); }
    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    }
    expect(await db.select().from(documentBlobs).where(inArray(documentBlobs.key, stagedKeys))).toHaveLength(0);
    expect(await db.select().from(applications).where(inArray(applications.id, stagedKeys.map((key) => key.split("/")[1]!)))).toHaveLength(0);
    expect((await getBalance(agency.id)).balance).toBe("0.00");
  });
});
