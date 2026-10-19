import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {qualifiedTable} from './database-schema';

export interface RetentionCaseState {
  statusCode: string; decisionAt: Date | null; genuineDecision: boolean; reopened: boolean;
  openRequests: boolean; legalReviewCurrent: boolean; legalHold: boolean;
  coverageComplete: boolean; reconciliationIssue: boolean; alreadyPurged: boolean;
}
/** Calendar anniversaries use UTC, preserving the time of decision. Never round down to midnight. */
export function evaluateDocumentRetention(state: RetentionCaseState, now: Date): { eligible: boolean; dueAt: string | null; reasons: string[] } {
  const reasons: string[] = [];
  const valid = state.decisionAt && Number.isFinite(state.decisionAt.getTime()) && Number.isFinite(now.getTime()) && state.decisionAt <= now;
  const due = valid ? new Date(state.decisionAt!) : null;
  if (due) due.setUTCDate(due.getUTCDate() + 120);
  if (!["APPROVED", "REJECTED"].includes(state.statusCode)) reasons.push("CASE_ACTIVE_OR_NO_VISA_OUTCOME");
  if (!valid || !state.genuineDecision) reasons.push("FINAL_DECISION_UNPROVEN");
  if (state.reopened) reasons.push("CASE_REOPENED");
  if (state.openRequests) reasons.push("OPEN_DOCUMENT_REQUEST");
  if (!state.legalReviewCurrent) reasons.push("LEGAL_REVIEW_REQUIRED");
  if (state.legalHold) reasons.push("LEGAL_HOLD");
  if (!state.coverageComplete) reasons.push("STORAGE_COVERAGE_INCOMPLETE");
  if (state.reconciliationIssue) reasons.push("RECONCILIATION_EVIDENCE_PROTECTED");
  if (state.alreadyPurged) reasons.push("ALREADY_PURGED");
  if (due && now < due) reasons.push("RETENTION_PERIOD_NOT_REACHED");
  return { eligible: reasons.length === 0, dueAt: due?.toISOString() ?? null, reasons };
}
/** No hosted execution path is qualified yet. This gate cannot be enabled using environment variables. */
export function requireRetentionExecutionTarget(input: { databaseUrl: string; schema: string; enabled?: boolean; vercelEnvironment?: string }): void {
  if (input.enabled !== true) throw new Error("RETENTION_DISABLED");
  let valid = false;
  try {
    const url = new URL(input.databaseUrl);
    valid = ["postgres:", "postgresql:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.port === "5434" && url.pathname === "/essafaria_test" && !url.search && !url.hash &&
      input.schema === "public" && !input.vercelEnvironment;
  } catch { /* Do not echo a credential-bearing URI. */ }
  if (!valid) throw new Error("RETENTION_TARGET_NOT_QUALIFIED");
}

interface PendingRetentionIntent {
  application_id:string;decision_at:Date;
  payload:{app:{audit_id:string|null;status_code:string};policy:{policy_version:string;legal_review_reference:string|null};plan:{coverageFingerprint:string};objects:Array<{id:string;sha256:string}>};
}
/** One authorization for execution AND journal retries. Call inside the physical
 * operation's transaction; retain these locks until absence is verified. */
export async function currentRetentionIntentAllowed(client:Pick<PoolClient,'query'>,schema:string,job:PendingRetentionIntent):Promise<boolean>{
  const q=(name:string)=>qualifiedTable(name,schema),payload=job.payload;
  const tables=['applications','application_status_history','statuses','documents','document_blobs','document_requests','agency_registration_documents','wallet_topup_requests','agencies','site_settings','audit_logs','legacy_reconciliation_issues','document_retention_policy','document_retention_case_events'];
  await client.query(`lock table ${tables.map(q).join(',')} in share row exclusive mode`);
  const current=(await client.query(`select a.decision_at,s.code,exists(select 1 from ${q('document_requests')} where application_id=a.id and status='OPEN') open_requests,
    exists(select 1 from ${q('legacy_reconciliation_issues')} where application_id=a.id) reconciliation_issue,
    exists(select 1 from ${q('application_status_history')} h join ${q('statuses')} hs on hs.id=h.to_status_id join ${q('audit_logs')} au on au.id=$2 where h.application_id=a.id and h.created_at>au.created_at and hs.code not in ('APPROVED','REJECTED')) reopened
    from ${q('applications')} a join ${q('statuses')} s on s.id=a.status_id where a.id=$1`,[job.application_id,payload.app.audit_id])).rows[0];
  const control=(await client.query(`select * from ${q('document_retention_case_events')} where application_id=$1 order by event_sequence desc limit 1`,[job.application_id])).rows[0];
  const policy=(await client.query(`select * from ${q('document_retention_policy')} where singleton`)).rows[0];
  const columns=(await client.query(`select table_name,column_name,data_type,udt_name from information_schema.columns where table_schema=$1 order by table_name,column_name`,[schema])).rows;
  const copies=(await client.query(`select exists(select 1 from ${q('documents')} where application_id=$1) or exists(select 1 from ${q('document_blobs')} where starts_with(key,'pending-request/') or starts_with(key,$2) or encode(pg_catalog.sha256(data),'hex')=any($3::text[]))
    or exists(select 1 from ${q('storage_operations')} where state<>'DELETED' and not(id=any($4::uuid[])) and (starts_with(object_key,$2) or sha256=any($3::text[]))) present`,[job.application_id,`visa-documents/${job.application_id}/`,payload.objects.map(object=>object.sha256),payload.objects.map(object=>object.id)])).rows[0].present;
  const fingerprint=createHash('sha256').update(JSON.stringify(columns)).digest('hex');
  return !copies&&!!current&&current.decision_at?.toISOString()===job.decision_at.toISOString()&&current.code===payload.app.status_code&&!current.open_requests&&!current.reconciliation_issue&&!current.reopened&&
    control?.legal_hold===false&&control.exceptions_reviewed&&control.reviewed_decision_at?.toISOString()===job.decision_at.toISOString()&&
    !!policy?.execution_enabled&&!!policy.approved_at&&!!policy.coverage_approved_at&&policy.all_live_copies_covered&&policy.restore_reconciliation_approved&&policy.storage_provider==='supabase'&&
    policy.target_database==='essafaria_test'&&policy.target_schema===schema&&policy.policy_version===payload.policy.policy_version&&policy.legal_review_reference===payload.policy.legal_review_reference&&fingerprint===payload.plan.coverageFingerprint&&policy.coverage_fingerprint===payload.plan.coverageFingerprint;
}
