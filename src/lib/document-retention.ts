import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { databaseSchema, qualifiedTable } from "./database-schema";
import { officialDocumentIntegritySql, storedDocumentIntegritySql } from "./decision-integrity";
import { evaluateDocumentRetention, requireRetentionExecutionTarget } from "./document-retention-policy";
import { AppError, type AuthUser } from "./types";

interface Options { schema?: string; databaseUrl?: string; enabled?: boolean; vercelEnvironment?: string }
interface CaseControl { applicationId: string; reviewedDecisionAt: Date | null; exceptionsReviewed: boolean; legalHold: boolean; evidenceReference: string }
export interface RetentionDryRun {
  applicationId: string; eligible: boolean; reasons: string[]; decisionAt: string | null; dueAt: string | null;
  documentCount: number; blobCount: number; byteCount: number; manifestHash: string; coverageFingerprint: string;
}
interface DocumentRow { id: string; storage_key: string; intact: boolean; version: number; sha256: string | null }
interface BlobRow { key: string; sha256: string; size: number }
interface CaseRow { id: string; agency_id: string; status_code: string; decision_at: Date | null; audit_id: string | null; decision_document_id: string | null; reopened: boolean; open_requests: boolean; reconciliation_issue: boolean }
interface ControlRow { id: string; reviewed_decision_at: Date | null; exceptions_reviewed: boolean; legal_hold: boolean }
interface PolicyRow { execution_enabled: boolean; approved_at: Date | null; legal_review_reference: string | null; coverage_approved_at: Date | null; coverage_fingerprint: string | null; all_live_copies_covered: boolean; restore_reconciliation_approved: boolean; target_database: string | null; target_schema: string | null; storage_provider: string | null; policy_version: string }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function validId(value: string) { if (!uuid.test(value)) throw new AppError("VALIDATION", "A valid opaque identifier is required."); }

/** Dormant server-side service. No route or scheduler activates it. No hosted purge path is qualified. */
export function createDocumentRetentionService(pool: Pool, options: Options = {}) {
  const schema = options.schema ?? databaseSchema();
  databaseSchema({ DATABASE_SCHEMA: schema });
  const q = (name: string) => qualifiedTable(name, schema);

  function executionGate() {
    requireRetentionExecutionTarget({ ...options, schema, databaseUrl: options.databaseUrl ?? process.env.DATABASE_URL ?? "", vercelEnvironment: options.vercelEnvironment || process.env.VERCEL_ENV });
  }
  async function authorize(client: PoolClient, actor: AuthUser) {
    if (actor.agencyId || actor.role !== "SUPER_ADMIN" || actor.mustChangePassword || actor.mfaPending) throw new AppError("FORBIDDEN", "Not authorized.");
    const user = (await client.query(`select role,status,agency_id,must_change_password,activation_pending,credential_version from ${q("users")} where id=$1`, [actor.id])).rows[0];
    if (!user || user.role !== "SUPER_ADMIN" || user.status !== "ACTIVE" || user.agency_id || user.must_change_password || user.activation_pending ||
        (actor.credentialVersion !== undefined && actor.credentialVersion !== user.credential_version)) throw new AppError("FORBIDDEN", "Not authorized.");
  }
  async function transaction<T>(actor: AuthUser, write: boolean, action: (client: PoolClient) => Promise<T>): Promise<T> {
    if (write) executionGate(); // Before pool acquisition, credentials or remote requests.
    const client = await pool.connect();
    try {
      await client.query(write ? "begin" : "begin isolation level repeatable read read only");
      await client.query("set local time zone 'UTC'");
      await client.query("set local lock_timeout='2s'");
      await client.query("set local statement_timeout='15s'");
      if (write) {
        // Match the identity-before-dossier lock order used by document writers.
        await client.query("select pg_advisory_xact_lock(1163087699)");
        const target = (await client.query("select current_database() name,host(inet_server_addr()) address,inet_server_port() port")).rows[0];
        if (target.name !== "essafaria_test" || !["127.0.0.1", "::1"].includes(target.address) || target.port !== 5434) throw new AppError("RETENTION_TARGET_NOT_QUALIFIED", "Retention target is not qualified.");
        // Writers need not cooperate with an advisory lock. These bounded table locks cover
        // concurrent decisions/reopening, holds, uploads, sharing, reviews and audit failures.
        const tables = ["users", "applications", "application_status_history", "statuses", "document_types", "documents", "document_blobs", "document_requests", "agency_registration_documents", "wallet_topup_requests", "agencies", "site_settings", "audit_logs", "legacy_reconciliation_issues", "document_retention_policy", "document_retention_case_events", "document_retention_receipts"];
        await client.query(`lock table ${tables.map(q).join(",")} in share row exclusive mode`);
      }
      await authorize(client, actor);
      const result = await action(client);
      await client.query("commit");
      return result;
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }

  async function prepare(client: PoolClient, applicationId: string) {
    validId(applicationId);
    const now = (await client.query<{ at: Date; name: string }>("select clock_timestamp() at,current_database() name")).rows[0]!;
    const available = (await client.query("select to_regclass($1) relation", [`${schema}.document_retention_policy`])).rows[0].relation;
    if (!available) throw new AppError("RETENTION_SCHEMA_UNAVAILABLE", "Retention controls have not been migrated; no deletion is permitted.");
    const columns = (await client.query<{ table_name: string; column_name: string; data_type: string; udt_name: string }>(`select table_name,column_name,data_type,udt_name from information_schema.columns where table_schema=$1 order by table_name,column_name`, [schema])).rows;
    const coverageFingerprint = hash(columns);
    // This receipt field is an integer count, never a pointer or file payload.
    // Keep the inventory closed to all other unmodelled storage/copy columns.
    const knownStorage = new Set(["documents.storage_key", "agency_registration_documents.storage_key", "wallet_topup_requests.proof_storage_key", "agencies.logo_key", "legacy_reconciliation_issues.storage_key", "document_blobs.data", "document_retention_policy.storage_provider"]);
    const receiptCount = (column: typeof columns[number]) => column.table_name === "document_retention_receipts" && column.column_name === "blob_count" && column.udt_name === "int4";
    const unknownStorage = columns.some(column => (/(storage|blob|passport_cop|attachment|image_(data|key)|file_(data|key)|logo_key)/i.test(column.column_name) || column.udt_name === "bytea") && !knownStorage.has(`${column.table_name}.${column.column_name}`) && !receiptCount(column));
    const policy = (await client.query<PolicyRow>(`select * from ${q("document_retention_policy")} where singleton`)).rows[0];
    const app = (await client.query<CaseRow>(`
      select a.id,a.agency_id,s.code status_code,a.decision_at,proof.audit_id,proof.document_id decision_document_id,
        exists(select 1 from ${q("application_status_history")} h join ${q("statuses")} hs on hs.id=h.to_status_id
          where h.application_id=a.id and h.created_at>proof.recorded_at and hs.code not in ('APPROVED','REJECTED')) reopened,
        exists(select 1 from ${q("document_requests")} r where r.application_id=a.id and r.status='OPEN') open_requests,
        exists(select 1 from ${q("legacy_reconciliation_issues")} i where i.application_id=a.id) reconciliation_issue
      from ${q("applications")} a join ${q("statuses")} s on s.id=a.status_id
      left join lateral(
        select au.id audit_id,d.id document_id,au.created_at recorded_at from ${q("audit_logs")} au
        join ${q("documents")} d on d.id::text=au.metadata->>'documentId' and d.application_id=a.id
        join ${q("document_types")} t on t.id=d.document_type_id
        join ${q("document_blobs")} b on b.key=d.storage_key
        where au.entity='application' and au.entity_id=a.id::text and au.action='APPLICATION_DECISION_RECORDED'
          and au.metadata->>'outcome'=s.code and au.actor_id=d.reviewed_by and d.reviewed_at=a.decision_at
          and t.code=case s.code when 'APPROVED' then 'DECISION_VISA_APPROVAL' when 'REJECTED' then 'DECISION_REFUSAL_LETTER' end
          and ${officialDocumentIntegritySql("d", "b")}
          and exists(select 1 from ${q("application_status_history")} h join ${q("statuses")} f on f.id=h.from_status_id
            where h.application_id=a.id and h.to_status_id=a.status_id and h.changed_by=au.actor_id and h.created_at=au.created_at
              and f.code in ('IN_PROCESS','EMBASSY_SENT') and au.metadata->>'from'=f.code)
        order by au.created_at desc,au.id limit 1
      ) proof on true where a.id=$1`, [applicationId])).rows[0];
    if (!app) throw new AppError("NOT_FOUND", "Application not found.");
    const control = (await client.query<ControlRow>(`select * from ${q("document_retention_case_events")} where application_id=$1 order by event_sequence desc limit 1`, [applicationId])).rows[0];
    const documents = (await client.query<DocumentRow>(`select d.id,d.storage_key,d.version,d.sha256,coalesce((${storedDocumentIntegritySql("d", "b")}),false) intact
      from ${q("documents")} d left join ${q("document_blobs")} b on b.key=d.storage_key where d.application_id=$1 order by d.id`, [applicationId])).rows;
    const prefix = `visa-documents/${applicationId}/`;
    const blobs = (await client.query<BlobRow>(`select key,encode(pg_catalog.sha256(data),'hex') sha256,octet_length(data)::int size
      from ${q("document_blobs")} where starts_with(key,$1) order by key`, [prefix])).rows;
    const keys = blobs.map(blob => blob.key);
    const shared = (await client.query<{ shared: boolean }>(`select
      exists(select 1 from ${q("documents")} where storage_key=any($1::text[]) and application_id<>$2)
      or exists(select 1 from ${q("agency_registration_documents")} where storage_key=any($1::text[]))
      or exists(select 1 from ${q("wallet_topup_requests")} where proof_storage_key=any($1::text[]))
      or exists(select 1 from ${q("agencies")} where logo_key=any($1::text[]))
      or exists(select 1 from ${q("site_settings")} s,unnest($1::text[]) k where strpos(s.value::text,k)>0)
      or exists(select 1 from ${q("legacy_reconciliation_issues")} where storage_key=any($1::text[])) shared`, [keys, applicationId])).rows[0]!.shared;
    const outsideCopy = keys.length > 0 && (await client.query<{ copied: boolean }>(`select exists(select 1 from ${q("document_blobs")} where not(key=any($1::text[])) and encode(pg_catalog.sha256(data),'hex')=any($2::text[])) copied`, [keys, blobs.map(blob => blob.sha256)])).rows[0]!.copied;
    // Wizard staging encodes file bytes inside JSON, so a bytea hash comparison
    // cannot attribute or exclude another copy. Do not certify full coverage
    // until this transient inventory is reconciled; never purge it by guessing.
    const stagedCopies=(await client.query<{present:boolean}>(`select exists(select 1 from ${q("document_blobs")} where starts_with(key,'pending-request/')) present`)).rows[0]!.present;
    const receipt = (await client.query<{ id: string }>(`select id from ${q("document_retention_receipts")} where application_id=$1 and decision_at=$2`, [applicationId, app.decision_at])).rows[0];
    const provider = process.env.STORAGE_PROVIDER ?? "db";
    const coverage = provider === "db" && !unknownStorage && !shared && !outsideCopy && !stagedCopies && documents.every(doc => doc.intact && doc.storage_key.startsWith(prefix)) &&
      Boolean(policy?.coverage_approved_at && policy.all_live_copies_covered && policy.coverage_fingerprint === coverageFingerprint && policy.storage_provider === "db");
    const evaluation = evaluateDocumentRetention({ statusCode: app.status_code, decisionAt: app.decision_at, genuineDecision: !!app.audit_id,
      reopened: app.reopened, openRequests: app.open_requests,
      legalReviewCurrent: !!control?.exceptions_reviewed && !!app.decision_at && control.reviewed_decision_at?.getTime() === app.decision_at.getTime(),
      legalHold: control?.legal_hold !== false, coverageComplete: coverage, reconciliationIssue: app.reconciliation_issue, alreadyPurged: !!receipt }, now.at);
    const policyApproved = Boolean(policy?.execution_enabled && policy.approved_at && policy.legal_review_reference && policy.restore_reconciliation_approved &&
      policy.target_database === now.name && policy.target_schema === schema && policy.policy_version === "visa-documents-120-v1");
    if (!policyApproved) evaluation.reasons.push("POLICY_NOT_APPROVED");
    if (!documents.length && !receipt) evaluation.reasons.push("NO_DOCUMENTS");
    const manifestHash = hash({ applicationId, decisionAt: app.decision_at, outcome: app.status_code, decisionAuditId: app.audit_id,
      control: control ?? null, coverageFingerprint, documents, blobs, policy: policy ?? null });
    const plan: RetentionDryRun = { applicationId, ...evaluation, eligible: evaluation.reasons.length === 0,
      decisionAt: app.decision_at?.toISOString() ?? null, documentCount: documents.length, blobCount: blobs.length,
      byteCount: blobs.reduce((sum, blob) => sum + blob.size, 0), manifestHash, coverageFingerprint };
    return { plan, app, documents, keys, policy, control, receipt };
  }

  return {
    dryRun: (actor: AuthUser, applicationId: string) => transaction(actor, false, async client => (await prepare(client, applicationId)).plan),
    recordCaseControl: (actor: AuthUser, input: CaseControl) => transaction(actor, true, async client => {
      validId(input.applicationId); validId(input.evidenceReference);
      const app = (await client.query<{ decision_at: Date | null }>(`select decision_at from ${q("applications")} where id=$1`, [input.applicationId])).rows[0];
      if (!app) throw new AppError("NOT_FOUND", "Application not found.");
      if (input.exceptionsReviewed && (!app.decision_at || input.reviewedDecisionAt?.getTime() !== app.decision_at.getTime())) throw new AppError("RETENTION_REVIEW_STALE", "The legal exception review must match the current final decision.");
      const id = randomUUID();
      await client.query(`insert into ${q("document_retention_case_events")}(id,application_id,reviewed_decision_at,exceptions_reviewed,legal_hold,evidence_reference,actor_id)
        values($1,$2,$3,$4,$5,$6,$7)`, [id, input.applicationId, input.reviewedDecisionAt, input.exceptionsReviewed, input.legalHold, input.evidenceReference, actor.id]);
      await client.query(`insert into ${q("audit_logs")}(actor_id,actor_role,action,entity,entity_id,metadata) values($1,'SUPER_ADMIN','DOCUMENT_RETENTION_CONTROL_RECORDED','document_retention_control',$2,$3)`,
        [actor.id, id, JSON.stringify({ evidenceReference: input.evidenceReference, legalHold: input.legalHold, exceptionsReviewed: input.exceptionsReviewed })]);
      return { id };
    }),
    purge: (actor: AuthUser, input: { applicationId: string; manifestHash: string; confirmation: string }) => transaction(actor, true, async client => {
      if (input.confirmation !== "DELETE_VISA_DOCUMENTS_AFTER_120_DAYS" || !/^[a-f0-9]{64}$/.test(input.manifestHash)) throw new AppError("RETENTION_CONFIRMATION_REQUIRED", "A reviewed dry-run manifest and explicit confirmation are required.");
      const result = await prepare(client, input.applicationId);
      const { plan, app, documents, keys, policy, control, receipt } = result;
      if (receipt) {
        if (documents.length || keys.length) throw new AppError("RETENTION_RESTORED_COPY_DETECTED", "Restored or new copies require a separate reconciliation; the existing receipt cannot authorize deletion.");
        return { status: "ALREADY_PURGED" as const, receiptId: receipt.id };
      }
      if (!plan.eligible) throw new AppError("RETENTION_BLOCKED", `Retention blocked: ${plan.reasons.join(", ")}.`);
      if (plan.manifestHash !== input.manifestHash) throw new AppError("RETENTION_MANIFEST_CHANGED", "The dossier, controls, policy or inventory changed after review; run a fresh dry-run.");
      const receiptId = randomUUID();
      await client.query(`insert into ${q("document_retention_receipts")}(id,application_id,decision_at,outcome,decision_audit_id,decision_document_id,document_ids,
        document_count,blob_count,byte_count,policy_version,legal_review_reference,case_event_id,manifest_sha256,coverage_fingerprint,due_at,actor_id)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [receiptId, app.id, app.decision_at, app.status_code, app.audit_id, app.decision_document_id, documents.map(doc => doc.id), documents.length, keys.length, plan.byteCount,
        policy!.policy_version, policy!.legal_review_reference, control!.id, plan.manifestHash, plan.coverageFingerprint, plan.dueAt, actor.id]);
      const removedDocuments = await client.query(`delete from ${q("documents")} where application_id=$1 and id=any($2::uuid[])`, [app.id, documents.map(doc => doc.id)]);
      const removedBlobs = await client.query(`delete from ${q("document_blobs")} where key=any($1::text[])`, [keys]);
      if (removedDocuments.rowCount !== plan.documentCount || removedBlobs.rowCount !== plan.blobCount) throw new AppError("RETENTION_INVENTORY_CHANGED", "Inventory removal did not match the approved manifest.");
      await client.query(`insert into ${q("audit_logs")}(actor_id,actor_role,agency_id,action,entity,entity_id,metadata)
        values($1,'SUPER_ADMIN',$2,'DOCUMENT_RETENTION_PURGED','document_retention_receipt',$3,$4)`, [actor.id, app.agency_id, receiptId,
        JSON.stringify({ policyVersion: policy!.policy_version, manifestSha256: plan.manifestHash, documentCount: plan.documentCount, blobCount: plan.blobCount, byteCount: plan.byteCount })]);
      return { status: "PURGED" as const, receiptId };
    }),
  };
}
