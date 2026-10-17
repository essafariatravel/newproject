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
