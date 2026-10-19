import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { candidateSuiteSetup } from "./helpers/candidate-migrations";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";
import { pool } from "@/lib/db";
import { createDraftApplication } from "@/lib/applications";
import { createDocumentRetentionService } from "@/lib/document-retention";
import { createLegacyReconciliationService } from "@/lib/legacy-reconciliation";
import { runIntegrityChecks } from "@/lib/integrity";
import { qualifiedPurgedDecisionSql } from "@/lib/document-retention-receipts";
import { uploadDocument } from "@/lib/documents";
import { storageProvider } from "@/lib/storage";

candidateSuiteSetup();
const service = createDocumentRetentionService(pool, { schema: "public", databaseUrl: "postgresql://postgres:postgres@localhost:5434/essafaria_test", enabled: true });
const decisionAt = new Date("2026-01-31T18:45:00Z");
beforeEach(async () => {
  await pool.query("update document_retention_policy set execution_enabled=false, approved_at=null, legal_review_reference=null, coverage_fingerprint=null, coverage_approved_at=null, all_live_copies_covered=false, restore_reconciliation_approved=false");
});

async function dossier() {
  const actor = await userByEmail("superadmin@test.example");
  const agency = await agencyByEmail("ops@agencyb.example");
  const visaTypeId = (await pool.query("select id from visa_types where code='JP-BUS'")).rows[0].id;
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId, createdBy: actor });
  const docId = randomUUID(), auditId = randomUUID(), key = `visa-documents/${app.id}/${docId}`;
  const bytes = Buffer.from(`%PDF-1.7 synthetic decision ${app.id}`);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("insert into document_blobs(key,data,mime_type,size_bytes) values($1,$2,'application/pdf',$3)", [key, bytes, bytes.length]);
    await client.query(`insert into documents(id,application_id,document_type_id,original_filename,mime_type,size_bytes,storage_key,status,uploaded_by,reviewed_by,reviewed_at,created_at)
      select $1,$2,id,'synthetic-private-passport.pdf','application/pdf',$3,$4,'ACCEPTED',$5,$5,$6,$6 from document_types where code='DECISION_VISA_APPROVAL'`, [docId, app.id, bytes.length, key, actor.id, decisionAt]);
    await client.query("update applications set status_id=(select id from statuses where code='APPROVED'),decision_at=$2,created_at=$2,updated_at=$2 where id=$1", [app.id, decisionAt]);
    await client.query(`insert into application_status_history(application_id,from_status_id,to_status_id,changed_by,created_at)
      select $1,f.id,t.id,$2,$3 from statuses f,statuses t where f.code='IN_PROCESS' and t.code='APPROVED'`, [app.id, actor.id, decisionAt]);
    await client.query("insert into audit_logs(id,actor_id,action,entity,entity_id,metadata,created_at) values($1,$2,'APPLICATION_DECISION_RECORDED','application',$3,$4,$5)", [auditId, actor.id, app.id, JSON.stringify({ outcome: "APPROVED", documentId: docId, from: "IN_PROCESS" }), decisionAt]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  return { actor, app, docId, auditId, key, bytes };
}

async function qualify(f: Awaited<ReturnType<typeof dossier>>) {
  await service.recordCaseControl(f.actor, { applicationId: f.app.id, reviewedDecisionAt: decisionAt, exceptionsReviewed: true, legalHold: false, evidenceReference: randomUUID() });
  const before = await service.dryRun(f.actor, f.app.id);
  await pool.query(`update document_retention_policy set execution_enabled=true,approved_at=now(),legal_review_reference=$1,
    coverage_fingerprint=$2,coverage_approved_at=now(),all_live_copies_covered=true,restore_reconciliation_approved=true,
    target_database=current_database(),target_schema='public',storage_provider='db'`, [randomUUID(), before.coverageFingerprint]);
  return service.dryRun(f.actor, f.app.id);
}
async function purge(f: Awaited<ReturnType<typeof dossier>>, manifestHash: string) {
  return service.purge(f.actor, { applicationId: f.app.id, manifestHash, confirmation: "DELETE_VISA_DOCUMENTS_AFTER_120_DAYS" });
}

describe("transactional, disabled-by-default document retention", () => {
  it('blocks purge while unattributed request staging can contain another encoded document copy',async()=>{
    const f=await dossier();await qualify(f);
    const key=`pending-request/${randomUUID()}/${randomUUID()}/${randomUUID()}/fixture/0`,data=Buffer.from(JSON.stringify({data:Buffer.from('%PDF-fictional extra copy').toString('base64')}));
    await pool.query('insert into document_blobs(key,data,mime_type,size_bytes) values($1,$2,$3,$4)',[key,data,'application/json',data.length]);
    try{expect((await service.dryRun(f.actor,f.app.id)).reasons).toContain('STORAGE_COVERAGE_INCOMPLETE');}
    finally{await pool.query('delete from document_blobs where key=$1',[key]);}
  });
  it("reports without writes and requires policy approval and a current legal exception review", async () => {
    const f = await dossier();
    const count = (await pool.query("select count(*)::int n from audit_logs")).rows[0].n;
    const plan = await service.dryRun(f.actor, f.app.id);
    expect(plan.eligible).toBe(false);
    expect(plan.reasons).toEqual(expect.arrayContaining(["POLICY_NOT_APPROVED", "LEGAL_REVIEW_REQUIRED", "LEGAL_HOLD"]));
    expect((await pool.query("select count(*)::int n from audit_logs")).rows[0].n).toBe(count);
    await expect(purge(f, plan.manifestHash)).rejects.toMatchObject({ code: "RETENTION_BLOCKED" });
    expect((await pool.query("select 1 from document_blobs where key=$1", [f.key])).rowCount).toBe(1);
  });

  it("atomically erases every version and derived or orphaned blob, retaining a minimal receipt and financial/audit history", async () => {
    const f = await dossier();
    const second = randomUUID();
    await pool.query("insert into documents(id,application_id,document_type_id,original_filename,mime_type,size_bytes,storage_key,version) select $1,application_id,(select id from document_types where code='PASSPORT'),'private-copy.pdf',mime_type,size_bytes,$2,2 from documents where id=$3", [second, `visa-documents/${f.app.id}/${second}`, f.docId]);
    await pool.query("insert into document_blobs(key,data,mime_type,size_bytes) values($1,$2,'application/pdf',$3),($4,$2,'application/pdf',$3)", [`visa-documents/${f.app.id}/${second}`, f.bytes, f.bytes.length, `visa-documents/${f.app.id}/thumbnail/orphan`]);
    const wallet = (await pool.query("select count(*)::int n from wallet_transactions")).rows[0].n;
    const plan = await qualify(f);
    expect(plan).toMatchObject({ eligible: true, documentCount: 2, blobCount: 3 });
    const result = await purge(f, plan.manifestHash);
    expect(result.status).toBe("PURGED");
    expect((await pool.query("select 1 from documents where application_id=$1", [f.app.id])).rowCount).toBe(0);
    expect((await pool.query("select 1 from document_blobs where starts_with(key,$1)", [`visa-documents/${f.app.id}/`])).rowCount).toBe(0);
    expect((await pool.query("select 1 from applications where id=$1", [f.app.id])).rowCount).toBe(1);
    expect((await pool.query("select 1 from audit_logs where id=$1", [f.auditId])).rowCount).toBe(1);
    expect((await pool.query("select count(*)::int n from wallet_transactions")).rows[0].n).toBe(wallet);
    const audit = (await pool.query("select metadata,actor_email,ip_address from audit_logs where action='DOCUMENT_RETENTION_PURGED' and entity_id=$1", [result.receiptId])).rows[0];
    expect(JSON.stringify(audit)).not.toMatch(/passport|filename|storageKey|private-copy|synthetic-private|@/i);
    await expect(pool.query("delete from document_retention_receipts where id=$1", [result.receiptId])).rejects.toThrow(/immutable/i);
    expect(await purge(f, plan.manifestHash)).toMatchObject({ status: "ALREADY_PURGED", receiptId: result.receiptId });
  });

  it("blocks a hold applied after dry-run and refuses a stale inventory manifest", async () => {
    const f = await dossier(), plan = await qualify(f);
    await service.recordCaseControl(f.actor, { applicationId: f.app.id, reviewedDecisionAt: decisionAt, exceptionsReviewed: true, legalHold: true, evidenceReference: randomUUID() });
    await expect(purge(f, plan.manifestHash)).rejects.toMatchObject({ code: "RETENTION_BLOCKED" });
    await qualify(f);
    await pool.query("insert into document_blobs(key,data,mime_type,size_bytes) values($1,$2,'application/pdf',$3)", [`visa-documents/${f.app.id}/late-copy`, f.bytes, f.bytes.length]);
    await expect(purge(f, plan.manifestHash)).rejects.toMatchObject({ code: "RETENTION_MANIFEST_CHANGED" });
    expect((await pool.query("select 1 from documents where id=$1", [f.docId])).rowCount).toBe(1);
  });

  it("never purges a reopened application or an unproven final decision", async () => {
    const f = await dossier(); await qualify(f);
    await pool.query("update applications set status_id=(select id from statuses where code='IN_PROCESS') where id=$1", [f.app.id]);
    expect((await service.dryRun(f.actor, f.app.id)).eligible).toBe(false);
    const other = await dossier(); await qualify(other);
    await pool.query("delete from document_blobs where key=$1", [other.key]);
    expect((await service.dryRun(other.actor, other.app.id)).reasons).toContain("FINAL_DECISION_UNPROVEN");
  });

  it("protects shared logos, top-up receipts and immutable reconciliation evidence", async () => {
    const f = await dossier(); await qualify(f);
    await pool.query("update agencies set logo_key=$2 where id=$1", [f.app.agencyId, f.key]);
    expect((await service.dryRun(f.actor, f.app.id)).reasons).toContain("STORAGE_COVERAGE_INCOMPLETE");
    await pool.query("update agencies set logo_key=null where id=$1", [f.app.agencyId]);
    await pool.query("insert into legacy_reconciliation_issues(fingerprint,kind,application_id,document_id) values($1,'MISSING_STORAGE_OBJECT',$2,$3)", [randomUUID(), f.app.id, f.docId]);
    expect((await service.dryRun(f.actor, f.app.id)).reasons).toContain("RECONCILIATION_EVIDENCE_PROTECTED");
  });

  it("fails closed on unmodelled legacy passport copies and unsupported storage providers", async () => {
    const f = await dossier(); await qualify(f);
    await pool.query("alter table applicants add column passport_copies jsonb");
    try { expect((await service.dryRun(f.actor, f.app.id)).reasons).toContain("STORAGE_COVERAGE_INCOMPLETE"); }
    finally { await pool.query("alter table applicants drop column passport_copies"); }
    const previous = process.env.STORAGE_PROVIDER;
    process.env.STORAGE_PROVIDER = "supabase";
    try { expect((await service.dryRun(f.actor, f.app.id)).reasons).toContain("STORAGE_COVERAGE_INCOMPLETE"); }
    finally { process.env.STORAGE_PROVIDER = previous; }
  });

  it("rolls back both bytes and document rows if the immutable audit cannot be written", async () => {
    const f = await dossier(), plan = await qualify(f);
    await pool.query("create function retention_test_audit_failure() returns trigger language plpgsql as $$ begin if new.action='DOCUMENT_RETENTION_PURGED' then raise exception 'synthetic audit unavailable'; end if; return new; end $$");
    await pool.query("create trigger retention_test_audit_failure before insert on audit_logs for each row execute function retention_test_audit_failure()");
    try { await expect(purge(f, plan.manifestHash)).rejects.toThrow("synthetic audit unavailable"); }
    finally { await pool.query("drop trigger retention_test_audit_failure on audit_logs"); await pool.query("drop function retention_test_audit_failure()"); }
    expect((await pool.query("select 1 from documents where id=$1", [f.docId])).rowCount).toBe(1);
    expect((await pool.query("select 1 from document_blobs where key=$1", [f.key])).rowCount).toBe(1);
    expect((await pool.query("select 1 from document_retention_receipts where application_id=$1", [f.app.id])).rowCount).toBe(0);
  });

  it("serializes duplicate purges and leaves one receipt", async () => {
    const f = await dossier(), plan = await qualify(f);
    const results = await Promise.all([purge(f, plan.manifestHash), purge(f, plan.manifestHash)]);
    expect(results.map(result => result.status).sort()).toEqual(["ALREADY_PURGED", "PURGED"]);
    expect((await pool.query("select 1 from document_retention_receipts where application_id=$1", [f.app.id])).rowCount).toBe(1);
  });

  it("never commits a reference to staged upload bytes removed by an overlapping purge", async () => {
    const f = await dossier();
    const documentTypeId = (await pool.query("select id from document_types where code='PASSPORT'")).rows[0].id;
    const provider = storageProvider(), originalPut = provider.put.bind(provider);
    let staged!: () => void, resume!: () => void;
    const stagedSignal = new Promise<void>(resolve => { staged = resolve; });
    const resumeSignal = new Promise<void>(resolve => { resume = resolve; });
    const spy = vi.spyOn(provider, "put").mockImplementationOnce(async (key, data, mimeType) => {
      await originalPut(key, data, mimeType); staged(); await resumeSignal;
    });
    const data = Buffer.from(`%PDF-1.7 synthetic in-flight upload ${f.app.id}`);
    const pending = uploadDocument({ applicationId: f.app.id, documentTypeId, actor: f.actor,
      file: { name: "in-flight.pdf", type: "application/pdf", data, size: data.length } }).then(result => ({ result, error: null }), error => ({ result: null, error }));
    try {
      await stagedSignal;
      const plan = await qualify(f);
      expect(plan).toMatchObject({ eligible: true, blobCount: 2 });
      await purge(f, plan.manifestHash);
      resume();
      const outcome = await pending;
      expect(outcome.result).toBeNull();
      expect(outcome.error).toMatchObject({ code: "STORAGE_CHANGED" });
      expect((await pool.query("select 1 from documents where application_id=$1", [f.app.id])).rowCount).toBe(0);
    } finally { resume(); spy.mockRestore(); await pending; }
  });

  it("explains only a legitimate purge to reconciliation; never treats receipts as original decision documents", async () => {
    const f = await dossier(), plan = await qualify(f); await purge(f, plan.manifestHash);
    const predicate = await qualifiedPurgedDecisionSql(pool, "public");
    expect((await pool.query(`select ${predicate} qualified from applications a join statuses s on s.id=a.status_id where a.id=$1`, [f.app.id])).rows[0].qualified).toBe(true);
    await createLegacyReconciliationService(pool).scan(f.actor);
    expect((await pool.query("select 1 from legacy_reconciliation_issues where application_id=$1", [f.app.id])).rowCount).toBe(0);
    const report = await runIntegrityChecks();
    expect(report.status).not.toBe("unavailable");
    const missing = await dossier(); await pool.query("delete from document_blobs where key=$1", [missing.key]);
    expect((await pool.query(`select ${predicate} qualified from applications a join statuses s on s.id=a.status_id where a.id=$1`, [missing.app.id])).rows[0].qualified).toBe(false);
    await createLegacyReconciliationService(pool).scan(f.actor);
    expect((await pool.query("select 1 from legacy_reconciliation_issues where application_id=$1", [missing.app.id])).rowCount).toBeGreaterThan(0);
  });

  it("preserves the old database behavior when migration0034 is absent", async () => {
    expect(await qualifiedPurgedDecisionSql(pool, "retention_unmigrated_fixture")).toBe("false");
  });

  it("refuses unauthorized and stale actors, and never allows a hosted execution target", async () => {
    const f = await dossier(), plan = await qualify(f);
    const agencyActor = await userByEmail("b-admin@test.example");
    await expect(service.dryRun(agencyActor, f.app.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const hosted = createDocumentRetentionService(pool, { schema: "public", databaseUrl: "postgresql://postgres:p@remote.invalid/production", enabled: true });
    await expect(hosted.purge(f.actor, { applicationId: f.app.id, manifestHash: plan.manifestHash, confirmation: "DELETE_VISA_DOCUMENTS_AFTER_120_DAYS" })).rejects.toThrow("RETENTION_TARGET_NOT_QUALIFIED");
  });
});
