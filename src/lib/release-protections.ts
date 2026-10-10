import { pool } from "@/lib/db";
import { databaseSchema, qualifiedTable } from "@/lib/database-schema";
import { logErrorOnce, logEvent } from "@/lib/observability";

const REQUIRED_MIGRATIONS = [
  "0020_identity_security.sql",
  "0021_business_invariants.sql",
  "0022_registration_review.sql",
  "0023_operations_legal.sql",
  "0024_preview_api_lockdown.sql",
  "0025_legal_privacy_readiness.sql",
  "0026_function_privilege_hardening.sql",
  "0027_document_integrity.sql",
  "0028_file_identity_hardening.sql",
  "0029_legacy_reconciliation.sql",
  "0030_reconciliation_api_lockdown.sql",
  "0031_reconciliation_event_sequence_repair.sql",
] as const;

const REQUIRED_TRIGGERS = [
  "applications_official_final_decision",
  "price_adjustments_immutable",
  "wallet_topup_credit_proof",
  "wallet_transactions_immutable",
] as const;

const REQUIRED_CONSTRAINTS = [
  "agencies_balance_nonnegative",
] as const;

const REQUIRED_INDEXES = [
  "price_adjustments_idempotency_uq",
  "wallet_topup_idempotency_unique",
  "wallet_topup_requests_tx_unique",
  "wallet_tx_charge_once_idx",
] as const;

export interface ReleaseProtectionReport {
  status: "healthy" | "degraded" | "unavailable" | "not_applicable";
  checkedAt: string;
  missing: {
    migrations: string[];
    triggers: string[];
    constraints: string[];
    indexes: string[];
  };
  apiLockdown: {
    anonSchemaUsage: boolean | null;
    authenticatedSchemaUsage: boolean | null;
    tableGrantCount: number | null;
    routineGrantCount: number | null;
  };
}

function missing(required: readonly string[], present: string[]): string[] {
  const set = new Set(present);
  return required.filter((name) => !set.has(name));
}

/**
 * Read-only verification of release-critical DB safeguards owned by upstream
 * hardening gates. This branch never recreates those migrations; it only proves
 * that the target environment actually contains the protections.
 */
export async function checkReleaseProtections(): Promise<ReleaseProtectionReport> {
  const checkedAt = new Date().toISOString();
  const environment = process.env.VERCEL_ENV;
  if (environment !== "preview" && environment !== "production") {
    return {
      status: "not_applicable",
      checkedAt,
      missing: { migrations: [], triggers: [], constraints: [], indexes: [] },
      apiLockdown: {
        anonSchemaUsage: null,
        authenticatedSchemaUsage: null,
        tableGrantCount: null,
        routineGrantCount: null,
      },
    };
  }

  try {
    const schema = databaseSchema();
    const migrations = await pool.query<{ name: string }>(
      `select name
         from ${qualifiedTable("schema_migrations")}
        where name = any($1::text[])`,
      [REQUIRED_MIGRATIONS],
    );

    const triggers = await pool.query<{ name: string }>(
      `select t.tgname as name
         from pg_trigger t
         join pg_class c on c.oid=t.tgrelid
         join pg_namespace n on n.oid=c.relnamespace
        where n.nspname=$1
          and not t.tgisinternal
          and t.tgname = any($2::text[])`,
      [schema, REQUIRED_TRIGGERS],
    );

    const constraints = await pool.query<{ name: string }>(
      `select con.conname as name
         from pg_constraint con
         join pg_class c on c.oid=con.conrelid
         join pg_namespace n on n.oid=c.relnamespace
        where n.nspname=$1
          and con.conname = any($2::text[])`,
      [schema, REQUIRED_CONSTRAINTS],
    );

    const indexes = await pool.query<{ name: string }>(
      `select indexname as name
         from pg_indexes
        where schemaname=$1
          and indexname = any($2::text[])`,
      [schema, REQUIRED_INDEXES],
    );

    const api = await pool.query<{
      anon_schema_usage: boolean;
      authenticated_schema_usage: boolean;
      api_table_grants: number | string;
      api_routine_grants: number | string;
    }>(
      `select
         has_schema_privilege('anon', $1, 'USAGE') as anon_schema_usage,
         has_schema_privilege('authenticated', $1, 'USAGE') as authenticated_schema_usage,
         (
           select count(*)::int
             from information_schema.role_table_grants
            where table_schema=$1
              and grantee in ('anon','authenticated')
         ) as api_table_grants,
         (
           select count(*)::int
             from information_schema.routine_privileges
            where specific_schema=$1
              and grantee in ('anon','authenticated')
         ) as api_routine_grants`,
      [schema],
    );

    const missingProtections = {
      migrations: missing(REQUIRED_MIGRATIONS, migrations.rows.map((row) => row.name)),
      triggers: missing(REQUIRED_TRIGGERS, triggers.rows.map((row) => row.name)),
      constraints: missing(REQUIRED_CONSTRAINTS, constraints.rows.map((row) => row.name)),
      indexes: missing(REQUIRED_INDEXES, indexes.rows.map((row) => row.name)),
    };
    const apiRow = api.rows[0];
    const apiLockdown = {
      anonSchemaUsage: Boolean(apiRow?.anon_schema_usage),
      authenticatedSchemaUsage: Boolean(apiRow?.authenticated_schema_usage),
      tableGrantCount: Number(apiRow?.api_table_grants ?? 0),
      routineGrantCount: Number(apiRow?.api_routine_grants ?? 0),
    };

    const protectionMissing =
      Object.values(missingProtections).some((items) => items.length > 0) ||
      apiLockdown.anonSchemaUsage ||
      apiLockdown.authenticatedSchemaUsage ||
      apiLockdown.tableGrantCount > 0 ||
      apiLockdown.routineGrantCount > 0;

    if (protectionMissing) {
      logEvent({
        eventName: "release.protections.missing",
        severity: "error",
        classification: "BUSINESS_FAILURE",
        result: "degraded",
        action: "release_protection_check",
        metadata: {
          missing_migration_count: missingProtections.migrations.length,
          missing_trigger_count: missingProtections.triggers.length,
          missing_constraint_count: missingProtections.constraints.length,
          missing_index_count: missingProtections.indexes.length,
          api_schema_exposure:
            apiLockdown.anonSchemaUsage || apiLockdown.authenticatedSchemaUsage,
          api_table_grant_count: apiLockdown.tableGrantCount,
          api_routine_grant_count: apiLockdown.routineGrantCount,
        },
      });
    }

    return {
      status: protectionMissing ? "degraded" : "healthy",
      checkedAt,
      missing: missingProtections,
      apiLockdown,
    };
  } catch (error) {
    logErrorOnce("release.protection_check.failed", error, {
      severity: "error",
      classification: "BUSINESS_FAILURE",
      result: "technical_failed",
      action: "release_protection_check",
    });
    return {
      status: "unavailable",
      checkedAt,
      missing: { migrations: [], triggers: [], constraints: [], indexes: [] },
      apiLockdown: {
        anonSchemaUsage: null,
        authenticatedSchemaUsage: null,
        tableGrantCount: null,
        routineGrantCount: null,
      },
    };
  }
}
