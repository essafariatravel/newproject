import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { suiteSetup } from "./helpers/global-state";
import { nextIp, registrationData, userByEmail } from "./helpers/fixtures";
import { createSession } from "./helpers/authenticated-session";
import { db, pool } from "@/lib/db";
import { agencies, applications, auditLogs, authRateLimits, sessions, statuses, users, visaTypes, walletTopupRequests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashToken } from "@/lib/crypto";
import { agencyClosurePreview, closeAgency, requireAgencyClosureTarget } from "@/lib/agency-closure";
import { authenticate } from "@/lib/auth";
import { issueAccessToken, resetAccountFromToken, resolveAccessToken } from "@/lib/account-recovery";
import { toggleAgencyAccess } from "@/lib/account-security";
import { approveRegistration, submitAgencyRegistration } from "@/lib/registrations";
import { listAgencies } from "@/lib/queries";
import { createDraftApplication, getApplicationForUser } from "@/lib/applications";
import { updateInternalNotesAction } from "@/app/actions/applications";
import { request } from "./helpers/request";
import { applyWalletMutation } from "@/lib/wallet";

suiteSetup();

async function operator() {
  await db.delete(authRateLimits);
  const actor = await userByEmail("superadmin@test.example");
  const minted = await createSession(actor.id);
  const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(minted.token)));
  return { ...actor, sessionId: session!.id, mfaPending: false, testToken: minted.token };
}
async function emptyAgency() {
  const actor = await operator();
  const data = registrationData();
  const reg = await submitAgencyRegistration({ data, files: [], ipAddress: nextIp() });
  const approved = await approveRegistration({ actor, registrationId: reg.id });
  return { actor, data, reg, approved };
}
function input(agencyId: string, name: string) {
  return { agencyId, confirmationName: name, currentPassword: "Test-Password-123", retentionReference: "OWNER-APPROVED-ARCHIVE-POLICY-TEST", retainUntil: "2030-12-31" };
}

describe("controlled agency closure target", () => {
  it("rejects Production and hosted production data before any database action", () => {
    expect(() => requireAgencyClosureTarget({ DATABASE_URL: "postgresql://postgres:example@db.xgetzgixalrsmuvfthpf.supabase.co/postgres", DATABASE_SCHEMA: "visa_os", VERCEL_ENV: "production" })).toThrow();
    expect(() => requireAgencyClosureTarget({ DATABASE_URL: "postgresql://postgres:postgres@localhost:5434/essafaria_test" })).not.toThrow();
    expect(() => requireAgencyClosureTarget({ DATABASE_URL: "postgresql://postgres:postgres@localhost:5434/essafaria_test?host=remote.example" })).toThrow();
  });
});

describe("controlled agency closure", () => {
  it("blocks live dossiers and preserves terminal archives for Staff while denying the former agency", async () => {
    const { actor, data, approved } = await emptyAgency();
    const [programme] = await db.select().from(visaTypes).limit(1);
    const app = await createDraftApplication({ agencyId: approved.agencyId, visaTypeId: programme!.id, createdBy: actor });
    const formerUser = await userByEmail(data.email);
    expect((await agencyClosurePreview(actor, approved.agencyId)).obligations).toContain("OPEN_APPLICATIONS");
    await expect(closeAgency(actor, input(approved.agencyId, data.legalName))).rejects.toMatchObject({ code: "OBLIGATIONS_ACKNOWLEDGEMENT_REQUIRED" });
    const [terminal] = await db.select().from(statuses).where(eq(statuses.code, "CANCELLED"));
    await db.update(applications).set({ statusId: terminal!.id }).where(eq(applications.id, app.id));
    const notes = new FormData(); notes.set("applicationId",app.id); notes.set("internalNotes","Historical notes before closure");
    request.cookie = actor.testToken;
    try { await updateInternalNotesAction(notes); } catch (error) { if (!(error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error; }
    await closeAgency(actor, input(approved.agencyId, data.legalName));
    notes.set("internalNotes","This must not replace archived history");
    try { await updateInternalNotesAction(notes); } catch (error) { if (!(error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw error; }
    request.cookie = "";
    expect((await db.select().from(applications).where(eq(applications.id,app.id)))[0]!.internalNotes).toBe("Historical notes before closure");
    expect((await getApplicationForUser(app.id, actor)).app.id).toBe(app.id);
    await expect(getApplicationForUser(app.id, formerUser)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await db.select().from(applications).where(eq(applications.id, app.id)))[0]!.agencyId).toBe(approved.agencyId);
  });
  it("requires a current SUPER_ADMIN session, password and typed legal name", async () => {
    const { actor, data, approved } = await emptyAgency();
    await expect(closeAgency(await userByEmail("admin@test.example"), input(approved.agencyId, data.legalName))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(closeAgency({ ...actor, sessionId: undefined }, input(approved.agencyId, data.legalName))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(closeAgency(actor, { ...input(approved.agencyId, data.legalName), currentPassword: "wrong-password" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(closeAgency(actor, input(approved.agencyId, "wrong name"))).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await db.select().from(agencies).where(eq(agencies.id, approved.agencyId)))[0]!.status).toBe("ACTIVE");
  });

  it("blocks unsettled balance and pending top-ups without changing finance history", async () => {
    const { actor, data, approved } = await emptyAgency();
    await db.update(agencies).set({ balance: "1.00" }).where(eq(agencies.id, approved.agencyId));
    expect((await agencyClosurePreview(actor, approved.agencyId)).obligations).toContain("BALANCE_NOT_ZERO");
    await expect(closeAgency(actor, input(approved.agencyId, data.legalName))).rejects.toMatchObject({ code: "CLOSURE_BLOCKED" });
    await db.update(agencies).set({ balance: "0.00" }).where(eq(agencies.id, approved.agencyId));
    await db.insert(walletTopupRequests).values({ agencyId: approved.agencyId, amount: "100", currency: "DZD" });
    expect((await agencyClosurePreview(actor, approved.agencyId)).obligations).toContain("PENDING_TOPUPS");
    await expect(closeAgency(actor, input(approved.agencyId, data.legalName))).rejects.toMatchObject({ code: "OBLIGATIONS_ACKNOWLEDGEMENT_REQUIRED" });
  });

  it("revokes access and invitations, hides the agency, preserves its anchor and allows an independent new registration", async () => {
    const { actor, data, approved } = await emptyAgency();
    const activation = await issueAccessToken(actor, approved.adminUserId, "ACTIVATION");
    await resetAccountFromToken(activation.token, "OldAgency-Password-123");
    expect((await authenticate(data.email, "OldAgency-Password-123")).id).toBe(approved.adminUserId);
    await createSession(approved.adminUserId);
    const oldLink = await issueAccessToken(actor, approved.adminUserId);
    const oldMembers = await db.select().from(users).where(eq(users.agencyId, approved.agencyId));
    await closeAgency(actor, input(approved.agencyId, data.legalName));
    expect((await db.select().from(agencies).where(eq(agencies.id, approved.agencyId)))[0]!.status).toBe("CLOSED");
    expect(await db.select().from(sessions).where(eq(sessions.userId, approved.adminUserId))).toHaveLength(0);
    expect(await resolveAccessToken(oldLink.token)).toBeNull();
    await expect(authenticate(data.email, "OldAgency-Password-123")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(toggleAgencyAccess(actor, approved.agencyId)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect((await listAgencies()).some(row => row.agency.id === approved.agencyId)).toBe(false);
    expect((await db.select().from(users).where(eq(users.agencyId, approved.agencyId))).map(row => row.id)).toEqual(oldMembers.map(row => row.id));
    const next = await submitAgencyRegistration({ data, files: [], ipAddress: nextIp() });
    const reprovisioned = await approveRegistration({ actor, registrationId: next.id });
    expect(reprovisioned.agencyId).not.toBe(approved.agencyId);
    expect(reprovisioned.adminUserId).not.toBe(approved.adminUserId);
    const audit = await db.select().from(auditLogs).where(eq(auditLogs.action, "AGENCY_CLOSED"));
    expect(audit.find(row => row.entityId === approved.agencyId)?.metadata).toMatchObject({ retentionReference: "OWNER-APPROVED-ARCHIVE-POLICY-TEST", retainUntil: "2030-12-31" });
  });

  it("rolls back revocation and agency status if its immutable audit cannot be written", async () => {
    const { actor, data, approved } = await emptyAgency();
    await pool.query(`create function test_fail_closure_audit() returns trigger language plpgsql as $$ begin if new.action='AGENCY_CLOSED' then raise exception 'synthetic audit failure'; end if; return new; end $$`);
    await pool.query(`create trigger test_closure_audit before insert on audit_logs for each row execute function test_fail_closure_audit()`);
    try {
      await expect(closeAgency(actor, input(approved.agencyId, data.legalName))).rejects.toThrow("synthetic audit failure");
      expect((await db.select().from(agencies).where(eq(agencies.id, approved.agencyId)))[0]!.status).toBe("ACTIVE");
      expect((await db.select().from(users).where(eq(users.id, approved.adminUserId)))[0]!.status).toBe("ACTIVE");
    } finally {
      await pool.query("drop trigger test_closure_audit on audit_logs");
      await pool.query("drop function test_fail_closure_audit()");
    }
  });

  it("rejects a new wallet operation against a closed historical agency", async () => {
    const { actor, data, approved } = await emptyAgency();
    await closeAgency(actor,input(approved.agencyId,data.legalName));
    const client = await pool.connect();
    try {
      await client.query("begin");
      await expect(applyWalletMutation(client,{agencyId:approved.agencyId,operation:"CREDIT",amountAbs:"10.00",reason:"Synthetic closed-wallet refusal",actorId:actor.id})).rejects.toMatchObject({code:"INVALID_STATE"});
    } finally { await client.query("rollback"); client.release(); }
  });
  it.each(["arithmetic", "continuity"])("blocks zero-balance %s anomalies without changing historical wallet rows", async (anomaly) => {
    const { actor, data, approved } = await emptyAgency();
    const client = await pool.connect();
    try {
      // Deliberately inconsistent synthetic legacy data; never a hosted ledger.
      await client.query(`insert into wallet_transactions(agency_id,type,amount,currency,balance_before,balance_after,reason,actor_id,created_at)
        values($1,'CREDIT',$2,'DZD',0,100,'Synthetic legacy fixture',$3,'2026-01-01T10:00:00Z'),
              ($1,'DEBIT',$2,'DZD',$4,$5,'Synthetic legacy fixture',$3,'2026-01-01T10:01:00Z')`,
      [approved.agencyId, anomaly === "arithmetic" ? "50" : "100", actor.id, anomaly === "arithmetic" ? "100" : "200", anomaly === "arithmetic" ? "0" : "100"]);
      const before = await client.query("select * from wallet_transactions where agency_id=$1 order by reference",[approved.agencyId]);
      expect((await agencyClosurePreview(actor,approved.agencyId)).blockers).toContain("WALLET_RECONCILIATION_REQUIRED");
      await expect(closeAgency(actor,input(approved.agencyId,data.legalName))).rejects.toMatchObject({code:"CLOSURE_BLOCKED"});
      expect((await client.query("select * from wallet_transactions where agency_id=$1 order by reference",[approved.agencyId])).rows).toEqual(before.rows);
    } finally { client.release(); }
  });

  it("closes a reconciled zero-balance wallet while retaining every ledger row", async () => {
    const { actor, data, approved } = await emptyAgency();
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const operation of ["CREDIT","DEBIT"] as const) await applyWalletMutation(client,{agencyId:approved.agencyId,operation,amountAbs:"50.00",reason:"Synthetic settled history",actorId:actor.id});
      await client.query("commit");
      const before = await client.query("select * from wallet_transactions where agency_id=$1 order by reference",[approved.agencyId]);
      expect((await agencyClosurePreview(actor,approved.agencyId)).blockers).toEqual([]);
      await closeAgency(actor,input(approved.agencyId,data.legalName));
      expect((await client.query("select * from wallet_transactions where agency_id=$1 order by reference",[approved.agencyId])).rows).toEqual(before.rows);
    } finally { await client.query("rollback"); client.release(); }
  });

  it("blocks a processed top-up whose credited amount exceeds its request", async () => {
    const { actor, data, approved } = await emptyAgency();
    const client = await pool.connect();
    try {
      await client.query("begin");
      const credit = await applyWalletMutation(client,{agencyId:approved.agencyId,operation:"CREDIT",amountAbs:"50.00",reason:"Synthetic credit",actorId:actor.id});
      await applyWalletMutation(client,{agencyId:approved.agencyId,operation:"DEBIT",amountAbs:"50.00",reason:"Synthetic settlement",actorId:actor.id});
      const proof = Buffer.from("%PDF-1.4 synthetic closure receipt"), proofKey = `synthetic/closure-receipt/${approved.agencyId}`;
      await client.query("insert into document_blobs(key,mime_type,size_bytes,data) values($1,'application/pdf',$2,$3)",[proofKey,proof.length,proof]);
      await client.query(`insert into wallet_topup_requests(agency_id,amount,currency,status,processed_by,processed_at,wallet_transaction_id,
        proof_storage_key,proof_filename,proof_mime_type,proof_size_bytes,proof_sha256)
        values($1,25,'DZD','PROCESSED',$2,now(),$3,$4,'receipt.pdf','application/pdf',$5,$6)`,
      [approved.agencyId,actor.id,credit.transactionId,proofKey,proof.length,createHash("sha256").update(proof).digest("hex")]);
      await client.query("commit");
      expect((await agencyClosurePreview(actor,approved.agencyId)).blockers).toContain("WALLET_RECONCILIATION_REQUIRED");
      await expect(closeAgency(actor,input(approved.agencyId,data.legalName))).rejects.toMatchObject({code:"CLOSURE_BLOCKED"});
    } finally { await client.query("rollback"); client.release(); }
  });

});
