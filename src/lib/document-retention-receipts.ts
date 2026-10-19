import type { Pool, PoolClient } from "pg";
import { qualifiedTable } from "./database-schema";

/** Explains deliberate absence only. Never use this predicate to authorize a new final decision,
 * mark a document present, satisfy a checklist, or accept a missing original as restored. */
export async function qualifiedPurgedDecisionSql(client: Pool | PoolClient, schema: string): Promise<string> {
  const relation = qualifiedTable("document_retention_receipts", schema);
  if (!(await client.query("select to_regclass($1) relation", [relation])).rows[0]?.relation) return "false";
  return `exists(select 1 from ${relation} receipt
    join ${qualifiedTable("audit_logs", schema)} decision_audit on decision_audit.id=receipt.decision_audit_id
    join ${qualifiedTable("audit_logs", schema)} purge_audit on purge_audit.entity='document_retention_receipt' and purge_audit.entity_id=receipt.id::text
      and purge_audit.action='DOCUMENT_RETENTION_PURGED' and purge_audit.actor_id=receipt.actor_id
      and purge_audit.metadata->>'manifestSha256'=receipt.manifest_sha256
    where receipt.application_id=a.id and receipt.decision_at=a.decision_at and receipt.outcome=s.code
      and receipt.policy_version='visa-documents-120-v1' and receipt.purged_at>=receipt.due_at
      and decision_audit.entity='application' and decision_audit.entity_id=a.id::text and decision_audit.action='APPLICATION_DECISION_RECORDED'
      and decision_audit.metadata->>'outcome'=receipt.outcome and decision_audit.metadata->>'documentId'=receipt.decision_document_id::text
      and not exists(select 1 from ${qualifiedTable("documents", schema)} remaining where remaining.application_id=a.id)
      and not exists(select 1 from ${qualifiedTable("document_blobs", schema)} restored where starts_with(restored.key,'visa-documents/'||a.id::text||'/')))`;
}
