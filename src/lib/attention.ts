import { sql } from "drizzle-orm";
import { statuses } from "@/db/schema";
import { qualifiedTable } from "@/lib/database-schema";

/** One definition shared by the dashboard, count and filtered queue. */
export function agencyAttentionCondition() {
  return sql`exists (select 1 from ${sql.raw(qualifiedTable("document_requests"))} attention_request
    where attention_request.application_id = applications.id and attention_request.status = 'OPEN')`;
}

/** Agency actionable queue excludes closed cases, even if an old request remains open. */
export function activeAgencyAttentionCondition() {
  return sql`(not ${statuses.isTerminal} and ${statuses.code} not in ('APPROVED','COMPLETED','CANCELLED','REJECTED','REFUSED') and ${agencyAttentionCondition()})`;
}
