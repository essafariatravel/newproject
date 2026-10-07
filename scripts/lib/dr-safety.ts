import { targetsSupabaseProject } from "../../src/lib/database-config";

export const DR_MANIFEST_VERSION = 1 as const;
export const PRODUCTION_PROJECT_REF = "xgetzgixalrsmuvfthpf";
export const PRODUCTION_SCHEMA = "visa_os";
export const DR_CRITICAL_TABLES = [
  // Preserve the full application table set for this RC, including objects
  // introduced through migration 0031 and tables used for immutable evidence.
  "schema_migrations",
  "agencies",
  "users",
  "sessions",
  "session_presence",
  "countries",
  "visa_categories",
  "visa_types",
  "document_types",
  "visa_requirements",
  "currencies",
  "statuses",
  "status_transitions",
  "priorities",
  "applications",
  "applicants",
  "checklist_items",
  "documents",
  "wallet_transactions",
  "application_price_adjustments",
  "application_status_history",
  "document_requests",
  "notifications",
  "communications",
  "audit_logs",
  "agency_registrations",
  "agency_registration_documents",
  "agency_registration_history",
  "agency_registration_requests",
  "agency_registration_followup_tokens",
  "account_activation_tokens",
  "site_settings",
  "wallet_topup_requests",
  "document_blobs",
  "account_recovery_requests",
  "account_access_tokens",
  "auth_rate_limits",
  "legal_versions",
  "legacy_reconciliation_issues",
  "legacy_reconciliation_events",
  "mfa_credentials",
  "mfa_enrollment_authorizations",
] as const;

/** Restore the source's actual ledger, not unapplied future hardening tables. */
export function requiredDrTables(ledger:readonly string[]):readonly string[]{
  const numbers=ledger.map(name=>/^\d{4}_[a-z0-9_]+\.sql$/.test(name)?Number(name.slice(0,4)):NaN).sort((a,b)=>a-b);
  if(!numbers.length||numbers.some((value,index)=>value!==index+1)||numbers.at(-1)!>33)throw new Error("DR source migration ledger is not a supported contiguous history.");
  const introduced:Record<string,number>={agency_registrations:3,agency_registration_documents:3,agency_registration_history:3,account_activation_tokens:3,application_price_adjustments:8,document_requests:12,wallet_topup_requests:14,account_recovery_requests:20,account_access_tokens:20,auth_rate_limits:20,agency_registration_requests:22,agency_registration_followup_tokens:22,legal_versions:23,legacy_reconciliation_issues:29,legacy_reconciliation_events:29,mfa_credentials:32,mfa_enrollment_authorizations:32};
  introduced.session_presence=18;
  return DR_CRITICAL_TABLES.filter(table=>(introduced[table]??1)<=numbers.at(-1)!);
}

const SHA256 = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export type BackupEnvironment = "PRODUCTION" | "PREVIEW" | "RESTORE_TEST";
export type StorageBackupMode = "DATABASE_BLOBS" | "EXTERNAL_OBJECTS";

export interface BackupVerification {
  checksumVerified: boolean;
  encryptionVerified: boolean;
  backupParsed: boolean;
  expectedSchemaPresent: boolean;
  criticalTablesPresent: boolean;
  rowCountsCaptured: boolean;
  sequencesCaptured: boolean;
  storageInventoryCaptured: boolean;
  sourceIdentityVerified: boolean;
  offsiteCopyVerified: boolean;
  verifiedAt: string | null;
  restoreTestedAt: string | null;
  restoreEnvironment: string | null;
  restoredApplicationChecksPassed: boolean;
  walletReconciliationPassed: boolean;
  storageReconciliationPassed: boolean;
  tenantIsolationPassed: boolean;
  restoreEvidenceSha256: string | null;
  offsiteEvidenceRef: string | null;
  applicationEvidenceRef: string | null;
  tenantIsolationEvidenceRef: string | null;
}

export interface BackupManifest {
  version: typeof DR_MANIFEST_VERSION;
  backupId: string;
  createdAt: string;
  source: {
    environment: BackupEnvironment;
    projectRef: string;
    schema: string;
    releaseSha: string;
    migrationLedger: string[];
  };
  database: {
    artifact: string;
    bytes: number;
    sha256: string;
    encrypted: boolean;
    rowCounts: Record<string, number>;
    sequences: string[];
  };
  storage: {
    mode: StorageBackupMode;
    objectCount: number;
    totalBytes: number;
    manifestSha256: string;
    encrypted: boolean;
  };
  verification: BackupVerification;
}

export interface ManifestAssessment {
  status: "INVALID" | "CREATED" | "VERIFIED";
  findings: string[];
  manifest: BackupManifest | null;
}

export function backupTimelineFindings(manifest: BackupManifest): string[] {
  const findings: string[] = [];
  const created = Date.parse(manifest.createdAt);
  const verified = manifest.verification.verifiedAt ? Date.parse(manifest.verification.verifiedAt) : null;
  const restored = manifest.verification.restoreTestedAt ? Date.parse(manifest.verification.restoreTestedAt) : null;
  if (verified !== null && verified < created) findings.push("backup verification timestamp predates backup creation");
  if (restored !== null && restored < created) findings.push("restore-test timestamp predates backup creation");
  if (verified !== null && restored !== null && verified < restored) findings.push("backup verification timestamp predates the recorded restore test");
  return findings;
}

export function backupFreshnessFindings(
  manifest: BackupManifest,
  maxAgeHours: number,
  now: Date = new Date(),
): string[] {
  const findings = backupTimelineFindings(manifest);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    findings.push("backup freshness window must be a positive number of hours");
    return findings;
  }
  const created = Date.parse(manifest.createdAt);
  const ageMs = now.getTime() - created;
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  if (ageMs < -5 * 60 * 1000) findings.push("backup createdAt is unexpectedly in the future");
  if (ageMs > maxAgeMs) findings.push(`backup is older than the allowed ${maxAgeHours}-hour recovery window`);
  return findings;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isoDate(value: unknown): string | null {
  const text = stringValue(value);
  if (!text || !ISO_DATE.test(text) || Number.isNaN(Date.parse(text))) return null;
  return text;
}

function sha256(value: unknown): string | null {
  const text = stringValue(value)?.toLowerCase() ?? null;
  return text && SHA256.test(text) ? text : null;
}

function parseManifest(input: unknown, findings: string[]): BackupManifest | null {
  const root = record(input);
  if (!root) {
    findings.push("manifest must be a JSON object");
    return null;
  }

  const source = record(root.source);
  const database = record(root.database);
  const storage = record(root.storage);
  const verification = record(root.verification);
  if (!source || !database || !storage || !verification) {
    findings.push("manifest must contain source, database, storage and verification objects");
    return null;
  }

  if (root.version !== DR_MANIFEST_VERSION) findings.push(`manifest version must be ${DR_MANIFEST_VERSION}`);
  const backupId = stringValue(root.backupId);
  if (!backupId || !/^[A-Za-z0-9._:-]{8,120}$/.test(backupId)) findings.push("backupId is missing or unsafe");
  const createdAt = isoDate(root.createdAt);
  if (!createdAt) findings.push("createdAt must be an ISO UTC timestamp");

  const environment = stringValue(source.environment);
  if (!environment || !["PRODUCTION", "PREVIEW", "RESTORE_TEST"].includes(environment)) findings.push("source.environment is invalid");
  const projectRef = stringValue(source.projectRef);
  if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef)) findings.push("source.projectRef is invalid");
  const schema = stringValue(source.schema);
  if (!schema || !/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) findings.push("source.schema is invalid");
  const releaseSha = stringValue(source.releaseSha);
  if (!releaseSha || !/^[0-9a-f]{7,40}$/i.test(releaseSha)) findings.push("source.releaseSha is invalid");
  const migrationLedger = Array.isArray(source.migrationLedger)
    ? source.migrationLedger.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
  if (!Array.isArray(source.migrationLedger) || migrationLedger.length !== source.migrationLedger.length) findings.push("source.migrationLedger must contain only non-empty strings");

  const dbArtifact = stringValue(database.artifact);
  if (!dbArtifact || /[\\/]/.test(dbArtifact)) findings.push("database.artifact must be an opaque filename, not a path");
  const dbBytes = nonNegativeInteger(database.bytes);
  if (dbBytes === null || dbBytes === 0) findings.push("database.bytes must be greater than zero");
  const dbSha = sha256(database.sha256);
  if (!dbSha) findings.push("database.sha256 must be a SHA-256 digest");
  const dbEncrypted = booleanValue(database.encrypted);
  if (dbEncrypted === null) findings.push("database.encrypted must be boolean");
  const rowCountsInput = record(database.rowCounts);
  const rowCounts: Record<string, number> = {};
  if (!rowCountsInput) {
    findings.push("database.rowCounts must be an object");
  } else {
    for (const [name, value] of Object.entries(rowCountsInput)) {
      if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name) || nonNegativeInteger(value) === null) {
        findings.push("database.rowCounts contains an invalid table/count entry");
        continue;
      }
      rowCounts[name] = value as number;
    }
    let required:readonly string[]=DR_CRITICAL_TABLES;
    try{required=requiredDrTables(migrationLedger);}catch{findings.push("source.migrationLedger is not a supported contiguous history");}
    for (const table of required) {
      if (!(table in rowCounts)) findings.push(`database.rowCounts is missing critical table ${table}`);
    }
  }
  const sequences = Array.isArray(database.sequences)
    ? database.sequences.filter((entry): entry is string => typeof entry === "string" && /^[a-z_][a-z0-9_]{0,62}$/.test(entry))
    : [];
  if (!Array.isArray(database.sequences) || sequences.length !== database.sequences.length) {
    findings.push("database.sequences must contain only valid sequence names");
  }
  if ((rowCounts.wallet_transactions ?? 0) > 0 && !sequences.includes("wallet_reference_seq")) {
    findings.push("database.sequences is missing wallet_reference_seq");
  }
  if ((rowCounts.wallet_topup_requests ?? 0) > 0 && !sequences.includes("wallet_topup_reference_seq")) {
    findings.push("database.sequences is missing wallet_topup_reference_seq");
  }

  const storageMode = stringValue(storage.mode);
  if (!storageMode || !["DATABASE_BLOBS", "EXTERNAL_OBJECTS"].includes(storageMode)) findings.push("storage.mode is invalid");
  const objectCount = nonNegativeInteger(storage.objectCount);
  if (objectCount === null) findings.push("storage.objectCount must be a non-negative integer");
  const totalBytes = nonNegativeInteger(storage.totalBytes);
  if (totalBytes === null) findings.push("storage.totalBytes must be a non-negative integer");
  const storageSha = sha256(storage.manifestSha256);
  if (!storageSha) findings.push("storage.manifestSha256 must be a SHA-256 digest");
  const storageEncrypted = booleanValue(storage.encrypted);
  if (storageEncrypted === null) findings.push("storage.encrypted must be boolean");

  const requiredBooleans = [
    "checksumVerified",
    "encryptionVerified",
    "backupParsed",
    "expectedSchemaPresent",
    "criticalTablesPresent",
    "rowCountsCaptured",
    "sequencesCaptured",
    "storageInventoryCaptured",
    "sourceIdentityVerified",
    "offsiteCopyVerified",
    "restoredApplicationChecksPassed",
    "walletReconciliationPassed",
    "storageReconciliationPassed",
    "tenantIsolationPassed",
  ] as const;
  const bools: Record<(typeof requiredBooleans)[number], boolean> = {} as Record<(typeof requiredBooleans)[number], boolean>;
  for (const key of requiredBooleans) {
    const value = booleanValue(verification[key]);
    if (value === null) findings.push(`verification.${key} must be boolean`);
    bools[key] = value ?? false;
  }
  const verifiedAt = verification.verifiedAt === null ? null : isoDate(verification.verifiedAt);
  if (verification.verifiedAt !== null && !verifiedAt) findings.push("verification.verifiedAt must be null or an ISO UTC timestamp");
  const restoreTestedAt = verification.restoreTestedAt === null ? null : isoDate(verification.restoreTestedAt);
  if (verification.restoreTestedAt !== null && !restoreTestedAt) findings.push("verification.restoreTestedAt must be null or an ISO UTC timestamp");
  const restoreEnvironment = verification.restoreEnvironment == null ? null : stringValue(verification.restoreEnvironment);
  if (verification.restoreEnvironment != null && !restoreEnvironment) findings.push("verification.restoreEnvironment must be null or a non-empty string");
  const restoreEvidenceSha256 = verification.restoreEvidenceSha256 == null ? null : sha256(verification.restoreEvidenceSha256);
  if (verification.restoreEvidenceSha256 != null && !restoreEvidenceSha256) findings.push("verification.restoreEvidenceSha256 must be null or a SHA-256 digest");
  const evidenceRef = (key: "offsiteEvidenceRef" | "applicationEvidenceRef" | "tenantIsolationEvidenceRef") => {
    if (verification[key] == null) return null;
    const value = stringValue(verification[key]);
    if (!value || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(value)) {
      findings.push(`verification.${key} must be null or an opaque evidence reference`);
      return null;
    }
    return value;
  };
  const offsiteEvidenceRef = evidenceRef("offsiteEvidenceRef");
  const applicationEvidenceRef = evidenceRef("applicationEvidenceRef");
  const tenantIsolationEvidenceRef = evidenceRef("tenantIsolationEvidenceRef");

  if (findings.length) return null;

  return {
    version: DR_MANIFEST_VERSION,
    backupId: backupId!,
    createdAt: createdAt!,
    source: {
      environment: environment as BackupEnvironment,
      projectRef: projectRef!,
      schema: schema!,
      releaseSha: releaseSha!,
      migrationLedger,
    },
    database: {
      artifact: dbArtifact!,
      bytes: dbBytes!,
      sha256: dbSha!,
      encrypted: dbEncrypted!,
      rowCounts,
      sequences,
    },
    storage: {
      mode: storageMode as StorageBackupMode,
      objectCount: objectCount!,
      totalBytes: totalBytes!,
      manifestSha256: storageSha!,
      encrypted: storageEncrypted!,
    },
    verification: {
      ...bools,
      verifiedAt,
      restoreTestedAt,
      restoreEnvironment,
      restoreEvidenceSha256,
      offsiteEvidenceRef,
      applicationEvidenceRef,
      tenantIsolationEvidenceRef,
    },
  };
}

export function assessBackupManifest(
  input: unknown,
  expected?: { projectRef?: string; schema?: string; environment?: BackupEnvironment },
): ManifestAssessment {
  const findings: string[] = [];
  const manifest = parseManifest(input, findings);
  if (!manifest) return { status: "INVALID", findings, manifest: null };

  if (expected?.projectRef && manifest.source.projectRef !== expected.projectRef) findings.push("source project does not match the expected recovery source");
  if (expected?.schema && manifest.source.schema !== expected.schema) findings.push("source schema does not match the expected recovery source");
  if (expected?.environment && manifest.source.environment !== expected.environment) findings.push("source environment does not match the expected recovery source");
  if (!manifest.database.encrypted) findings.push("database backup is not marked encrypted");
  if (!manifest.storage.encrypted) findings.push("storage backup is not marked encrypted");
  findings.push(...backupTimelineFindings(manifest));

  if (findings.length) return { status: "INVALID", findings, manifest };

  const v = manifest.verification;
  const verifiedChecks = [
    v.checksumVerified,
    v.encryptionVerified,
    v.backupParsed,
    v.expectedSchemaPresent,
    v.criticalTablesPresent,
    v.rowCountsCaptured,
    v.sequencesCaptured,
    v.storageInventoryCaptured,
    v.sourceIdentityVerified,
    v.offsiteCopyVerified,
    v.restoredApplicationChecksPassed,
    v.walletReconciliationPassed,
    v.storageReconciliationPassed,
    v.tenantIsolationPassed,
  ];
  const restoreIsIsolated = Boolean(v.restoreTestedAt && v.restoreEnvironment && v.restoreEnvironment !== "PRODUCTION");
  const evidenceIsTraceable = Boolean(
    v.restoreEvidenceSha256 &&
    v.offsiteEvidenceRef &&
    v.applicationEvidenceRef &&
    v.tenantIsolationEvidenceRef
  );
  if (verifiedChecks.every(Boolean) && v.verifiedAt && restoreIsIsolated && evidenceIsTraceable) {
    return { status: "VERIFIED", findings: [], manifest };
  }
  const incomplete = ["backup exists but has not satisfied every verification and isolated-restore requirement"];
  if (verifiedChecks.every(Boolean) && v.verifiedAt && restoreIsIsolated && !evidenceIsTraceable) {
    incomplete.push("verification claims are not traceable to restore, off-site, application and tenant-isolation evidence");
  }
  return { status: "CREATED", findings: incomplete, manifest };
}

export interface RestoreTargetAssessment {
  safe: boolean;
  findings: string[];
  schema: string | null;
  mode: "LOCAL" | "REMOTE_DISPOSABLE" | null;
}

export function assessRestoreTarget(env: Record<string, string | undefined>): RestoreTargetAssessment {
  const findings: string[] = [];
  const explicitEnvironment = env.DR_ENVIRONMENT;
  if (explicitEnvironment !== "RESTORE_TEST") findings.push("DR_ENVIRONMENT must equal RESTORE_TEST");
  if (env.VERCEL || env.VERCEL_ENV === "production" || env.NODE_ENV === "production") findings.push("restore tests are forbidden in deployed/Production runtime");

  const schema = env.DATABASE_SCHEMA && /^[a-z_][a-z0-9_]{0,62}$/.test(env.DATABASE_SCHEMA) ? env.DATABASE_SCHEMA : null;
  if (!schema) findings.push("DATABASE_SCHEMA must be explicit and valid");

  const raw = env.DATABASE_URL;
  if (!raw) {
    findings.push("DATABASE_URL must be explicit");
    return { safe: false, findings, schema, mode: null };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    findings.push("DATABASE_URL must be a PostgreSQL URI");
    return { safe: false, findings, schema, mode: null };
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) findings.push("DATABASE_URL must use PostgreSQL");

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (local) return { safe: findings.length === 0, findings, schema, mode: "LOCAL" };

  if (env.DR_ALLOW_REMOTE_DISPOSABLE !== "true") {
    findings.push("remote restore target requires DR_ALLOW_REMOTE_DISPOSABLE=true");
    return { safe: false, findings, schema, mode: null };
  }
  const disposableRef = env.DR_DISPOSABLE_PROJECT_REF;
  if (!disposableRef || !/^[a-z0-9]{20}$/.test(disposableRef)) findings.push("DR_DISPOSABLE_PROJECT_REF must explicitly identify the disposable project");
  if (disposableRef === PRODUCTION_PROJECT_REF) findings.push("Production Supabase project can never be a restore-test target");
  if (disposableRef) {
    try {
      if (!targetsSupabaseProject(raw, disposableRef)) findings.push("DATABASE_URL does not match DR_DISPOSABLE_PROJECT_REF");
    } catch {
      findings.push("DATABASE_URL project identity could not be verified");
    }
  }
  return { safe: findings.length === 0, findings, schema, mode: "REMOTE_DISPOSABLE" };
}

export type LedgerType = "CREDIT" | "DEBIT" | "APPLICATION_CHARGE" | "COMMERCIAL_DISCOUNT" | "COMMERCIAL_SURCHARGE";

export interface WalletAgencySnapshot {
  id: string;
  balance: string;
}

export interface WalletLedgerSnapshot {
  id: string;
  reference: string;
  agencyId: string;
  applicationId: string | null;
  type: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  createdAt: string | Date;
}

export interface TopupSnapshot {
  id: string;
  reference: string;
  agencyId: string;
  status: string;
  walletTransactionId: string | null;
}

export interface WalletReconciliation {
  ok: boolean;
  findings: string[];
  agenciesChecked: number;
  transactionsChecked: number;
}

function cents(value: string): number | null {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function signedDelta(type: string, amount: number): number | null {
  if (type === "CREDIT" || type === "COMMERCIAL_DISCOUNT") return amount;
  if (type === "DEBIT" || type === "APPLICATION_CHARGE" || type === "COMMERCIAL_SURCHARGE") return -amount;
  return null;
}

export function reconcileWalletSnapshot(
  agencies: readonly WalletAgencySnapshot[],
  transactions: readonly WalletLedgerSnapshot[],
  topups: readonly TopupSnapshot[] = [],
): WalletReconciliation {
  const findings: string[] = [];
  const references = new Set<string>();
  const txById = new Map(transactions.map((tx) => [tx.id, tx]));
  const appCharges = new Set<string>();

  for (const tx of transactions) {
    if (references.has(tx.reference)) findings.push(`duplicate wallet reference: ${tx.reference}`);
    references.add(tx.reference);
    const amount = cents(tx.amount);
    const before = cents(tx.balanceBefore);
    const after = cents(tx.balanceAfter);
    if (amount === null || amount <= 0 || before === null || after === null) {
      findings.push(`wallet transaction ${tx.id} has invalid monetary values`);
      continue;
    }
    const delta = signedDelta(tx.type, amount);
    if (delta === null) {
      findings.push(`wallet transaction ${tx.id} has unknown type ${tx.type}`);
      continue;
    }
    if (before + delta !== after) findings.push(`wallet transaction ${tx.id} before/after arithmetic mismatch`);
    if (after < 0) findings.push(`wallet transaction ${tx.id} produces a negative balance`);
    if (tx.type === "APPLICATION_CHARGE" && tx.applicationId) {
      if (appCharges.has(tx.applicationId)) findings.push(`application ${tx.applicationId} has more than one APPLICATION_CHARGE`);
      appCharges.add(tx.applicationId);
    }
  }

  const byAgency = new Map<string, WalletLedgerSnapshot[]>();
  for (const tx of transactions) {
    const list = byAgency.get(tx.agencyId) ?? [];
    list.push(tx);
    byAgency.set(tx.agencyId, list);
  }
  for (const agency of agencies) {
    const current = cents(agency.balance);
    if (current === null || current < 0) {
      findings.push(`agency ${agency.id} has invalid current wallet balance`);
      continue;
    }
    const rows = (byAgency.get(agency.id) ?? []).sort((a, b) => {
      const at = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return at || a.id.localeCompare(b.id);
    });
    for (let index = 1; index < rows.length; index++) {
      if (cents(rows[index - 1]!.balanceAfter) !== cents(rows[index]!.balanceBefore)) {
        findings.push(`agency ${agency.id} ledger chain breaks between ${rows[index - 1]!.id} and ${rows[index]!.id}`);
      }
    }
    const last = rows.at(-1);
    if (last && cents(last.balanceAfter) !== current) findings.push(`agency ${agency.id} current balance differs from ledger tail`);
    if (!last && current !== 0) findings.push(`agency ${agency.id} has a non-zero balance with no wallet ledger evidence`);
  }

  for (const request of topups) {
    const linked = request.walletTransactionId ? txById.get(request.walletTransactionId) : undefined;
    if (request.status === "PROCESSED") {
      if (!request.walletTransactionId || !linked) {
        findings.push(`processed top-up ${request.id} has no existing linked wallet transaction`);
      } else if (linked.agencyId !== request.agencyId || linked.type !== "CREDIT") {
        findings.push(`processed top-up ${request.id} links to an incompatible wallet transaction`);
      }
    } else if (request.walletTransactionId) {
      findings.push(`non-processed top-up ${request.id} unexpectedly links to a wallet transaction`);
    }
  }

  return {
    ok: findings.length === 0,
    findings,
    agenciesChecked: agencies.length,
    transactionsChecked: transactions.length,
  };
}

export const DR_EPHEMERAL_STORAGE_PREFIXES = ["pending-request/"] as const;

export function isEphemeralStorageKey(key: string): boolean {
  return DR_EPHEMERAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export type StorageReferenceKind = "DOSSIER_DOCUMENT" | "REGISTRATION_DOCUMENT" | "TOPUP_RECEIPT" | "OFFICIAL_DECISION" | "AGENCY_LOGO" | "BRAND_LOGO";

export interface StorageReferenceSnapshot {
  id: string;
  kind: StorageReferenceKind;
  key: string;
  expectedSizeBytes: number | null;
}

export interface StorageObjectSnapshot {
  key: string;
  sizeBytes: number;
  sha256?: string | null;
}

export interface StorageReconciliation {
  ok: boolean;
  findings: string[];
  referencesChecked: number;
  objectsChecked: number;
  missingObjects: number;
  orphanObjects: number;
  ephemeralObjects: number;
  ephemeralBytes: number;
}

export function reconcileStorageSnapshot(
  references: readonly StorageReferenceSnapshot[],
  objects: readonly StorageObjectSnapshot[],
): StorageReconciliation {
  const findings: string[] = [];
  const objectMap = new Map<string, StorageObjectSnapshot>();
  let ephemeralObjects = 0;
  let ephemeralBytes = 0;
  for (const object of objects) {
    if (!object.key) {
      findings.push("storage object has an empty key");
      continue;
    }
    if (isEphemeralStorageKey(object.key)) {
      ephemeralObjects++;
      ephemeralBytes += Number.isFinite(object.sizeBytes) ? object.sizeBytes : 0;
      continue;
    }
    if (objectMap.has(object.key)) findings.push(`duplicate storage object manifest entry for key ${object.key}`);
    objectMap.set(object.key, object);
  }
  const referenced = new Set<string>();
  let missingObjects = 0;
  for (const ref of references) {
    referenced.add(ref.key);
    const object = objectMap.get(ref.key);
    if (!object) {
      missingObjects++;
      const prefix = ref.kind === "OFFICIAL_DECISION" || ref.kind === "TOPUP_RECEIPT" ? "CRITICAL_DOCUMENT_MISSING" : "MISSING_BLOB";
      findings.push(`${prefix}: ${ref.kind} ${ref.id}`);
      continue;
    }
    if (ref.expectedSizeBytes !== null && ref.expectedSizeBytes > 0 && object.sizeBytes !== ref.expectedSizeBytes) {
      findings.push(`VERSION_OR_SIZE_MISMATCH: ${ref.kind} ${ref.id}`);
    }
  }
  let orphanObjects = 0;
  for (const object of objectMap.values()) {
    if (!referenced.has(object.key)) {
      orphanObjects++;
      findings.push(`ORPHAN_BLOB: ${object.key}`);
    }
  }
  return {
    ok: findings.length === 0,
    findings,
    referencesChecked: references.length,
    objectsChecked: objectMap.size,
    missingObjects,
    orphanObjects,
    ephemeralObjects,
    ephemeralBytes,
  };
}
