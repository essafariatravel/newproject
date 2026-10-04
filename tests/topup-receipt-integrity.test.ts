import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { agencies, auditLogs, documentBlobs, walletTopupRequests, walletTransactions } from "@/db/schema";
import { createTopupRequest, processTopupRequest } from "@/lib/topup";
import { storageProvider } from "@/lib/storage";

suiteSetup();
beforeEach(async () => { await resetData(); await seedFixtures(); });
afterEach(() => vi.restoreAllMocks());

async function pending() {
  const agencyActor = await userByEmail("a-admin@test.example"), staff = await userByEmail("admin@test.example");
  const bytes = Buffer.from("%PDF-1.4 receipt integrity fixture");
  const created = await createTopupRequest({ actor: agencyActor, agencyId: agencyActor.agencyId!, amount: 125,
    proof: { name: "transfer.pdf", type: "application/pdf", size: bytes.length, data: bytes } });
  const [row] = await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.id, created.id));
  return { agencyActor, staff, bytes, request: row! };
}

async function remainsPending(fixture: Awaited<ReturnType<typeof pending>>) {
  const [request] = await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.id, fixture.request.id));
  expect(request!.status).toBe("PENDING"); expect(request!.walletTransactionId).toBeNull();
  expect((await db.select({ balance: agencies.balance }).from(agencies).where(eq(agencies.id, fixture.agencyActor.agencyId!)))[0]!.balance).toBe("0.00");
  expect(await db.select({ id: walletTransactions.id }).from(walletTransactions)).toHaveLength(0);
  expect(await db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.action, "WALLET_TOPUP_PROCESSED"))).toHaveLength(0);
}

describe("a genuine valid persisted receipt is required for wallet top-up credit", () => {
  for (const corruption of ["empty stored bytes", "size mismatch", "MIME mismatch", "invalid format signature"] as const) {
    it(`refuses ${corruption} without creating a credit or processing audit`, async () => {
      const fixture = await pending();
      const patch = corruption === "empty stored bytes" ? { data: Buffer.alloc(0), sizeBytes: 0 }
        : corruption === "size mismatch" ? { data: Buffer.concat([fixture.bytes, Buffer.from(" extra")]), sizeBytes: fixture.bytes.length + 6 }
        : corruption === "MIME mismatch" ? { mimeType: "image/png" }
        : { data: Buffer.alloc(fixture.bytes.length, 88) };
      await db.update(documentBlobs).set(patch).where(eq(documentBlobs.key, fixture.request.proofStorageKey!));
      await expect(processTopupRequest({ requestId: fixture.request.id, actor: fixture.staff, decision: "CREDIT" })).rejects.toMatchObject({ code: "PROOF_INVALID" });
      await remainsPending(fixture);
    });
  }

  it("refuses receipt metadata changed after retrieval but before the request lock", async () => {
    const fixture = await pending(), provider = storageProvider(), get = provider.get.bind(provider);
    vi.spyOn(provider, "get").mockImplementationOnce(async key => {
      const stored = await get(key);
      await db.update(walletTopupRequests).set({ proofSizeBytes: fixture.bytes.length + 1 }).where(eq(walletTopupRequests.id, fixture.request.id));
      return stored;
    });
    await expect(processTopupRequest({ requestId: fixture.request.id, actor: fixture.staff, decision: "CREDIT" })).rejects.toMatchObject({ code: "PROOF_CHANGED" });
    await remainsPending(fixture);
  });

  it("refuses a DB receipt corrupted after retrieval but before credit commit", async () => {
    const fixture = await pending(), provider = storageProvider(), get = provider.get.bind(provider);
    vi.spyOn(provider, "get").mockImplementationOnce(async key => {
      const stored = await get(key);
      await db.update(documentBlobs).set({ data: Buffer.alloc(0), sizeBytes: 0 }).where(eq(documentBlobs.key, key));
      return stored;
    });
    await expect(processTopupRequest({ requestId: fixture.request.id, actor: fixture.staff, decision: "CREDIT" })).rejects.toMatchObject({ code: "PROOF_INVALID" });
    await remainsPending(fixture);
  });

  it("credits a valid persisted receipt exactly once under concurrent attempts", async () => {
    const fixture = await pending();
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => processTopupRequest({ requestId: fixture.request.id, actor: fixture.staff, decision: "CREDIT" })));
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect((await db.select({ balance: agencies.balance }).from(agencies).where(eq(agencies.id, fixture.agencyActor.agencyId!)))[0]!.balance).toBe("125.00");
    expect(await db.select({ id: walletTransactions.id }).from(walletTransactions)).toHaveLength(1);
    expect(await db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.action, "WALLET_TOPUP_PROCESSED"))).toHaveLength(1);
  });
});
