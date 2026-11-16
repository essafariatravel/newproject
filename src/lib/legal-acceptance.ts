import type { Pool } from "pg";
import { qualifiedTable } from "./database-schema";
import { currentOperationActorPg } from "./operation-identity";
import { buildLegalEvidence, type LegalAcceptanceMethod, type LegalAcceptanceType } from "./legal-evidence";
import { AppError, type AuthUser } from "./types";
import type { UiLocale } from "./ui-i18n";

export interface LegalAcceptanceInput {
  documentType: LegalAcceptanceType;
  legalVersionId: string;
  contentSha256: string;
  locale: UiLocale;
  explicit: boolean;
  method: LegalAcceptanceMethod;
}
const kinds = { terms_b2b: "terms", privacy_b2b: "privacy", commercial_b2b: "commercial", staff_confidentiality: "staff_confidentiality" } as const;

/** Only currently effective, already approved/published content can be accepted.
 * No review-pack import, role grant, account activation or workflow gate occurs here.
 * Traveller submission remains blocked until its contractual trigger is approved. */
export function createLegalAcceptanceService(pool: Pool) {
  return {
    async record(actor: AuthUser, input: LegalAcceptanceInput): Promise<{ id: string }> {
      if (input.documentType === "traveller_submission_declaration") throw new AppError("LEGAL_SUBMISSION_POLICY_NOT_APPROVED", "The effective submission policy has not been approved.");
      if (!Object.hasOwn(kinds, input.documentType) || !["fr", "en", "ar"].includes(input.locale)) throw new AppError("VALIDATION", "Invalid legal document.");
      if (input.explicit !== true) throw new AppError("LEGAL_EXPLICIT_REQUIRED", "Explicit acceptance or acknowledgement is required.");
      const client = await pool.connect();
      try {
        await client.query("begin");
        const currentActor = await currentOperationActorPg(client, actor);
        if ((input.documentType === "staff_confidentiality" && currentActor.agencyId) ||
            (input.documentType === "commercial_b2b" && currentActor.role !== "AGENCY_ADMIN") ||
            (["terms_b2b", "commercial_b2b"].includes(input.documentType) && !currentActor.agencyId)) {
          throw new AppError("FORBIDDEN", "This document does not apply to this account.");
        }
        const kind = kinds[input.documentType];
        // Same lock as publication; compute the acceptance instant after the wait.
        await client.query("select pg_advisory_xact_lock(hashtext($1))", [`legal:${kind}:${input.locale}`]);
        const acceptedAt = (await client.query<{ at: Date }>("select clock_timestamp() at")).rows[0]!.at;
        const version = (await client.query<{ id: string; version: number; body: string }>(`select id,version,body from ${qualifiedTable("legal_versions")}
          where kind=$1 and locale=$2 and effective_at<=$3 order by version desc limit 1`, [kind, input.locale, acceptedAt])).rows[0];
        if (!version || version.id !== input.legalVersionId) throw new AppError("LEGAL_CHANGED", "Review the current legal version before accepting.");
        const evidence = buildLegalEvidence({ documentType: input.documentType, version: { ...version, locale: input.locale }, userId: currentActor.id,
          agencyId: currentActor.agencyId, acceptedAt, method: input.method });
        if (evidence.contentSha256 !== input.contentSha256) throw new AppError("LEGAL_CHANGED", "Review the current legal version before accepting.");
        const existing = (await client.query<{ id: string }>(`select id from ${qualifiedTable("legal_acceptances")} where user_id=$1 and legal_version_id=$2 and document_type=$3`, [currentActor.id, version.id, input.documentType])).rows[0];
        if (existing) { await client.query("commit"); return existing; }
        const receipt = (await client.query<{ id: string }>(`insert into ${qualifiedTable("legal_acceptances")}
          (document_type,legal_version_id,version,content_sha256,locale,user_id,agency_id,accepted_at,method)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`, [evidence.documentType, evidence.legalVersionId, evidence.version, evidence.contentSha256, evidence.locale,
          evidence.userId, evidence.agencyId, evidence.acceptedAt, evidence.method])).rows[0]!;
        // Only opaque actor/tenant IDs; no email, IP, user agent, body or traveller fields.
        await client.query(`insert into ${qualifiedTable("audit_logs")}(actor_id,agency_id,action,entity,entity_id,metadata)
          values($1,$2,'LEGAL_ACCEPTANCE_RECORDED','legal_acceptance',$3,$4)`, [currentActor.id, currentActor.agencyId, receipt.id, JSON.stringify(evidence)]);
        await client.query("commit");
        return receipt;
      } catch (error) { await client.query("rollback"); throw error; }
      finally { client.release(); }
    },
  };
}
