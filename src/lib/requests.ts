/* ------------------------------------------------------------------ */
/* Atomic 3-step visa request submission (Phase 2.3 §5–§12)            */
/*                                                                     */
/* The portal's new request flow holds ALL state client-side until the  */
/* final preview step. Nothing is persisted before the user presses     */
/* "Confirm & submit": no draft rows, no reference allocation, no       */
/* checklist snapshot. The single server action below then performs     */
/* the enumerated validations and commits ONE pg transaction:           */
/* application (SUBMITTED) + applicants + checklist snapshot +          */
/* document records + wallet debit + ledger + status history.           */
/* Storage blobs are written before the transaction and best-effort     */
/* removed if the transaction aborts, so a failed submit never leaves   */
/* business rows behind.                                                */
/*                                                                     */
/* Idempotency: the client generates a UUID per attempt; the partial    */
/* unique index applications_idempotency_key_uq (migration 0009) makes  */
/* retries (F5 on the pending request, double click) return the SAME    */
/* application instead of charging twice.                               */
/* ------------------------------------------------------------------ */

import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { databaseSchema, qualifiedTable } from "@/lib/database-schema";
import {
  applications,
  countries,
  documentTypes,
  priorities,
  statuses,
  visaCategories,
  visaRequirements,
  visaTypes,
} from "@/db/schema";
import type { AuthUser } from "@/lib/types";
import { AppError, ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/types";
import { buildStorageKey, storageProvider } from "@/lib/storage";
import { isValidNationality } from "@/lib/nationalities";

/**
 * Phase 2-Final: exactly ONE applicant per request — the portal collects
 * only Full Name + Nationality (stable ISO code, correction 6). The
 * passport/DOB/contact fields are optional for legacy compatibility but
 * the simplified flow never sends them.
 */
export interface RequestTraveller {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string | null;
  nationality: string;
  passportNumber?: string | null;
  passportIssueDate?: string | null;
  passportExpiryDate?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface RequestDocument {
  documentTypeId: string;
  file: { name: string; type: string; size: number; data: Buffer };
}

export interface SubmitVisaRequestInput {
  actor: AuthUser;
  idempotencyKey: string;
  /** Phase 2-Final: the country the user picked in step 1 (correction 3). */
  countryId: string;
  visaTypeId: string;
  priorityCode?: string | null;
  agencyNotes?: string | null;
  travellers: RequestTraveller[];
  documents: RequestDocument[];
  ipAddress?: string | null;
}

export interface SubmitVisaRequestResult {
  applicationId: string;
  reference: string;
  /** true when a retry reused the previously committed application */
  reused: boolean;
  charge: { balanceBefore: string; balanceAfter: string; transactionId: string };
}

/**
 * The enumerated server-side validations for the atomic request gate
 * (Phase 2.3 §10). Codes are stable identifiers, never localized.
 */
export const REQUEST_VALIDATION_CODES = [
  "IDEMPOTENCY_KEY_REQUIRED",
  "VISA_TYPE_REQUIRED",
  "VISA_TYPE_INVALID",
  "PRIORITY_INVALID",
  "COUNTRY_REQUIRED",
  "COUNTRY_INVALID",
  "COUNTRY_VISA_MISMATCH",
  "APPLICANT_REQUIRED",
  "APPLICANT_LIMIT",
  "APPLICANT_FULL_NAME",
  "APPLICANT_NATIONALITY",
  "APPLICANT_NATIONALITY_INVALID",
  "NOTES_TOO_LONG",
  "REQUIRED_DOCUMENT_MISSING",
  "EMPTY_FILE",
  "FILE_TOO_LARGE",
  "UNSUPPORTED_TYPE",
  "INVALID_FILENAME",
] as const;

export type RequestValidationCode = (typeof REQUEST_VALIDATION_CODES)[number];

export const MAX_TRAVELLERS_PER_REQUEST = 1;
export const MAX_APPLICANTS_PER_REQUEST = 1;
export const MAX_FILES_PER_REQUIREMENT = 3;
export const MAX_NOTES_LENGTH = 1000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function _validDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function randomRef(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  return out;
}

function generateReference(): string {
  const year = new Date().getFullYear() % 100;
  return `EVT-${String(year).padStart(2, "0")}-${randomRef()}`;
}

interface VisaConfigRow {
  visaTypeId: string;
  visaTypeName: string;
  visaTypeCode: string;
  categoryName: string;
  countryId: string;
  countryName: string;
  fee: string;
  currency: string;
  processingMinDays: number;
  processingMaxDays: number;
}

interface RequirementRow {
  documentTypeId: string;
  name: string;
  code: string;
  required: boolean;
  sortOrder: number;
  notes: string | null;
}

/** Public read of the active requirement set for a visa type (portal step 2). */
export async function listRequirementsForVisaType(visaTypeId: string): Promise<RequirementRow[]> {
  return db
    .select({
      documentTypeId: documentTypes.id,
      name: documentTypes.name,
      code: documentTypes.code,
      required: visaRequirements.required,
      sortOrder: visaRequirements.sortOrder,
      notes: visaRequirements.notes,
    })
    .from(visaRequirements)
    .innerJoin(documentTypes, eq(visaRequirements.documentTypeId, documentTypes.id))
    .where(
      and(
        eq(visaRequirements.visaTypeId, visaTypeId),
        eq(visaRequirements.active, true),
        eq(documentTypes.active, true),
      ),
    )
    .orderBy(asc(visaRequirements.sortOrder));
}

/** Validate (throwing AppError with a REQUEST_VALIDATION_CODES code). */
function validateRequest(
  input: SubmitVisaRequestInput,
  cfg: VisaConfigRow | undefined,
  requirements: RequirementRow[],
  priorityOk: boolean,
): RequestDocument[] {
  const err = (code: RequestValidationCode, message: string): never => {
    throw new AppError(code, message);
  };

  if (!input.idempotencyKey?.trim()) err("IDEMPOTENCY_KEY_REQUIRED", "Missing submission idempotency key.");
  if (!input.visaTypeId?.trim()) err("VISA_TYPE_REQUIRED", "Choose a visa type.");
  if (!cfg) err("VISA_TYPE_INVALID", "Visa type not found or inactive.");
  if (!priorityOk) err("PRIORITY_INVALID", "Priority is not available.");

  if (!input.countryId?.trim()) err("COUNTRY_REQUIRED", "Choose a destination country.");
  if (!cfg) void 0; // narrowing — already handled above
  if (cfg && input.countryId.trim() !== cfg.countryId) {
    err("COUNTRY_VISA_MISMATCH", "The selected visa type does not belong to the selected country.");
  }

  const travellers = input.travellers;
  if (!travellers || travellers.length === 0) err("APPLICANT_REQUIRED", "Provide the applicant's full name and nationality.");
  if (travellers.length > MAX_TRAVELLERS_PER_REQUEST) {
    err("APPLICANT_LIMIT", "One application carries exactly one applicant.");
  }
  const t = travellers[0]!;
  const fullName = (t.fullName ?? `${t.firstName ?? ""} ${t.lastName ?? ""}`).trim();
  if (!fullName) err("APPLICANT_FULL_NAME", "The applicant's full name is required.");
  if (!t.nationality?.trim()) err("APPLICANT_NATIONALITY", "The applicant's nationality is required.");
  if (!isValidNationality(t.nationality.trim())) {
    err("APPLICANT_NATIONALITY_INVALID", "Choose a nationality from the list.");
  }

  const notes = input.agencyNotes?.trim() ?? "";
  if (notes.length > MAX_NOTES_LENGTH) err("NOTES_TOO_LONG", `Notes are limited to ${MAX_NOTES_LENGTH} characters.`);

  // Documents → attach to ACTIVE requirements by documentTypeId (server-side
  // requirement set is authoritative; an inactive/unknown type is ignored).
  const byType = new Map<string, RequestDocument[]>();
  for (const doc of input.documents) {
    byType.set(doc.documentTypeId, [...(byType.get(doc.documentTypeId) ?? []), doc]);
  }
  for (const req of requirements) {
    const files = byType.get(req.documentTypeId) ?? [];
    if (req.required && files.length === 0) {
      err("REQUIRED_DOCUMENT_MISSING", `Required document missing: ${req.name}.`);
    }
    if (files.length > MAX_FILES_PER_REQUIREMENT) {
      err("FILE_TOO_LARGE", `No more than ${MAX_FILES_PER_REQUIREMENT} files per document type.`);
    }
  }
  const usable: RequestDocument[] = [];
  for (const req of requirements) {
    const files = byType.get(req.documentTypeId) ?? [];
    for (const f of files) {
      const file = f.file;
      if (file.size <= 0 || file.data.length === 0) err("EMPTY_FILE", "The uploaded file is empty.");
      if (file.size > MAX_UPLOAD_BYTES || file.data.length > MAX_UPLOAD_BYTES) {
        err("FILE_TOO_LARGE", "Files must be 2 MB or smaller.");
      }
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        err("UNSUPPORTED_TYPE", "Allowed formats: PDF, JPEG, PNG, WEBP, DOC, DOCX.");
      }
      if (file.name.length > 200 || /[\u0000-\u001f\\/]/.test(file.name)) {
        err("INVALID_FILENAME", "Invalid file name.");
      }
      usable.push(f);
    }
  }
  return usable;
}

/**
 * The atomic gate: validate → write blobs → one transaction. Returns the
 * created (or idempotently reused) application.
 */
export async function submitVisaRequest(input: SubmitVisaRequestInput): Promise<SubmitVisaRequestResult> {
  const agencyId = input.actor.agencyId;
  if (!agencyId) throw new AppError("FORBIDDEN", "Only agency users can submit requests.");

  // Idempotent retry? — return the existing application without charging again.
  const pre = await db
    .select({ id: applications.id, reference: applications.reference })
    .from(applications)
    .where(eq(applications.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (pre[0]) {
    return {
      applicationId: pre[0].id,
      reference: pre[0].reference,
      reused: true,
      charge: { balanceBefore: "0", balanceAfter: "0", transactionId: "" },
    };
  }

  const cfgRows = await db
    .select({
      visaTypeId: visaTypes.id,
      visaTypeName: visaTypes.name,
      visaTypeCode: visaTypes.code,
      categoryName: visaCategories.name,
      countryId: countries.id,
      countryName: countries.name,
      fee: visaTypes.fee,
      currency: visaTypes.currency,
      processingMinDays: visaTypes.processingMinDays,
      processingMaxDays: visaTypes.processingMaxDays,
    })
    .from(visaTypes)
    .innerJoin(countries, eq(visaTypes.countryId, countries.id))
    .innerJoin(visaCategories, eq(visaTypes.categoryId, visaCategories.id))
    .where(and(eq(visaTypes.id, input.visaTypeId), eq(visaTypes.active, true), eq(countries.active, true)))
    .limit(1);
  const cfg = cfgRows[0];

  const requirements = cfg ? await listRequirementsForVisaType(cfg.visaTypeId) : [];

  let priorityOk = true;
  let priorityName = "STANDARD";
  if (!input.priorityCode) {
    const std = await db.select({ id: priorities.id }).from(priorities).where(eq(priorities.code, "STANDARD")).limit(1);
    if (std[0]) priorityName = "STANDARD";
  }
  const priorityRow = await db
    .select({ id: priorities.id, code: priorities.code })
    .from(priorities)
    .where(eq(priorities.code, (input.priorityCode ?? priorityName) || "STANDARD"))
    .limit(1);
  if (!priorityRow[0]) priorityOk = false;

  const docs = validateRequest(input, cfg, requirements, priorityOk);

  // Pre-generate IDs so storage keys can be written before the transaction.
  const applicationId = randomUUID();
  const docRows = docs.map((d) => ({ ...d, id: randomUUID() }));
  const writtenKeys: string[] = [];
  try {
    for (const d of docRows) {
      const key = buildStorageKey(applicationId, d.id);
      await storageProvider().put(key, d.file.data, d.file.type);
      writtenKeys.push(key);
    }
  } catch (e) {
    await Promise.allSettled(writtenKeys.map((k) => storageProvider().delete(k)));
    throw e;
  }

  const submitted = await db
    .select({ id: statuses.id })
    .from(statuses)
    .where(eq(statuses.code, "SUBMITTED"))
    .limit(1);

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local search_path to "${databaseSchema().replaceAll('"', '""')}"`);

    const submittedId = submitted[0]?.id;
    if (!submittedId || !cfg) throw new AppError("CONFIG_ERROR", "Workflow is not configured.");

    // Idempotency, re-checked inside the transaction (covers races between the
    // pre-check above and commit).
    const existing = await client.query<{ id: string; reference: string }>(
      `select id, reference from ${qualifiedTable("applications")} where idempotency_key = $1 limit 1`,
      [input.idempotencyKey],
    );
    if (existing.rows[0]) {
      await client.query("commit");
      await Promise.allSettled(writtenKeys.map((k) => storageProvider().delete(k)));
      return {
        applicationId: existing.rows[0].id,
        reference: existing.rows[0].reference,
        reused: true,
        charge: { balanceBefore: "0", balanceAfter: "0", transactionId: "" },
      };
    }

    // The application row itself (SUBMITTED from birth — no draft stage).
    let reference = generateReference();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await client.query(
          `insert into ${qualifiedTable("applications")}
             (id, reference, agency_id, country_id, visa_type_id, status_id, priority_id,
              visa_type_name, visa_type_code, category_name, country_name,
              fee, currency, processing_min_days, processing_max_days,
              agency_notes, created_by, idempotency_key,
              submitted_at, submitted_price, submitted_currency, effective_price)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::numeric,$13,$14,$15,$16,$17,$18, now(), $12::numeric, $13, $12::numeric)`,
          [
            applicationId, reference, agencyId, cfg.countryId, cfg.visaTypeId, submittedId,
            priorityRow[0]!.id, cfg.visaTypeName, cfg.visaTypeCode, cfg.categoryName, cfg.countryName,
            cfg.fee, cfg.currency, cfg.processingMinDays, cfg.processingMaxDays,
            input.agencyNotes?.trim() || null, input.actor.id, input.idempotencyKey,
          ],
        );
        break;
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message ?? "";
        if (msg.includes("applications_reference") && attempt < 4) {
          reference = generateReference();
          continue;
        }
        if (msg.includes("applications_idempotency_key_uq")) {
          // Concurrent identical submit won: fetch and return it.
          await client.query("rollback");
          const winner = await db
            .select({ id: applications.id, reference: applications.reference })
            .from(applications)
            .where(eq(applications.idempotencyKey, input.idempotencyKey))
            .limit(1);
          await Promise.allSettled(writtenKeys.map((k) => storageProvider().delete(k)));
          if (winner[0]) {
            return {
              applicationId: winner[0].id,
              reference: winner[0].reference,
              reused: true,
              charge: { balanceBefore: "0", balanceAfter: "0", transactionId: "" },
            };
          }
        }
        throw e;
      }
    }

    // Checklist snapshot from the visa configuration.
    for (const req of requirements) {
      await client.query(
        `insert into ${qualifiedTable("checklist_items")}
           (application_id, document_type_id, document_type_name, document_type_code, required, sort_order, notes)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict do nothing`,
        [applicationId, req.documentTypeId, req.name, req.code, req.required, req.sortOrder, req.notes],
      );
    }
    const checklist = await client.query<{ id: string; document_type_id: string }>(
      `select id, document_type_id from ${qualifiedTable("checklist_items")} where application_id = $1`,
      [applicationId],
    );
    const itemByType = new Map(checklist.rows.map((r) => [r.document_type_id, r.id]));

    // The single applicant (full name + nationality code).
    const t = input.travellers[0]!;
    const fullName = (t.fullName ?? `${t.firstName ?? ""} ${t.lastName ?? ""}`).trim();
    await client.query(
      `insert into ${qualifiedTable("applicants")}
         (application_id, first_name, last_name, full_name, date_of_birth, nationality,
          passport_number, passport_issue_date, passport_expiry_date, email, phone)
       values ($1,$2,'',$3,null,$4,null,null,null,null,null)`,
      [applicationId, fullName, fullName, t.nationality.trim().toUpperCase()],
    );

    // Document records (blobs are already in storage).
    for (const d of docRows) {
      await client.query(
        `insert into ${qualifiedTable("documents")}
           (id, application_id, checklist_item_id, document_type_id, original_filename,
            mime_type, size_bytes, storage_key, status, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'UPLOADED',$9)`,
        [
          d.id, applicationId, itemByType.get(d.documentTypeId) ?? null, d.documentTypeId,
          d.file.name.slice(0, 200), d.file.type, d.file.data.length,
          buildStorageKey(applicationId, d.id), input.actor.id,
        ],
      );
    }

    // Wallet debit — the agencies row lock serializes concurrent spenders.
    const upd = await client.query<{ balance_after: string; balance_before: string }>(
      `update ${qualifiedTable("agencies")}
         set balance = balance - $2::numeric, updated_at = now()
       where id = $1 and balance >= $2::numeric
       returning balance::text as balance_after, (balance + $2::numeric)::text as balance_before`,
      [agencyId, cfg.fee],
    );
    if (!upd.rows[0]) {
      throw new AppError("INSUFFICIENT_FUNDS", "Wallet balance is too low for this request.");
    }
    const { balance_before, balance_after } = upd.rows[0];

    const txRes = await client.query<{ id: string }>(
      `insert into ${qualifiedTable("wallet_transactions")}
         (agency_id, application_id, type, amount, currency, balance_before, balance_after, reason, actor_id)
       values ($1,$2,'APPLICATION_CHARGE',$3,$4,$5,$6,$7,$8)
       returning id`,
      [agencyId, applicationId, cfg.fee, cfg.currency, balance_before, balance_after, `Visa application ${reference}`, input.actor.id],
    );

    await client.query(
      `insert into ${qualifiedTable("application_status_history")}
         (application_id, from_status_id, to_status_id, changed_by, reason)
       values ($1, null, $2, $3, 'Request submitted')`,
      [applicationId, submittedId, input.actor.id],
    );

    await client.query(
      `insert into ${qualifiedTable("audit_logs")}
         (actor_id, actor_email, actor_role, agency_id, action, entity, entity_id, metadata, ip_address)
       values ($1,$2,$3,$4,'APPLICATION_SUBMITTED','application',$5,$6,$7)`,
      [
        input.actor.id, input.actor.email, input.actor.role, agencyId, applicationId,
        JSON.stringify({ reference, visaTypeCode: cfg.visaTypeCode, fee: cfg.fee, currency: cfg.currency, source: "three-step-request" }),
        input.ipAddress ?? null,
      ],
    );

    await client.query("commit");

    // Best-effort notifications (outside the transaction — never fail the submit).
    try {
      const { staffUserIds, agencyUserIds, notifyUsers } = await import("@/lib/notifications");
      await notifyUsers(await staffUserIds(), {
        type: "APPLICATION_SUBMITTED",
        title: `Application ${reference} submitted`,
        body: `${cfg.visaTypeName} (${cfg.countryName}) submitted with fee ${cfg.fee} ${cfg.currency}.`,
        link: `/admin/applications/${applicationId}`,
        agencyId,
        applicationId,
      });
      await notifyUsers(await agencyUserIds(agencyId), {
        type: "APPLICATION_SUBMITTED",
        title: `Application ${reference} submitted`,
        body: `Your wallet was charged ${cfg.fee} ${cfg.currency}.`,
        link: `/portal/applications/${applicationId}`,
        agencyId,
        applicationId,
      });
    } catch (e) {
      console.error("request-submit-notification-failed", e);
    }

    return {
      applicationId,
      reference,
      reused: false,
      charge: { balanceBefore: balance_before, balanceAfter: balance_after, transactionId: txRes.rows[0]!.id },
    };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    await Promise.allSettled(writtenKeys.map((k) => storageProvider().delete(k)));
    throw err;
  } finally {
    client.release();
  }
}
