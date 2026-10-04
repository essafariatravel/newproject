import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, seedFixtures, userByEmail } from "./helpers/fixtures";
import { resetData } from "./helpers/pg";
import { request } from "./helpers/request";
import { db } from "@/lib/db";
import { agencies, applications, auditLogs, communications, countries, documents, walletTopupRequests, walletTransactions } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { adjustWallet } from "@/lib/wallet";
import { createDraftApplication } from "@/lib/applications";
import { reviewDocument, uploadDocument, uploadResubmission } from "@/lib/documents";
import { applyPriceAdjustment } from "@/lib/price-adjustments";
import { listRequirementsForVisaType, submitVisaRequest } from "@/lib/requests";
import { createSession } from "@/lib/auth";
import { createCountryAction } from "@/app/actions/config";
import { postMessageAction } from "@/app/actions/communications";
import { createTopupRequest, processTopupRequest } from "@/lib/topup";
import { GET as downloadDocument } from "@/app/api/documents/[id]/route";
import { GET as downloadProof } from "@/app/api/topups/[id]/proof/route";
import { storageProvider } from "@/lib/storage";
import { updateAccount } from "@/lib/account-security";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
suiteSetup();
beforeEach(async () => { await resetData(); await seedFixtures(); });
afterEach(async () => {
  vi.restoreAllMocks();
  request.cookie = "";
  await db.execute(sql`drop trigger if exists operation_audit_test_failure on audit_logs`);
  await db.execute(sql`drop function if exists operation_audit_test_failure()`);
});
async function rejectAudit(action: string) {
  if (!/^[A-Z_]+$/.test(action)) throw new Error("Invalid test action");
  await db.execute(sql.raw(`create function operation_audit_test_failure() returns trigger language plpgsql as $$
    begin if new.action='${action}' then raise exception 'Audit unavailable'; end if; return new; end $$`));
  await db.execute(sql`create trigger operation_audit_test_failure before insert on audit_logs for each row execute function operation_audit_test_failure()`);
}
async function dossierDocument() {
  const actor = await userByEmail("a-admin@test.example");
  const visa = (await db.execute(sql`select id from visa_types where code='JP-BUS'`)).rows[0] as { id: string };
  const app = await createDraftApplication({ agencyId: actor.agencyId!, visaTypeId: visa.id, createdBy: actor });
  const item = (await db.execute(sql`select id from checklist_items where application_id=${app.id} limit 1`)).rows[0] as { id: string };
  const doc = await uploadDocument({ applicationId: app.id, actor, checklistItemId: item.id,
    file: { name: "audit.pdf", type: "application/pdf", size: 20, data: Buffer.from("%PDF-1.4 audit proof") } });
  return { app, doc, actor };
}
async function pendingTopup() {
  const actor = await userByEmail("b-admin@test.example");
  const bytes = Buffer.from("%PDF-1.4 bank receipt");
  const created = await createTopupRequest({ agencyId: actor.agencyId!, actor, amount: 100,
    proof: { name: "receipt.pdf", type: "application/pdf", size: bytes.length, data: bytes } });
  return { actor, created };
}

describe("durable operation audits", () => {
  it("returns no dossier bytes if the session is revoked during storage retrieval", async () => {
    const { doc, actor } = await dossierDocument();
    request.cookie = (await createSession(actor.id)).token;
    const provider = storageProvider(), read = provider.get.bind(provider);
    vi.spyOn(provider, "get").mockImplementationOnce(async key => {
      const stored = await read(key);
      await updateAccount(await userByEmail("superadmin@test.example"), actor.id, {forceSignOut:true});
      return stored;
    });
    const response = await downloadDocument(new Request("http://localhost/api/documents/" + doc.id), { params: Promise.resolve({id:doc.id}) });
    expect(response.status).toBe(401); expect(await response.text()).not.toContain("%PDF");
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action,"DOCUMENT_DOWNLOADED"))).toHaveLength(0);
  });
  it("returns no receipt bytes if the session is revoked during storage retrieval", async () => {
    const { created, actor } = await pendingTopup();
    request.cookie = (await createSession(actor.id)).token;
    const provider = storageProvider(), read = provider.get.bind(provider);
    vi.spyOn(provider, "get").mockImplementationOnce(async key => {
      const stored = await read(key);
      await updateAccount(await userByEmail("superadmin@test.example"), actor.id, {forceSignOut:true});
      return stored;
    });
    const response = await downloadProof(new Request("http://localhost/api/topups/proof"), { params: Promise.resolve({id:created.id}) });
    expect(response.status).toBe(401); expect(await response.text()).not.toContain("%PDF");
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action,"TOPUP_RECEIPT_DOWNLOADED"))).toHaveLength(0);
  });
  it("rolls back a compensating price adjustment, wallet and ledger when its audit fails", async () => {
    const actor = await userByEmail("b-admin@test.example"), staff = await userByEmail("admin@test.example");
    await adjustWallet({ agencyId: actor.agencyId!, actor: staff, amount: 1000, reason: "Audit regression funding" });
    const visa = (await db.execute(sql`select id,country_id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as {id:string;country_id:string};
    const requirements = await listRequirementsForVisaType(visa.id), bytes = Buffer.from("%PDF-1.4 audit document");
    const app = await submitVisaRequest({ actor, countryId: visa.country_id, visaTypeId: visa.id, idempotencyKey: crypto.randomUUID(),
      travellers: [{fullName:"Audit traveller",nationality:"DZ"}], documents: requirements.filter(r=>r.required).map(r=>({documentTypeId:r.documentTypeId,
        file:{name:"audit.pdf",type:"application/pdf",size:bytes.length,data:bytes}})) });
    const before = (await db.select().from(agencies).where(eq(agencies.id, actor.agencyId!)))[0]!;
    const ledgerBefore = await db.select().from(walletTransactions).where(eq(walletTransactions.applicationId, app.applicationId));
    await rejectAudit("PRICE_ADJUSTED");
    await expect(applyPriceAdjustment({applicationId:app.applicationId,actor:staff,type:"DISCOUNT",amount:25,reason:"Audited commercial correction"})).rejects.toThrow();
    expect((await db.select().from(agencies).where(eq(agencies.id,actor.agencyId!)))[0]!.balance).toBe(before.balance);
    expect((await db.select().from(applications).where(eq(applications.id,app.applicationId)))[0]!.effectivePrice).toBe("120.00");
    expect(await db.select().from(walletTransactions).where(eq(walletTransactions.applicationId, app.applicationId))).toHaveLength(ledgerBefore.length);
    expect((await db.execute(sql`select count(*)::int n from application_price_adjustments where application_id=${app.applicationId}`)).rows[0]).toEqual({n:0});
  });
  it("rolls back replacement file and blob if its resubmission audit fails", async () => {
    const { app, doc, actor } = await dossierDocument();
    await reviewDocument({documentId:doc.id,actor:await userByEmail("agent@test.example"),status:"REJECTED",rejectionReason:"Unreadable original"});
    const countBefore=(await db.execute(sql`select count(*)::int n from document_blobs where key like ${`applications/${app.id}/%`}`)).rows[0];
    await rejectAudit("DOCUMENT_RESUBMITTED");
    const bytes=Buffer.from("%PDF-1.4 corrected original");
    await expect(uploadResubmission({applicationId:app.id,actor,originalDocumentId:doc.id,file:{name:"replacement.pdf",type:"application/pdf",size:bytes.length,data:bytes}})).rejects.toThrow();
    expect(await db.select().from(documents).where(eq(documents.applicationId,app.id))).toHaveLength(1);
    expect((await db.execute(sql`select count(*)::int n from document_blobs where key like ${`applications/${app.id}/%`}`)).rows[0]).toEqual(countBefore);
  });
  it("fails closed when an immutable audit cannot be persisted", async () => {
    await rejectAudit("AUDIT_PROBE");
    await expect(recordAudit({ actor: null, action: "AUDIT_PROBE", entity: "test" })).rejects.toThrow();
  });
  it("rolls back manual wallet balance and ledger if its audit fails", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const actor = await userByEmail("accounting@test.example");
    const before = await db.select().from(walletTransactions).where(eq(walletTransactions.agencyId, agency.id));
    await rejectAudit("WALLET_CREDIT");
    await expect(adjustWallet({ agencyId: agency.id, actor, amount: 73, reason: "Audited adjustment" })).rejects.toThrow();
    expect((await db.select().from(agencies).where(eq(agencies.id, agency.id)))[0]?.balance).toBe(agency.balance);
    expect(await db.select().from(walletTransactions).where(eq(walletTransactions.agencyId, agency.id))).toHaveLength(before.length);
  });
  it("rolls back document review when its audit is unavailable", async () => {
    const { doc } = await dossierDocument();
    await rejectAudit("DOCUMENT_ACCEPTED");
    await expect(reviewDocument({ documentId: doc.id, actor: await userByEmail("agent@test.example"), status: "ACCEPTED" })).rejects.toThrow();
    const unchanged = (await db.select().from(documents).where(eq(documents.id, doc.id)))[0]!;
    expect(unchanged.status).toBe("UPLOADED");
    expect(unchanged.reviewedAt).toBeNull();
  });
  it("does not return dossier bytes unless their download audit was written", async () => {
    const { doc, actor } = await dossierDocument();
    request.cookie = (await createSession(actor.id)).token;
    await rejectAudit("DOCUMENT_DOWNLOADED");
    const response = await downloadDocument(new Request("http://localhost/api/documents/" + doc.id), { params: Promise.resolve({ id: doc.id }) });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("%PDF");
  });
  it("rolls back country configuration when its audit fails", async () => {
    request.cookie = (await createSession((await userByEmail("superadmin@test.example")).id)).token;
    await rejectAudit("CONFIG_COUNTRY_CREATED");
    const form = new FormData(); form.set("name", "Audit country"); form.set("iso2", "ZZ");
    await expect(createCountryAction(form)).rejects.toThrow("NEXT_REDIRECT");
    expect(await db.select().from(countries).where(eq(countries.iso2, "ZZ"))).toHaveLength(0);
  });
  it("rolls back a real communication action when its audit fails", async () => {
    const { app, actor } = await dossierDocument();
    request.cookie = (await createSession(actor.id)).token;
    await rejectAudit("MESSAGE_POSTED");
    const form = new FormData(); form.set("applicationId", app.id); form.set("body", "Durable message"); form.set("back", "/portal/communications");
    await expect(postMessageAction(form)).rejects.toThrow("NEXT_REDIRECT");
    expect(await db.select().from(communications).where(eq(communications.applicationId, app.id))).toHaveLength(0);
  });
  it("keeps rejected top-ups pending if rejection audit fails", async () => {
    const { created } = await pendingTopup();
    await rejectAudit("WALLET_TOPUP_REJECTED");
    await expect(processTopupRequest({ requestId: created.id, actor: await userByEmail("accounting@test.example"), decision: "REJECT", decisionNote: "Bank proof rejected" })).rejects.toThrow();
    expect((await db.select().from(walletTopupRequests).where(eq(walletTopupRequests.id, created.id)))[0]?.status).toBe("PENDING");
  });
  it("does not return top-up receipt bytes unless their download audit was written", async () => {
    const {actor,created:pending} = await pendingTopup();
    request.cookie = (await createSession(actor.id)).token;
    await rejectAudit("TOPUP_RECEIPT_DOWNLOADED");
    const response = await downloadProof(new Request("http://localhost/api/topups/proof"), { params: Promise.resolve({ id: pending.id }) });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("%PDF");
  });
});
