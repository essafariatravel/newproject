/**
 * Validate a deployed application against an already verified disposable restore.
 *
 * This script deliberately runs AFTER dr:restore has proven byte/data integrity.
 * It creates short-lived session rows only in the disposable restore, then calls
 * the real application over HTTP. Session rows are removed on exit. A successful
 * own-document read may add an audit row in the disposable target; no Production
 * data is changed and no private document bytes are printed or persisted.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import {
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SCHEMA,
  assessBackupManifest,
  assessRestoreTarget,
  type BackupManifest,
} from "./lib/dr-safety";
import {
  validateRestoreEvidence,
  type RestoreEvidence,
  type ApplicationRecoveryEvidence,
  type TenantIsolationEvidence,
} from "./lib/dr-finalization";
import { privateArtifactPath } from "./lib/dr-private-path";
import { sha256File } from "./lib/dr-backup";
import { qualifiedTable } from "../src/lib/database-schema";

const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const SHA = /^[0-9a-f]{7,40}$/i;
const SESSION_COOKIE = "evos_session";

function parseArgs(args: string[]) {
  const values: Record<string, string> = {};
  const allowed = new Set([
    "--manifest",
    "--restore-evidence",
    "--base-url",
    "--target-ref",
    "--application-evidence-output",
    "--tenant-evidence-output",
  ]);
  for (let index = 0; index < args.length; index++) {
    const key = args[index]!;
    if (!allowed.has(key)) throw new Error("Unknown restored-application verification option.");
    const value = args[++index];
    if (!value) throw new Error(`${key} requires a value.`);
    values[key] = value;
  }
  for (const key of allowed) if (!values[key]) throw new Error(`${key} is required.`);

  const base = new URL(values["--base-url"]!);
  if (base.username || base.password) throw new Error("--base-url must not contain credentials.");
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(base.hostname);
  if (base.protocol !== "https:" && !(local && base.protocol === "http:")) {
    throw new Error("--base-url must use HTTPS except for localhost.");
  }
  if (base.hostname.toLowerCase() === "visa.essafariavoyages.com") {
    throw new Error("Production application host can never be used for a restore validation.");
  }
  if (!REF.test(values["--target-ref"]!)) {
    throw new Error("--target-ref must be an opaque 8-160 character recovery-target identifier.");
  }
  base.pathname = "/";
  base.search = "";
  base.hash = "";

  return {
    manifestPath: privateArtifactPath(values["--manifest"]!, "--manifest"),
    restoreEvidencePath: privateArtifactPath(values["--restore-evidence"]!, "--restore-evidence"),
    baseUrl: base,
    targetRef: values["--target-ref"]!,
    applicationEvidenceOutput: privateArtifactPath(
      values["--application-evidence-output"]!,
      "--application-evidence-output",
      { requireAbsolute: true },
    ),
    tenantEvidenceOutput: privateArtifactPath(
      values["--tenant-evidence-output"]!,
      "--tenant-evidence-output",
      { requireAbsolute: true },
    ),
  };
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function jsonFile<T>(pathname: string, label: string): Promise<T> {
  try {
    return JSON.parse(await readFile(pathname, "utf8")) as T;
  } catch {
    throw new Error(`${label} could not be read as JSON.`);
  }
}

function url(base: URL, pathname: string): string {
  return new URL(pathname, base).toString();
}

async function fetchWithSession(
  base: URL,
  pathname: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Cookie", `${SESSION_COOKIE}=${token}`);
  headers.set("User-Agent", "ESSAFARIA-DR-Recovery-Probe/1");
  return fetch(url(base, pathname), { ...init, headers, redirect: "manual" });
}

async function main() {
  if (process.env.VERCEL || process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("Restored-application verification is forbidden in deployed/Production runtime.");
  }
  const options = parseArgs(process.argv.slice(2));
  const target = assessRestoreTarget(process.env);
  if (!target.safe || !target.schema) {
    console.error(JSON.stringify({ status: "REFUSED", findings: target.findings }, null, 2));
    process.exitCode = 2;
    return;
  }

  const releaseSha = process.env.DR_RESTORE_RELEASE_SHA?.trim() ?? "";
  if (!SHA.test(releaseSha)) throw new Error("DR_RESTORE_RELEASE_SHA must identify the deployed recovery application release.");

  const rawManifest = await jsonFile<unknown>(options.manifestPath, "Backup manifest");
  const manifestAssessment = assessBackupManifest(rawManifest, {
    environment: "PRODUCTION",
    projectRef: PRODUCTION_PROJECT_REF,
    schema: PRODUCTION_SCHEMA,
  });
  if (!manifestAssessment.manifest || manifestAssessment.status === "INVALID") {
    throw new Error(`Backup manifest is INVALID: ${manifestAssessment.findings.join("; ")}`);
  }
  const manifest: BackupManifest = manifestAssessment.manifest;
  if (releaseSha.toLowerCase() !== manifest.source.releaseSha.toLowerCase()) {
    throw new Error("DR_RESTORE_RELEASE_SHA does not match the backup source release.");
  }

  const restoreEvidence = await jsonFile<RestoreEvidence>(options.restoreEvidencePath, "Restore evidence");
  const sourceManifestSha256 = await sha256File(options.manifestPath);
  const restoreFindings = validateRestoreEvidence(restoreEvidence, manifest, sourceManifestSha256);
  if (restoreFindings.length) {
    throw new Error(`Restore evidence is invalid: ${restoreFindings.join("; ")}`);
  }
  const restoreEvidenceSha256 = await sha256File(options.restoreEvidencePath);
  if (restoreEvidence.target.schema !== target.schema || restoreEvidence.target.mode !== target.mode) {
    throw new Error("Restore evidence target does not match the database target supplied to this application check.");
  }
  if (
    target.mode === "REMOTE_DISPOSABLE" &&
    restoreEvidence.target.projectRef !== process.env.DR_DISPOSABLE_PROJECT_REF
  ) {
    throw new Error("Restore evidence disposable project does not match DR_DISPOSABLE_PROJECT_REF.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sessionIds: string[] = [];
  try {
    const staff = await pool.query<{
      id: string;
      credential_version: number;
    }>(
      `select id::text, credential_version
         from ${qualifiedTable("users", target.schema)}
        where agency_id is null
          and role in ('SUPER_ADMIN','ADMIN','VISA_AGENT','ACCOUNTING')
          and status='ACTIVE' and not activation_pending and not must_change_password
        order by case role when 'SUPER_ADMIN' then 0 when 'ADMIN' then 1 else 2 end, created_at
        limit 1`,
    );
    if (!staff.rows[0]) throw new Error("Disposable restore has no active unlocked Staff identity for application validation.");

    const owner = await pool.query<{
      id: string;
      agency_id: string;
      credential_version: number;
      application_id: string;
      application_reference: string;
      document_id: string;
      document_size: number;
      applicant_count: number;
    }>(
      `select u.id::text, u.agency_id::text, u.credential_version,
              a.id::text as application_id, a.reference as application_reference,
              d.id::text as document_id, d.size_bytes::int as document_size,
              (select count(*)::int from ${qualifiedTable("applicants", target.schema)} ap where ap.application_id=a.id) as applicant_count
         from ${qualifiedTable("users", target.schema)} u
         join ${qualifiedTable("agencies", target.schema)} ag on ag.id=u.agency_id and ag.status='ACTIVE'
         join ${qualifiedTable("applications", target.schema)} a on a.agency_id=u.agency_id
         join ${qualifiedTable("documents", target.schema)} d on d.application_id=a.id
        where u.role='AGENCY_ADMIN' and u.status='ACTIVE'
          and not u.activation_pending and not u.must_change_password
        order by a.created_at desc, d.created_at desc
        limit 1`,
    );
    if (!owner.rows[0]) {
      throw new Error("Disposable restore needs an active unlocked AGENCY_ADMIN owning an application/document for runtime recovery validation.");
    }
    const agencyA = owner.rows[0];

    const foreign = await pool.query<{
      id: string;
      agency_id: string;
      credential_version: number;
    }>(
      `select u.id::text, u.agency_id::text, u.credential_version
         from ${qualifiedTable("users", target.schema)} u
         join ${qualifiedTable("agencies", target.schema)} ag on ag.id=u.agency_id and ag.status='ACTIVE'
        where u.role='AGENCY_ADMIN' and u.status='ACTIVE'
          and not u.activation_pending and not u.must_change_password
          and u.agency_id <> $1::uuid
        order by u.created_at
        limit 1`,
      [agencyA.agency_id],
    );
    if (!foreign.rows[0]) {
      throw new Error("Disposable restore needs a second active unlocked AGENCY_ADMIN from another tenant.");
    }
    const agencyB = foreign.rows[0];

    async function createRecoverySession(userId: string, credentialVersion: number) {
      const token = randomBytes(32).toString("base64url");
      const row = await pool.query<{ id: string }>(
        `insert into ${qualifiedTable("sessions", target.schema)}
           (user_id,token_hash,expires_at,last_activity_at,credential_version,ip_address,user_agent)
         values ($1::uuid,$2,now()+interval '1 hour',now(),$3,null,'ESSAFARIA DR recovery probe')
         returning id::text`,
        [userId, tokenHash(token), credentialVersion],
      );
      sessionIds.push(row.rows[0]!.id);
      return token;
    }

    const [staffToken, agencyAToken, agencyBToken] = await Promise.all([
      createRecoverySession(staff.rows[0].id, staff.rows[0].credential_version),
      createRecoverySession(agencyA.id, agencyA.credential_version),
      createRecoverySession(agencyB.id, agencyB.credential_version),
    ]);

    const staffSession = await fetchWithSession(options.baseUrl, "/api/session", staffToken);
    const staffSessionJson = staffSession.status === 200 ? await staffSession.json() as { authenticated?: boolean } : {};
    const staffAuthenticatedSession = staffSession.status === 200 && staffSessionJson.authenticated === true;

    const agencySession = await fetchWithSession(options.baseUrl, "/api/session", agencyAToken);
    const agencySessionJson = agencySession.status === 200 ? await agencySession.json() as { authenticated?: boolean } : {};
    const agencyAuthenticatedSession = agencySession.status === 200 && agencySessionJson.authenticated === true;

    // The random session hashes exist only in this disposable database. If both
    // sessions resolve through the deployment, the application is necessarily
    // connected to this recovery target rather than Production.
    if (!staffAuthenticatedSession || !agencyAuthenticatedSession) {
      throw new Error("Recovery deployment did not resolve sessions created in the disposable restored database.");
    }

    const health = await fetchWithSession(options.baseUrl, "/api/health", staffToken);
    const healthJson = health.status === 200 ? await health.json() as {
      ok?: boolean;
      schema?: { name?: string };
    } : {};
    const healthReachable =
      health.status === 200 &&
      healthJson.ok === true &&
      healthJson.schema?.name === target.schema;

    const staffRead = await fetchWithSession(
      options.baseUrl,
      `/admin/applications/${agencyA.application_id}`,
      staffToken,
    );
    const staffCriticalRead = staffRead.status === 200;
    await staffRead.body?.cancel().catch(() => undefined);

    const ownApplication = await fetchWithSession(
      options.baseUrl,
      `/portal/applications/${agencyA.application_id}`,
      agencyAToken,
    );
    const agencyOwnApplicationRead = ownApplication.status === 200;
    await ownApplication.body?.cancel().catch(() => undefined);

    const ownDocument = await fetchWithSession(
      options.baseUrl,
      `/api/documents/${agencyA.document_id}`,
      agencyAToken,
    );
    const ownLength = Number(ownDocument.headers.get("content-length") ?? "-1");
    const agencyOwnDocumentRead =
      ownDocument.status === 200 &&
      ownLength === agencyA.document_size;
    await ownDocument.body?.cancel().catch(() => undefined);

    const wallet = await fetchWithSession(options.baseUrl, "/portal/wallet", agencyAToken);
    const walletRead = wallet.status === 200;
    await wallet.body?.cancel().catch(() => undefined);

    const foreignApplication = await fetchWithSession(
      options.baseUrl,
      `/portal/applications/${agencyA.application_id}`,
      agencyBToken,
    );
    const foreignApplicationDenied = foreignApplication.status === 404;
    await foreignApplication.body?.cancel().catch(() => undefined);

    const foreignDocument = await fetchWithSession(
      options.baseUrl,
      `/api/documents/${agencyA.document_id}`,
      agencyBToken,
    );
    const foreignDocumentDenied = foreignDocument.status === 404;
    await foreignDocument.body?.cancel().catch(() => undefined);

    const foreignApplicantDenied =
      agencyA.applicant_count > 0 &&
      foreignApplicationDenied;

    const foreignWallet = await fetchWithSession(
      options.baseUrl,
      `/api/agency/wallet/export?period=all&agencyId=${encodeURIComponent(agencyA.agency_id)}`,
      agencyBToken,
    );
    let foreignWalletDataNotVisible = false;
    if (foreignWallet.status === 200) {
      const csv = await foreignWallet.text();
      foreignWalletDataNotVisible = !csv.includes(agencyA.application_reference);
    } else {
      await foreignWallet.body?.cancel().catch(() => undefined);
    }

    const forgedUpload = await fetchWithSession(
      options.baseUrl,
      `/api/documents/${agencyA.document_id}`,
      agencyBToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: Buffer.from("ESSAFARIA-DR-FORGED-UPLOAD-PROBE"),
      },
    );
    const forgedForeignUploadDenied =
      foreignDocumentDenied &&
      [403, 404, 405].includes(forgedUpload.status);
    await forgedUpload.body?.cancel().catch(() => undefined);

    const applicationChecks: ApplicationRecoveryEvidence["checks"] = {
      healthReachable,
      staffAuthenticatedSession,
      agencyAuthenticatedSession,
      staffCriticalRead,
      agencyOwnApplicationRead,
      agencyOwnDocumentRead,
      walletRead,
    };
    const tenantChecks: TenantIsolationEvidence["checks"] = {
      foreignApplicationDenied,
      foreignDocumentDenied,
      foreignApplicantDenied,
      foreignWalletDataNotVisible,
      forgedForeignUploadDenied,
    };
    const failedApplication = Object.entries(applicationChecks).filter(([, passed]) => !passed).map(([name]) => name);
    const failedTenant = Object.entries(tenantChecks).filter(([, passed]) => !passed).map(([name]) => name);
    if (failedApplication.length || failedTenant.length) {
      console.error(JSON.stringify({
        status: "FAIL",
        applicationChecks,
        tenantChecks,
        failedApplication,
        failedTenant,
      }, null, 2));
      process.exitCode = 2;
      return;
    }

    const testedAt = new Date().toISOString();
    const applicationEvidence: ApplicationRecoveryEvidence = {
      version: 1,
      kind: "ESSAFARIA_DR_APPLICATION",
      backupId: manifest.backupId,
      releaseSha: manifest.source.releaseSha,
      restoreEvidenceSha256,
      testedAt,
      targetRef: options.targetRef,
      checks: applicationChecks,
    };
    const tenantEvidence: TenantIsolationEvidence = {
      version: 1,
      kind: "ESSAFARIA_DR_TENANT_ISOLATION",
      backupId: manifest.backupId,
      releaseSha: manifest.source.releaseSha,
      restoreEvidenceSha256,
      testedAt,
      targetRef: options.targetRef,
      checks: tenantChecks,
    };

    await writeFile(
      options.applicationEvidenceOutput,
      JSON.stringify(applicationEvidence, null, 2) + "\n",
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    await writeFile(
      options.tenantEvidenceOutput,
      JSON.stringify(tenantEvidence, null, 2) + "\n",
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );

    console.log(JSON.stringify({
      status: "PASS",
      backupId: manifest.backupId,
      releaseSha: manifest.source.releaseSha,
      targetRef: options.targetRef,
      applicationEvidenceSha256: await sha256File(options.applicationEvidenceOutput),
      tenantIsolationEvidenceSha256: await sha256File(options.tenantEvidenceOutput),
      applicationChecks,
      tenantChecks,
      privateDataPrinted: false,
    }, null, 2));
  } finally {
    if (sessionIds.length) {
      await pool.query(
        `delete from ${qualifiedTable("sessions", target.schema)} where id = any($1::uuid[])`,
        [sessionIds],
      ).catch(() => undefined);
    }
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Restored application verification failed safely.");
  process.exitCode = 1;
});
