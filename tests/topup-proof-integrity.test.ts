import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { agencyByEmail, authUser, userByEmail } from "./helpers/fixtures";
import { paymentProof } from "./helpers/payment-proof";
import { db } from "@/lib/db";
import { auditLogs, documentBlobs, walletTopupRequests } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { getBalance } from "@/lib/wallet";
import { createTopupRequest, processTopupRequest } from "@/lib/topup";
import { sha256Hex } from "@/lib/file-integrity";
import { storageProvider } from "@/lib/storage";
import { GET as downloadTopupProof } from "@/app/api/topups/[id]/proof/route";

suiteSetup();
afterEach(() => { vi.restoreAllMocks(); request.cookie = ""; });

async function prepareTopup() {
  const agency = await agencyByEmail("ops@agencya.example");
  const admin = await userByEmail("a-admin@test.example");
  await db.update(walletTopupRequests).set({ status: "CANCELLED", processedAt: new Date() })
    .where(eq(walletTopupRequests.agencyId, agency.id));
  const proof = paymentProof();
  const created = await createTopupRequest({
    agencyId: agency.id,
    amount: 32100,
    actor: admin,
    proof,
  });
  const [row] = await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.id, created.id));
  return { agency, admin, proof, created, row: row! };
}

async function receiptDownloadAuditCount(id: string) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLogs)
    .where(sql`${auditLogs.action} = 'TOPUP_RECEIPT_DOWNLOADED' and ${auditLogs.entityId} = ${id}`);
  return row!.n;
}

describe("wallet top-up receipt integrity", () => {
  it("serves the receipt using its immutable validated MIME rather than provider response MIME", async () => {
    const { admin, proof, created } = await prepareTopup();
    request.cookie = (await createSession(admin.id)).token;
    vi.spyOn(storageProvider(), "get").mockResolvedValueOnce({ data: proof.data, mimeType: "text/html" });
    const response = await downloadTopupProof(new Request("http://localhost/api/topups/proof"), { params: Promise.resolve({ id: created.id }) });
    expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe(proof.type);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(proof.data);
  });

  it("persists SHA-256 and refuses same-size tampering before download or credit", async () => {
    const { agency, admin, proof, created, row } = await prepareTopup();
    expect(row.proofSha256).toBe(sha256Hex(proof.data));
    expect(row.proofSizeBytes).toBe(proof.data.length);
    expect(row.proofStorageKey).toBeTruthy();
    const [audit] = await db.select().from(auditLogs).where(sql`${auditLogs.action} = 'WALLET_TOPUP_REQUESTED' and ${auditLogs.entityId} = ${created.id}`);
    expect(audit).toBeDefined();
    expect(audit!.metadata).toMatchObject({ evidenceIntegrity: "SHA256_RECORDED" });
    expect(JSON.stringify(audit!.metadata)).not.toContain(proof.name);
    expect(JSON.stringify(audit!.metadata)).not.toContain(row.proofSha256);

    const [blob] = await db.select().from(documentBlobs).where(eq(documentBlobs.key, row.proofStorageKey!));
    expect(blob).toBeDefined();
    const tampered = Buffer.from(blob!.data);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;

    // Permanent top-up bytes cannot be rewritten through normal SQL after 0028.
    await expect(
      db.update(documentBlobs).set({ data: tampered }).where(eq(documentBlobs.key, row.proofStorageKey!)),
    ).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringMatching(/immutable/i) }) });

    // Fault a provider response without relaxing permanent database protection.
    vi.spyOn(storageProvider(), "get").mockResolvedValue({ data: tampered, mimeType: proof.type });

    request.cookie = (await createSession(admin.id)).token;
    const auditsBefore = await receiptDownloadAuditCount(created.id);
    const download = await downloadTopupProof(
      new Request(`http://localhost/api/topups/${created.id}/proof`),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(download.status).toBe(500);
    expect(await receiptDownloadAuditCount(created.id)).toBe(auditsBefore);

    const accountingUser = await userByEmail("accounting@test.example");
    const accounting = authUser({ id: accountingUser.id, email: accountingUser.email, role: "ACCOUNTING" });
    const before = Number((await getBalance(agency.id)).balance);
    await expect(processTopupRequest({ requestId: created.id, actor: accounting, decision: "CREDIT" }))
      .rejects.toMatchObject({ code: "PROOF_INVALID" });
    expect(Number((await getBalance(agency.id)).balance)).toBe(before);
    expect((await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.id, created.id)))[0]!.status).toBe("PENDING");

  });

  it("makes the financial request identity and receipt metadata immutable", async () => {
    const { created, row } = await prepareTopup();
    await expect(
      db.update(walletTopupRequests).set({ amount: "999999.00" }).where(eq(walletTopupRequests.id, created.id)),
    ).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringMatching(/immutable/i) }) });
    await expect(
      db.update(walletTopupRequests).set({ proofStorageKey: row.proofStorageKey + "-swap" }).where(eq(walletTopupRequests.id, created.id)),
    ).rejects.toMatchObject({ cause: expect.objectContaining({ message: expect.stringMatching(/immutable/i) }) });

    const saved = (await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.id, created.id)))[0]!;
    expect(saved.amount).toBe(row.amount);
    expect(saved.proofStorageKey).toBe(row.proofStorageKey);
    expect(saved.proofSha256).toBe(row.proofSha256);
  });
});
