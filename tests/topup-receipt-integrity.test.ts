import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { QueryResult } from "pg";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures, userByEmail } from "./helpers/fixtures";
import { db, pool } from "@/lib/db";
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
      // Fault the provider response, not protected permanent database rows.
      const data = corruption === "empty stored bytes" ? Buffer.alloc(0)
        : corruption === "size mismatch" ? Buffer.concat([fixture.bytes, Buffer.from(" extra")])
        : corruption === "invalid format signature" ? Buffer.alloc(fixture.bytes.length, 88) : fixture.bytes;
      vi.spyOn(storageProvider(), "get").mockResolvedValueOnce({ data, mimeType: corruption === "MIME mismatch" ? "image/png" : "application/pdf" });
      await expect(processTopupRequest({ requestId: fixture.request.id, actor: fixture.staff, decision: "CREDIT" })).rejects.toMatchObject({ code: "PROOF_INVALID" });
      await remainsPending(fixture);
    });
  }

  it("keeps receipt metadata immutable during retrieval and credits only the unchanged request", async () => {
    const fixture = await pending(), provider = storageProvider(), get = provider.get.bind(provider);
    vi.spyOn(provider, "get").mockImplementationOnce(async key => {
      const stored = await get(key);
      await expect(db.update(walletTopupRequests).set({ proofSizeBytes: fixture.bytes.length + 1 }).where(eq(walletTopupRequests.id, fixture.request.id)))
        .rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringMatching(/immutable/i) }) });
      return stored;
    });
    await processTopupRequest({ requestId: fixture.request.id, actor: fixture.staff, decision: "CREDIT" });
    const [saved] = await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.id, fixture.request.id));
    expect(saved!.proofSizeBytes).toBe(fixture.bytes.length);
    expect(await db.select({ id: walletTransactions.id }).from(walletTransactions)).toHaveLength(1);
  });

  it("prevents a permanent DB receipt rewrite after retrieval", async () => {
    const fixture = await pending(), provider = storageProvider(), get = provider.get.bind(provider);
    vi.spyOn(provider, "get").mockImplementationOnce(async key => {
      const stored = await get(key);
      await expect(db.update(documentBlobs).set({ data: Buffer.alloc(0), sizeBytes: 0 }).where(eq(documentBlobs.key, key)))
        .rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringMatching(/immutable/i) }) });
      return stored;
    });
    await processTopupRequest({ requestId: fixture.request.id, actor: fixture.staff, decision: "CREDIT" });
    const [blob] = await db.select().from(documentBlobs).where(eq(documentBlobs.key, fixture.request.proofStorageKey!));
    expect(blob!.data).toEqual(fixture.bytes);
    expect(await db.select({ id: walletTransactions.id }).from(walletTransactions)).toHaveLength(1);
  });

  it("rejects same-size altered PDF bytes from the provider using the original SHA-256", async () => {
    const fixture = await pending(), altered = Buffer.from(fixture.bytes);
    altered[altered.length - 1] = altered[altered.length - 1]! ^ 1;
    vi.spyOn(storageProvider(), "get").mockResolvedValueOnce({ data: altered, mimeType: "application/pdf" });
    await expect(processTopupRequest({ requestId: fixture.request.id, actor: fixture.staff, decision: "CREDIT" })).rejects.toMatchObject({ code: "PROOF_INVALID" });
    await remainsPending(fixture);
  });

  for (const fault of ["locked receipt metadata", "locked blob bytes"] as const) {
    it(`revalidates ${fault} on its existing transaction client before credit`, async () => {
      const fixture = await pending(), provider = storageProvider(), get = provider.get.bind(provider);
      let intercepted = false;
      vi.spyOn(provider, "get").mockImplementationOnce(async key => {
        const stored = await get(key);
        const client = await pool.connect(), query = client.query.bind(client);
        vi.spyOn(client, "query").mockImplementation((async (...args: unknown[]) => {
          const result = await (query as (...values: unknown[]) => Promise<QueryResult<Record<string, unknown>>>)(...args);
          const text = typeof args[0] === "string" ? args[0] : "";
          const match = fault === "locked blob bytes" ? /from .*document_blobs.*for share/i : /from .*wallet_topup_requests[\s\S]*for update/i;
          if (match.test(text)) {
            intercepted = true;
            result.rows = result.rows.map(row => {
              if (fault === "locked receipt metadata") return { ...row, proof_size_bytes: Number(row.proof_size_bytes) + 1 };
              const altered = Buffer.from(row.data as Buffer); altered[altered.length - 1] = altered[altered.length - 1]! ^ 1;
              return { ...row, data: altered };
            });
          }
          return result;
        }) as typeof client.query);
        vi.spyOn(pool, "connect").mockImplementationOnce((async () => client) as typeof pool.connect);
        return stored;
      });
      await expect(processTopupRequest({ requestId: fixture.request.id, actor: fixture.staff, decision: "CREDIT" }))
        .rejects.toMatchObject({ code: fault === "locked blob bytes" ? "PROOF_INVALID" : "PROOF_CHANGED" });
      expect(intercepted).toBe(true);
      await remainsPending(fixture);
    });
  }

  it("credits a valid persisted receipt exactly once under concurrent attempts", async () => {
    const fixture = await pending();
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => processTopupRequest({ requestId: fixture.request.id, actor: fixture.staff, decision: "CREDIT" })));
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect((await db.select({ balance: agencies.balance }).from(agencies).where(eq(agencies.id, fixture.agencyActor.agencyId!)))[0]!.balance).toBe("125.00");
    expect(await db.select({ id: walletTransactions.id }).from(walletTransactions)).toHaveLength(1);
    expect(await db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.action, "WALLET_TOPUP_PROCESSED"))).toHaveLength(1);
  });
});
