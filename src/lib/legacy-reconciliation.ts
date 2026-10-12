import type { Pool, PoolClient } from "pg";
import { databaseSchema, qualifiedTable } from "@/lib/database-schema";
import { AppError, type AuthUser } from "@/lib/types";
import { officialDocumentIntegritySql, storedDocumentIntegritySql } from "./decision-integrity";

export interface ReconciliationIssue {
  id: string; kind: "MISSING_OFFICIAL_DECISION" | "MISSING_STORAGE_OBJECT"; applicationId: string;
  documentId: string | null; storageKey: string | null; reference: string; status: "OPEN" | "RESTORED";
  lastOutcome: "DETECTED" | "OWNER_DISPOSITION" | "RESTORED"; note: string; detectedAt: Date;
}
/** Explicit schema enables disposable historical fixtures without weakening live invariants. */
export function createLegacyReconciliationService(pool: Pool, schema = databaseSchema()) {
  databaseSchema({ DATABASE_SCHEMA: schema });
  const table = (name: string) => qualifiedTable(name, schema);
  async function authorized(client: PoolClient, actor: AuthUser) {
    if (process.env.STORAGE_PROVIDER && process.env.STORAGE_PROVIDER !== "db") throw new AppError("RECONCILIATION_STORAGE_UNVERIFIED", "Storage reconciliation requires a verified provider inventory.");
    if (actor.agencyId || !["SUPER_ADMIN", "ADMIN"].includes(actor.role) || actor.mustChangePassword) throw new AppError("FORBIDDEN", "Not authorized.");
    const row = (await client.query(`select role,status,agency_id,must_change_password,activation_pending,credential_version from ${table("users")} where id=$1 for update`, [actor.id])).rows[0];
    if (!row || row.agency_id || row.status !== "ACTIVE" || row.must_change_password || row.activation_pending || row.role!==actor.role ||
      (actor.credentialVersion!==undefined && row.credential_version!==actor.credentialVersion) || !["SUPER_ADMIN", "ADMIN"].includes(row.role)) throw new AppError("FORBIDDEN", "Not authorized.");
  }
  const official = (application: string) => `exists(select 1 from ${table("documents")} d join ${table("document_types")} t on t.id=d.document_type_id
    join ${table("document_blobs")} b on b.key=d.storage_key
    where d.application_id=${application} and t.code=case when s.code='APPROVED' then 'DECISION_VISA_APPROVAL' else 'DECISION_REFUSAL_LETTER' end
    and ${officialDocumentIntegritySql("d", "b")})`;
  async function audit(client: PoolClient, actor: AuthUser, action: string, issue: { id: string; applicationId: string; kind: string }, note?: string) {
    await client.query(`insert into ${table("audit_logs")}(actor_id,actor_email,actor_role,action,entity,entity_id,metadata)
      select id,email,role,$2,'legacy_reconciliation',$3,$4::jsonb || jsonb_build_object('actorName',name,'actorUsername',username) from ${table("users")} where id=$1`, [actor.id, action, issue.id,
      JSON.stringify({ applicationId: issue.applicationId, kind: issue.kind, note })]);
  }
  async function transaction<T>(actor: AuthUser, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try { await client.query("begin"); await client.query("select pg_advisory_xact_lock(1163087699)"); await client.query("select pg_advisory_xact_lock(hashtext($1))", [schema + ":legacy-reconciliation"]); await authorized(client, actor);
      const result = await operation(client); await client.query("commit"); return result;
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  async function listRows(client: PoolClient): Promise<ReconciliationIssue[]> {
    return (await client.query<ReconciliationIssue>(`select i.id,i.kind,i.application_id as "applicationId",i.document_id as "documentId",i.storage_key as "storageKey",
      a.reference,i.detected_at as "detectedAt",e.outcome as "lastOutcome",e.note,
      case when state.outcome='RESTORED' then 'RESTORED' else 'OPEN' end as status
      from ${table("legacy_reconciliation_issues")} i join ${table("applications")} a on a.id=i.application_id
      join lateral(select outcome,note from ${table("legacy_reconciliation_events")} e where e.issue_id=i.id order by event_sequence desc limit 1) e on true
      join lateral(select outcome from ${table("legacy_reconciliation_events")} e where e.issue_id=i.id and outcome<>'OWNER_DISPOSITION' order by event_sequence desc limit 1) state on true
      order by i.detected_at,i.id`)).rows;
  }
  return {
    list: (actor: AuthUser) => transaction(actor, listRows),
    scan: (actor: AuthUser) => transaction(actor, async client => {
      const missing = (await client.query<{ fingerprint: string; kind: string; applicationId: string; documentId: string | null; storageKey: string | null }>(`
        select 'decision:'||a.id as fingerprint,'MISSING_OFFICIAL_DECISION' as kind,a.id as "applicationId",null::uuid as "documentId",null::text as "storageKey"
        from ${table("applications")} a join ${table("statuses")} s on s.id=a.status_id where s.code in ('APPROVED','REJECTED') and (a.decision_at is null or not ${official("a.id")})
        union all select 'storage:'||d.id,'MISSING_STORAGE_OBJECT',d.application_id,d.id,d.storage_key
        from ${table("documents")} d left join ${table("document_blobs")} b on b.key=d.storage_key
        where b.key is null or not (${storedDocumentIntegritySql("d", "b")})`)).rows;
      let detected = 0;
      for (const finding of missing) {
        let row = (await client.query<{ id: string }>(`insert into ${table("legacy_reconciliation_issues")}(fingerprint,kind,application_id,document_id,storage_key)
          values($1,$2,$3,$4,$5) on conflict(fingerprint) do nothing returning id`, [finding.fingerprint, finding.kind, finding.applicationId, finding.documentId, finding.storageKey])).rows[0];
        if (!row) {
          row = (await client.query<{ id: string }>(`select id from ${table("legacy_reconciliation_issues")} where fingerprint=$1`, [finding.fingerprint])).rows[0]!;
          const state = (await client.query(`select outcome from ${table("legacy_reconciliation_events")} where issue_id=$1 and outcome<>'OWNER_DISPOSITION' order by event_sequence desc limit 1`, [row.id])).rows[0];
          if (state?.outcome !== "RESTORED") continue;
        }
        await client.query(`insert into ${table("legacy_reconciliation_events")}(issue_id,outcome,actor_id,note) values($1,'DETECTED',$2,'A genuine original document or its storage object requires reconciliation.')`, [row.id, actor.id]);
        await audit(client, actor, "LEGACY_RECONCILIATION_DETECTED", { ...finding, id: row.id }); detected++;
      }
      return { detected };
    }),
    disposition: (actor: AuthUser, input: { issueId: string; outcome: "OWNER_DISPOSITION" | "RESTORED"; note: string }) => transaction(actor, async client => {
      if (!/^[0-9a-f-]{36}$/i.test(input.issueId) || !["OWNER_DISPOSITION", "RESTORED"].includes(input.outcome) || input.note.trim().length < 10 || input.note.length > 2000) throw new AppError("VALIDATION", "Enter a meaningful reconciliation note.");
      const issue = (await listRows(client)).find(row => row.id === input.issueId);
      if (!issue) throw new AppError("NOT_FOUND", "Not found.");
      if (input.outcome === "RESTORED") {
        const healthy = issue.kind === "MISSING_STORAGE_OBJECT"
          ? (await client.query(`select exists(select 1 from ${table("documents")} d join ${table("document_blobs")} b on b.key=d.storage_key where d.id=$1 and (${storedDocumentIntegritySql("d", "b")})) healthy`, [issue.documentId])).rows[0]?.healthy
          : (await client.query(`select a.decision_at is not null and ${official("a.id")} as healthy from ${table("applications")} a join ${table("statuses")} s on s.id=a.status_id where a.id=$1 and s.code in ('APPROVED','REJECTED')`, [issue.applicationId])).rows[0]?.healthy;
        if (!healthy) throw new AppError("RECONCILIATION_UNRESOLVED", "The genuine original document or storage object is still missing.");
      }
      await client.query(`insert into ${table("legacy_reconciliation_events")}(issue_id,outcome,actor_id,note) values($1,$2,$3,$4)`, [issue.id, input.outcome, actor.id, input.note.trim()]);
      await audit(client, actor, "LEGACY_RECONCILIATION_" + input.outcome, issue, input.note.trim());
    }),
  };
}
