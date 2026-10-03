import { pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { logErrorOnce, logEvent } from "@/lib/observability";

export interface IntegrityCounts {
  negativeBalances: number;
  legacyNonDzdAgencyWallets: number;
  postCutoverNonDzdAgencyWallets: number;
  legacyNonDzdWalletRows: number;
  postCutoverNonDzdWalletRows: number;
  walletArithmeticAnomalies: number;
  walletLedgerContinuityAnomalies: number;
  walletBalanceMismatches: number;
  duplicateApplicationCharges: number;
  processedTopupAnomalies: number;
  legacyFinalDecisionMissingDocument: number;
  finalDecisionMissingDocument: number;
  missingDocumentBlobs: number | null;
}

export interface IntegrityReport {
  status: "healthy" | "degraded" | "violation" | "unavailable";
  checks: IntegrityCounts | null;
  checkedAt: string;
}

const FINAL_DECISION_DOCUMENT_CUTOVER = new Date("2026-10-03T00:00:00.000Z");

function int(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Read-only invariants check.
 *
 * Returns aggregate counts only: no agency, applicant, application, document or
 * wallet identifiers ever leave this function.
 */
export async function runIntegrityChecks(): Promise<IntegrityReport> {
  const checkedAt = new Date().toISOString();
  try {
    const result = await pool.query<{
      negative_balances: number | string;
      legacy_non_dzd_agency_wallets: number | string;
      post_cutover_non_dzd_agency_wallets: number | string;
      legacy_non_dzd_wallet_rows: number | string;
      post_cutover_non_dzd_wallet_rows: number | string;
      wallet_arithmetic_anomalies: number | string;
      wallet_ledger_continuity_anomalies: number | string;
      wallet_balance_mismatches: number | string;
      duplicate_application_charges: number | string;
      processed_topup_anomalies: number | string;
      legacy_final_decision_missing_document: number | string;
      final_decision_missing_document: number | string;
    }>(`
      with currency_cutover as (
        select coalesce(
          (
            select applied_at
            from ${qualifiedTable("schema_migrations")}
            where name = '0011_dzd_only_and_wallet_ref.sql'
            limit 1
          ),
          '-infinity'::timestamptz
        ) as applied_at
      ),
      observability_cutover as (
        select $1::timestamptz as applied_at
      )
      select
        (
          select count(*) from ${qualifiedTable("agencies")}
          where balance < 0
        )::int as negative_balances,
        (
          select count(*) from ${qualifiedTable("agencies")} a, currency_cutover c
          where a.currency <> 'DZD' and a.created_at < c.applied_at
        )::int as legacy_non_dzd_agency_wallets,
        (
          select count(*) from ${qualifiedTable("agencies")} a, currency_cutover c
          where a.currency <> 'DZD' and a.created_at >= c.applied_at
        )::int as post_cutover_non_dzd_agency_wallets,
        (
          select count(*) from ${qualifiedTable("wallet_transactions")} wt, currency_cutover c
          where wt.currency <> 'DZD' and wt.created_at < c.applied_at
        )::int as legacy_non_dzd_wallet_rows,
        (
          select count(*) from ${qualifiedTable("wallet_transactions")} wt, currency_cutover c
          where wt.currency <> 'DZD' and wt.created_at >= c.applied_at
        )::int as post_cutover_non_dzd_wallet_rows,
        (
          select count(*) from ${qualifiedTable("wallet_transactions")}
          where
            (
              type in ('CREDIT', 'COMMERCIAL_DISCOUNT')
              and balance_after <> balance_before + amount
            )
            or
            (
              type in ('DEBIT', 'APPLICATION_CHARGE', 'COMMERCIAL_SURCHARGE')
              and balance_after <> balance_before - amount
            )
        )::int as wallet_arithmetic_anomalies,
        (
          select count(*)
          from (
            select
              agency_id,
              balance_before,
              lag(balance_after) over (
                partition by agency_id
                order by created_at, reference
              ) as previous_after
            from ${qualifiedTable("wallet_transactions")}
          ) ordered
          where previous_after is not null
            and balance_before <> previous_after
        )::int as wallet_ledger_continuity_anomalies,
        (
          select count(*)
          from ${qualifiedTable("agencies")} a
          join lateral (
            select balance_after
            from ${qualifiedTable("wallet_transactions")} wt
            where wt.agency_id = a.id
            order by wt.created_at desc, wt.id desc
            limit 1
          ) latest on true
          where a.balance <> latest.balance_after
        )::int as wallet_balance_mismatches,
        (
          select count(*)
          from (
            select application_id
            from ${qualifiedTable("wallet_transactions")}
            where type = 'APPLICATION_CHARGE' and application_id is not null
            group by application_id
            having count(*) > 1
          ) duplicates
        )::int as duplicate_application_charges,
        (
          select count(*)
          from ${qualifiedTable("wallet_topup_requests")} r
          left join ${qualifiedTable("wallet_transactions")} wt
            on wt.id = r.wallet_transaction_id
          where r.status = 'PROCESSED'
            and (
              r.wallet_transaction_id is null
              or wt.id is null
              or wt.agency_id <> r.agency_id
              or wt.type <> 'CREDIT'
              or wt.currency <> 'DZD'
            )
        )::int as processed_topup_anomalies,
        (
          select count(*)
          from ${qualifiedTable("applications")} a
          join ${qualifiedTable("statuses")} s on s.id = a.status_id
          cross join observability_cutover oc
          where s.code in ('APPROVED', 'REJECTED')
            and coalesce(a.decision_at, a.updated_at) < oc.applied_at
            and not exists (
              select 1
              from ${qualifiedTable("documents")} d
              join ${qualifiedTable("document_types")} dt on dt.id = d.document_type_id
              where d.application_id = a.id
                and d.status = 'ACCEPTED'
                and (
                  (s.code = 'APPROVED' and dt.code = 'DECISION_VISA_APPROVAL')
                  or
                  (s.code = 'REJECTED' and dt.code = 'DECISION_REFUSAL_LETTER')
                )
            )
        )::int as legacy_final_decision_missing_document,
        (
          select count(*)
          from ${qualifiedTable("applications")} a
          join ${qualifiedTable("statuses")} s on s.id = a.status_id
          cross join observability_cutover oc
          where s.code in ('APPROVED', 'REJECTED')
            and coalesce(a.decision_at, a.updated_at) >= oc.applied_at
            and not exists (
              select 1
              from ${qualifiedTable("documents")} d
              join ${qualifiedTable("document_types")} dt on dt.id = d.document_type_id
              where d.application_id = a.id
                and d.status = 'ACCEPTED'
                and (
                  (s.code = 'APPROVED' and dt.code = 'DECISION_VISA_APPROVAL')
                  or
                  (s.code = 'REJECTED' and dt.code = 'DECISION_REFUSAL_LETTER')
                )
            )
        )::int as final_decision_missing_document
    `, [FINAL_DECISION_DOCUMENT_CUTOVER]);

    const row = result.rows[0]!;
    let missingDocumentBlobs: number | null = null;
    if ((process.env.STORAGE_PROVIDER ?? "db") === "db") {
      const blobs = await pool.query<{ missing: number | string }>(`
        select count(*)::int as missing
        from ${qualifiedTable("documents")} d
        left join ${qualifiedTable("document_blobs")} b on b.key = d.storage_key
        where b.key is null
      `);
      missingDocumentBlobs = int(blobs.rows[0]?.missing);
    }

    const checks: IntegrityCounts = {
      negativeBalances: int(row.negative_balances),
      legacyNonDzdAgencyWallets: int(row.legacy_non_dzd_agency_wallets),
      postCutoverNonDzdAgencyWallets: int(row.post_cutover_non_dzd_agency_wallets),
      legacyNonDzdWalletRows: int(row.legacy_non_dzd_wallet_rows),
      postCutoverNonDzdWalletRows: int(row.post_cutover_non_dzd_wallet_rows),
      walletArithmeticAnomalies: int(row.wallet_arithmetic_anomalies),
      walletLedgerContinuityAnomalies: int(row.wallet_ledger_continuity_anomalies),
      walletBalanceMismatches: int(row.wallet_balance_mismatches),
      duplicateApplicationCharges: int(row.duplicate_application_charges),
      processedTopupAnomalies: int(row.processed_topup_anomalies),
      legacyFinalDecisionMissingDocument: int(row.legacy_final_decision_missing_document),
      finalDecisionMissingDocument: int(row.final_decision_missing_document),
      missingDocumentBlobs,
    };

    const criticalChecks = [
      checks.negativeBalances,
      checks.postCutoverNonDzdAgencyWallets,
      checks.postCutoverNonDzdWalletRows,
      checks.walletArithmeticAnomalies,
      checks.walletLedgerContinuityAnomalies,
      checks.walletBalanceMismatches,
      checks.duplicateApplicationCharges,
      checks.processedTopupAnomalies,
      checks.finalDecisionMissingDocument,
      checks.missingDocumentBlobs ?? 0,
    ];
    const violation = criticalChecks.some((value) => value > 0);
    const legacyAnomalies =
      checks.legacyNonDzdAgencyWallets +
      checks.legacyNonDzdWalletRows +
      checks.legacyFinalDecisionMissingDocument;
    const degraded = !violation && legacyAnomalies > 0;

    if (violation) {
      logEvent({
        eventName: "integrity.violation",
        severity: "critical",
        classification: "DATA_INTEGRITY_FAILURE",
        result: "violation",
        metadata: { checks },
      });
    } else if (degraded) {
      logEvent({
        eventName: "wallet.configuration.degraded",
        severity: "warning",
        result: "degraded",
        action: "integrity_check",
        metadata: {
          legacy_non_dzd_agencies: checks.legacyNonDzdAgencyWallets,
          legacy_non_dzd_wallet_rows: checks.legacyNonDzdWalletRows,
          legacy_final_decisions_missing_document:
            checks.legacyFinalDecisionMissingDocument,
        },
      });
    }

    return {
      status: violation ? "violation" : degraded ? "degraded" : "healthy",
      checks,
      checkedAt,
    };
  } catch (error) {
    logErrorOnce("integrity.check.failed", error, {
      severity: "error",
      classification: "BUSINESS_FAILURE",
      result: "technical_failed",
      action: "integrity_check",
    });
    return { status: "unavailable", checks: null, checkedAt };
  }
}
