import {groupEnabled,groupWithinBudget,distinctGroupIdentities,sharedDocumentCode} from "@/lib/group-policy";
import {uuid} from "@/lib/traveller-hub-policy";
import {hasPermission} from "@/lib/rbac";
import {linkTravellerInSubmission} from "@/lib/traveller-profile-write";
import {algeriaToday} from "@/lib/travel-deadline";
import {hubEnabled,passportKey,civilDate,validApplicationPassport} from "@/lib/traveller-hub-policy";
import { bookingCatalogueFingerprint } from "@/lib/booking-catalogue-fingerprint";
import { validateDocumentFormat } from "@/lib/upload-validation";
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

import { fileNameProblem, fileNameErrorMessage } from "@/lib/filename";
import { randomUUID } from "node:crypto";
import { and, asc, eq,gt,inArray,sql } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { databaseSchema, qualifiedTable } from "@/lib/database-schema";
import {
  applications,
  countries,
  documentTypes,
  priorities,
  sessions,
  statuses,
  visaCategories,
  visaRequirements,
  visaTypes,
} from "@/db/schema";
import type { AuthUser } from "@/lib/types";
import { AppError, ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, isAgencyRole } from "@/lib/types";
import { buildStorageKey, storageProvider, storageReferenceCommitted } from "@/lib/storage";
import { isValidNationality } from "@/lib/nationalities";
import { currentOperationActor, currentOperationActorPg } from "@/lib/operation-identity";
import { sha256Hex } from "@/lib/file-integrity";

// Only coalesce the same actor's currently running HTTP attempt. PostgreSQL's
// existing idempotency/financial constraints remain authoritative across workers
// and restarts. No pool connection or session-level advisory lock is held while
// waiting for object I/O (including on transaction-pooler deployments).
const pendingHttpSubmissions=new Map<string,Promise<string>>();
export async function coalesceVisaSubmission(actor:AuthUser,attempt:string,submit:()=>Promise<string>):Promise<string>{
  if(!Number.isSafeInteger(actor.credentialVersion)||(actor.credentialVersion??-1)<0||!actor.sessionId)throw new AppError('UNAUTHENTICATED','Please sign in to continue.');
  if(!actor.agencyId||!isAgencyRole(actor.role)||actor.mustChangePassword)throw new AppError('FORBIDDEN','Agency access required.');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(attempt))throw new AppError('VALIDATION','Invalid submission attempt.');
  const key=JSON.stringify([actor.agencyId,actor.id,actor.credentialVersion??null,attempt]);
  let pending=pendingHttpSubmissions.get(key);
  if(!pending){
    if(pendingHttpSubmissions.size>=1000)throw new AppError('SERVICE_UNAVAILABLE','Please retry this submission later.');
    pending=Promise.resolve().then(submit);pendingHttpSubmissions.set(key,pending);
  }
  try{
    const result=await pending;
    // A suspended/revoked waiter does not inherit another request's result.
    await db.transaction(async tx=>{
      await currentOperationActor(tx,actor);
      const [session]=await tx.select({id:sessions.id}).from(sessions).where(and(eq(sessions.id,actor.sessionId!),eq(sessions.userId,actor.id),eq(sessions.credentialVersion,actor.credentialVersion!),gt(sessions.expiresAt,new Date()),sql`${sessions.lastActivityAt}>now()-interval '2 hours'`)).limit(1).for('share');
      if(!session)throw new AppError('UNAUTHENTICATED','Please sign in to continue.');
    });
    return result;
  }finally{if(pendingHttpSubmissions.get(key)===pending)pendingHttpSubmissions.delete(key);}
}

/**
 * Phase 2-Final: exactly ONE applicant per request — the portal collects
 * only Full Name + Nationality (stable ISO code, correction 6). The
 * passport/DOB/contact fields are optional for legacy compatibility but
 * the simplified flow never sends them.
 */
export interface RequestTraveller {
  travellerProfileId?:string;
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
  /** Client-confirmed price; absent for legacy callers. */
  expectedFee?: string;
  expectedCatalogue?: string;
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
  nameFr?: string | null;
  nameAr?: string | null;
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
      nameFr: documentTypes.nameFr, nameAr: documentTypes.nameAr,
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

export async function listRequirementsForVisaTypes(visaTypeIds: readonly string[]): Promise<Record<string, RequirementRow[]>> {
  const ids=[...new Set(visaTypeIds)];
  const result:Record<string,RequirementRow[]>=Object.fromEntries(ids.map(id=>[id,[]]));
  if(!ids.length)return result;
  const rows=await db
    .select({
      visaTypeId: visaRequirements.visaTypeId,
      documentTypeId: documentTypes.id,
      name: documentTypes.name,
      nameFr: documentTypes.nameFr, nameAr: documentTypes.nameAr,
      code: documentTypes.code,
      required: visaRequirements.required,
      sortOrder: visaRequirements.sortOrder,
      notes: visaRequirements.notes,
    })
    .from(visaRequirements)
    .innerJoin(documentTypes, eq(visaRequirements.documentTypeId, documentTypes.id))
    .where(
      and(
        inArray(visaRequirements.visaTypeId, ids),
        eq(visaRequirements.active, true),
        eq(documentTypes.active, true),
      ),
    )
    .orderBy(asc(visaRequirements.visaTypeId),asc(visaRequirements.sortOrder));
  for(const {visaTypeId,...row} of rows)result[visaTypeId]!.push(row);
  return result;
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
  if (!cfg) {
    err(
      "VISA_TYPE_INVALID",
      "This visa programme is not bookable. It is inactive, its destination is inactive, or its price is not configured in DZD.",
    );
  }
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
      const nameProblem = fileNameProblem(file.name);
      if (nameProblem) err("INVALID_FILENAME", fileNameErrorMessage(nameProblem));
      validateDocumentFormat(file);
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
  if (!agencyId || !isAgencyRole(input.actor.role) || input.actor.mustChangePassword) throw new AppError("FORBIDDEN", "Only agency users can submit requests.");

  // Idempotent retry? — return the existing application without charging again.
  const pre = await db.transaction(async tx => {
    await currentOperationActor(tx, input.actor);
    return tx
      .select({ id: applications.id, reference: applications.reference })
      .from(applications)
      .where(and(eq(applications.idempotencyKey, input.idempotencyKey), eq(applications.agencyId, agencyId)))
      .limit(1);
  });
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
    .where(
      and(
        eq(visaTypes.id, input.visaTypeId),
        eq(visaTypes.active, true),
        eq(countries.active, true),
        eq(visaCategories.active, true),
        // Operations are DZD-only (§7). A programme priced in another currency
        // is not bookable until staff re-price it in DZD — no silent conversion.
        eq(visaTypes.currency, "DZD"),
      ),
    )
    .limit(1);
  const cfg = cfgRows[0];
  if (cfg && input.expectedFee !== undefined && (!Number.isFinite(Number(input.expectedFee)) || Number(input.expectedFee) !== Number(cfg.fee))) {
    throw new AppError("VISA_TYPE_INVALID", "The displayed price has changed. Reopen the request preview before confirming.");
  }

  const requirements = cfg ? await listRequirementsForVisaType(cfg.visaTypeId) : [];
  if(input.expectedCatalogue!==undefined&&(!cfg||bookingCatalogueFingerprint({fee:cfg.fee,minDays:cfg.processingMinDays,maxDays:cfg.processingMaxDays},requirements)!==input.expectedCatalogue))throw new AppError("VISA_TYPE_INVALID","The catalogue changed. Review the programme again before confirming.");

  const priorityRow = await db
    .select({ id: priorities.id, code: priorities.code })
    .from(priorities)
    .where(and(eq(priorities.code, "STANDARD"), eq(priorities.active, true)))
    .limit(1);
  const priorityOk = (!input.priorityCode || input.priorityCode === "STANDARD") && !!priorityRow[0];

  const docs = validateRequest(input, cfg, requirements, priorityOk);

  // Pre-generate IDs so storage keys can be written before the transaction.
  const applicationId = randomUUID();
  const docRows = docs.map((d) => ({ ...d, id: randomUUID(), sha256: sha256Hex(d.file.data) }));
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

  const commitRequest = async (): Promise<SubmitVisaRequestResult> => {
    const submitted = await db
      .select({ id: statuses.id })
      .from(statuses)
      .where(eq(statuses.code, "SUBMITTED"))
      .limit(1);

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(`set local search_path to "${databaseSchema().replaceAll('"', '""')}"`);
      const actor = await currentOperationActorPg(client, input.actor);

      const submittedId = submitted[0]?.id;
      if (!submittedId || !cfg) throw new AppError("CONFIG_ERROR", "Workflow is not configured.");
      const agency = await client.query<{ status: string }>(`select status from ${qualifiedTable("agencies")} where id=$1 for update`, [agencyId]);
      if (agency.rows[0]?.status !== "ACTIVE") throw new AppError("FORBIDDEN", "This agency is not active.");
      const currentPriority = await client.query<{ id: string }>(`select id from ${qualifiedTable("priorities")} where id=$1 and code='STANDARD' and active for share`, [priorityRow[0]!.id]);
      if (!currentPriority.rows[0]) throw new AppError("PRIORITY_INVALID", "Priority is not available.");

      // Idempotency, re-checked inside the transaction (covers races between the
      // pre-check above and commit).
      const existing = await client.query<{ id: string; reference: string }>(
        `select id, reference from ${qualifiedTable("applications")} where idempotency_key = $1 and agency_id = $2 limit 1`,
        [input.idempotencyKey, agencyId],
      );
      if (existing.rows[0]) {
        await client.query("commit");
        return {
          applicationId: existing.rows[0].id,
          reference: existing.rows[0].reference,
          reused: true,
          charge: { balanceBefore: "0", balanceAfter: "0", transactionId: "" },
        };
      }

      // Storage can take time. Lock and re-read the programme and its checklist
      // before making business rows or a charge; a changed preview must be reopened.
      const current = await client.query<VisaConfigRow>(
        `select visa.id as "visaTypeId", visa.name as "visaTypeName", visa.code as "visaTypeCode",
                category.name as "categoryName", country.id as "countryId", country.name as "countryName",
                visa.fee::text as fee, visa.currency, visa.processing_min_days as "processingMinDays", visa.processing_max_days as "processingMaxDays"
           from ${qualifiedTable("visa_types")} visa
           join ${qualifiedTable("countries")} country on country.id=visa.country_id
           join ${qualifiedTable("visa_categories")} category on category.id=visa.category_id
          where visa.id=$1 and visa.active and country.active and category.active and visa.currency='DZD'
          for share of visa, country, category`, [cfg.visaTypeId],
      );
      const latest = current.rows[0];
      if (!latest || (Object.keys(cfg) as (keyof VisaConfigRow)[]).some((key) => latest[key] !== cfg[key])) {
        throw new AppError("VISA_TYPE_INVALID", "This programme changed while preparing your request. Reopen the request preview before confirming.");
      }
      const currentRequirements = await client.query<RequirementRow>(
        `select type.id as "documentTypeId", type.name, type.name_fr as "nameFr", type.name_ar as "nameAr", type.code,
                requirement.required, requirement.sort_order as "sortOrder", requirement.notes
           from ${qualifiedTable("visa_requirements")} requirement
           join ${qualifiedTable("document_types")} type on type.id=requirement.document_type_id
          where requirement.visa_type_id=$1 and requirement.active and type.active
          order by requirement.sort_order, requirement.id for share of requirement, type`, [cfg.visaTypeId],
      );
      const requirementSnapshot = (rows: RequirementRow[]) => JSON.stringify(rows.map((row) => [row.documentTypeId, row.name, row.nameFr ?? null, row.nameAr ?? null, row.code, row.required, row.sortOrder, row.notes]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
      if (requirementSnapshot(requirements) !== requirementSnapshot(currentRequirements.rows)) {
        throw new AppError("VISA_TYPE_INVALID", "The document checklist changed. Reopen the request preview before confirming.");
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
              cfg.fee, "DZD", cfg.processingMinDays, cfg.processingMaxDays,
              input.agencyNotes?.trim() || null, actor.id, input.idempotencyKey,
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
            const winner = await client.query<{ id: string; reference: string }>(
              `select id, reference from ${qualifiedTable("applications")} where idempotency_key=$1 and agency_id=$2 limit 1`,
              [input.idempotencyKey, agencyId],
            );
            if (winner.rows[0]) {
              return {
                applicationId: winner.rows[0].id,
                reference: winner.rows[0].reference,
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
      if(hubEnabled()&&!validApplicationPassport(t.passportNumber,t.passportExpiryDate,algeriaToday()))throw new AppError("PASSPORT_VALIDITY","At least seven months of passport validity are required.");
      const insertedApplicant=await client.query<{id:string}>(
        `insert into ${qualifiedTable("applicants")}
           (application_id, first_name, last_name, full_name, date_of_birth, nationality,
            passport_number, passport_issue_date, passport_expiry_date, email, phone)
         values ($1,$2,'',$3,null,$4,$5,null,$6::date,null,null) returning id`,
        [applicationId, fullName, fullName, t.nationality.trim().toUpperCase(),hubEnabled()?passportKey(t.passportNumber)||null:null,hubEnabled()?civilDate(t.passportExpiryDate):null],
      );

      if(hubEnabled())await linkTravellerInSubmission(client,actor,insertedApplicant.rows[0]!.id,{name:fullName,nationality:t.nationality,passport:t.passportNumber??"",expiry:t.passportExpiryDate??""},t.travellerProfileId);
      // Document records (blobs are already in storage).
      for (const d of docRows) {
        await client.query(
          `insert into ${qualifiedTable("documents")}
             (id, application_id, checklist_item_id, document_type_id, original_filename,
              mime_type, size_bytes, sha256, storage_key, status, uploaded_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'UPLOADED',$10)`,
          [
            d.id, applicationId, itemByType.get(d.documentTypeId) ?? null, d.documentTypeId,
            d.file.name.slice(0, 200), d.file.type, d.file.data.length, d.sha256,
            buildStorageKey(applicationId, d.id), actor.id,
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
        [agencyId, applicationId, cfg.fee, "DZD", balance_before, balance_after, `Visa application ${reference}`, actor.id],
      );

      await client.query(
        `insert into ${qualifiedTable("application_status_history")}
           (application_id, from_status_id, to_status_id, changed_by, reason)
         values ($1, null, $2, $3, 'Request submitted')`,
        [applicationId, submittedId, actor.id],
      );

      await client.query(
        `insert into ${qualifiedTable("audit_logs")}
           (actor_id, actor_email, actor_role, agency_id, action, entity, entity_id, metadata, ip_address)
         values ($1,$2,$3,$4,'APPLICATION_SUBMITTED','application',$5,$6,$7)`,
        [
          actor.id, actor.email, actor.role, agencyId, applicationId,
          JSON.stringify({ reference, visaTypeCode: cfg.visaTypeCode, fee: cfg.fee, currency: "DZD", source: "three-step-request",
            actorName: actor.name, actorUsername: actor.username }),
          input.ipAddress ?? null,
        ],
      );

      await storageReferenceCommitted(client, writtenKeys);
      await client.query("commit");
      return {
        applicationId,
        reference,
        reused: false,
        charge: { balanceBefore: balance_before, balanceAfter: balance_after, transactionId: txRes.rows[0]!.id },
      };
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };

  let result: SubmitVisaRequestResult;
  try {
    result = await commitRequest();
  } catch (error) {
    await Promise.allSettled(writtenKeys.map((key) => storageProvider().delete(key)));
    throw error;
  }
  if (result.reused) {
    await Promise.allSettled(writtenKeys.map((key) => storageProvider().delete(key)));
    return result;
  }

  // Best-effort notifications use the shared pool after the client is released.
  try {
    const { staffUserIds, agencyUserIds, notifyUsers } = await import("@/lib/notifications");
    await notifyUsers(await staffUserIds(), {
      type: "APPLICATION_SUBMITTED",
      title: `Application ${result.reference} submitted`,
      body: `${cfg!.visaTypeName} (${cfg!.countryName}) submitted with fee ${cfg!.fee} DZD.`,
      link: `/admin/applications/${result.applicationId}`,
      agencyId,
      applicationId: result.applicationId,
    });
    await notifyUsers(await agencyUserIds(agencyId), {
      type: "APPLICATION_SUBMITTED",
      title: `Application ${result.reference} submitted`,
      body: `Your wallet was charged ${cfg!.fee} DZD.`,
      link: `/portal/applications/${result.applicationId}`,
      agencyId,
      applicationId: result.applicationId,
    });
  } catch (error) {
    console.error("request-submit-notification-failed", error);
  }
  return result;
}

/** Group commit shares the existing single-case validation, checklist and ledger model.
 * No group row, application or charge becomes visible until every member succeeds. */
export async function submitVisaGroup(actorInput:AuthUser,groupId:string,manifest:string,inputs:SubmitVisaRequestInput[]):Promise<SubmitVisaRequestResult[]> {
 const agencyId=actorInput.agencyId;
 if(!groupEnabled()||databaseSchema()!=="visa_os_preview"||!agencyId||!isAgencyRole(actorInput.role)||!hasPermission(actorInput,"applications.create")||!hasPermission(actorInput,"documents.upload.own")||actorInput.mustChangePassword)throw new AppError("FORBIDDEN","Group unavailable");
 const input=inputs[0];if(!input||!uuid(groupId)||!/^[a-f0-9]{64}$/.test(manifest)||!groupWithinBudget(inputs.length,inputs.reduce((n,x)=>n+x.documents.length,0),inputs.reduce((n,x)=>n+x.documents.reduce((a,d)=>a+d.file.data.length,0),0))||!distinctGroupIdentities(inputs.map(x=>x.travellers[0]??{passportNumber:null}))||new Set(inputs.map(x=>x.idempotencyKey)).size!==inputs.length||inputs.some(x=>x.travellers.length!==1||x.visaTypeId!==input.visaTypeId||x.countryId!==input.countryId||x.expectedFee!==input.expectedFee||x.expectedCatalogue!==input.expectedCatalogue||!uuid(x.idempotencyKey)||!validApplicationPassport(x.travellers[0]!.passportNumber,x.travellers[0]!.passportExpiryDate,algeriaToday())))throw new AppError("VALIDATION","Invalid group");
 await db.transaction(async tx=>{await currentOperationActor(tx,actorInput)});
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
    .where(
      and(
        eq(visaTypes.id, input.visaTypeId),
        eq(visaTypes.active, true),
        eq(countries.active, true),
        eq(visaCategories.active, true),
        // Operations are DZD-only (§7). A programme priced in another currency
        // is not bookable until staff re-price it in DZD — no silent conversion.
        eq(visaTypes.currency, "DZD"),
      ),
    )
    .limit(1);
  const cfg = cfgRows[0];
  if (cfg && input.expectedFee !== undefined && (!Number.isFinite(Number(input.expectedFee)) || Number(input.expectedFee) !== Number(cfg.fee))) {
    throw new AppError("VISA_TYPE_INVALID", "The displayed price has changed. Reopen the request preview before confirming.");
  }

  const requirements = cfg ? await listRequirementsForVisaType(cfg.visaTypeId) : [];
  if(input.expectedCatalogue!==undefined&&(!cfg||bookingCatalogueFingerprint({fee:cfg.fee,minDays:cfg.processingMinDays,maxDays:cfg.processingMaxDays},requirements)!==input.expectedCatalogue))throw new AppError("VISA_TYPE_INVALID","The catalogue changed. Review the programme again before confirming.");

  const priorityRow = await db
    .select({ id: priorities.id, code: priorities.code })
    .from(priorities)
    .where(and(eq(priorities.code, "STANDARD"), eq(priorities.active, true)))
    .limit(1);
  const priorityOk = (!input.priorityCode || input.priorityCode === "STANDARD") && !!priorityRow[0];


 const prepared=inputs.map(x=>({input:x,applicationId:randomUUID(),docRows:validateRequest(x,cfg,requirements,priorityOk).map(d=>({...d,id:randomUUID(),sha256:sha256Hex(d.file.data)}))}));
 const hashes=new Map<string,number>();const kinds=new Map(requirements.map(r=>[r.documentTypeId,r.code]));
 for(let i=0;i<prepared.length;i++)for(const d of prepared[i]!.docRows){if(!sharedDocumentCode(kinds.get(d.documentTypeId)??"")){const old=hashes.get(d.sha256);if(old!==undefined&&old!==i)throw new AppError("VALIDATION","Personal document repeated across travellers");hashes.set(d.sha256,i);}}
 // Also reject a personal file reused in another traveller's shared slot.
 for(let i=0;i<prepared.length;i++)for(const d of prepared[i]!.docRows){const old=hashes.get(d.sha256);if(old!==undefined&&old!==i)throw new AppError("VALIDATION","Personal document repeated across travellers");}
 const writtenKeys:string[]=[];let committed=false,uncertain=false;
 try{
 for(const m of prepared)for(const d of m.docRows){const key=buildStorageKey(m.applicationId,d.id);await storageProvider().put(key,d.file.data,d.file.type);writtenKeys.push(key);}
 const submitted=await db.select({id:statuses.id}).from(statuses).where(eq(statuses.code,"SUBMITTED")).limit(1);
 const client=await pool.connect();let results:SubmitVisaRequestResult[]=[];
 try{
 await client.query("begin");await client.query(`set local search_path to "${databaseSchema().replaceAll('"','""')}"`);
 const actor=await currentOperationActorPg(client,actorInput);
 if(actor.agencyId!==agencyId||!hasPermission(actor,"applications.create")||!hasPermission(actor,"documents.upload.own"))throw new AppError("FORBIDDEN","Group unavailable");
 const submittedId=submitted[0]?.id;if(!submittedId||!cfg)throw new AppError("CONFIG_ERROR","Workflow unavailable");
 const agency=await client.query<{status:string}>(`select status from ${qualifiedTable("agencies")} where id=$1 for update`,[agencyId]);
 if(agency.rows[0]?.status!=="ACTIVE")throw new AppError("FORBIDDEN","Agency unavailable");
 const existing=await client.query<{manifest:string}>(`select manifest from ${qualifiedTable("visa_request_groups")} where agency_id=$1 and id=$2`,[agencyId,groupId]);
 if(existing.rows[0]){if(existing.rows[0].manifest!==manifest)throw new AppError("VALIDATION","Group attempt already used");const old=await client.query<{id:string;reference:string}>(`select a.id,a.reference from ${qualifiedTable("visa_request_group_members")} m join ${qualifiedTable("applications")} a on a.id=m.application_id and a.agency_id=m.agency_id where m.agency_id=$1 and m.group_id=$2 order by m.position`,[agencyId,groupId]);if(old.rows.length!==inputs.length)throw new AppError("INTERNAL","Group receipt incomplete");await client.query("rollback");return old.rows.map(r=>({applicationId:r.id,reference:r.reference,reused:true,charge:{balanceBefore:"0",balanceAfter:"0",transactionId:""}}));}
 const enough=await client.query<{ok:boolean}>(`select balance >= $2::numeric*$3::int as ok from ${qualifiedTable("agencies")} where id=$1`,[agencyId,cfg.fee,inputs.length]);if(!enough.rows[0]?.ok)throw new AppError("INSUFFICIENT_FUNDS","Insufficient group balance");
 const currentPriority=await client.query<{id:string}>(`select id from ${qualifiedTable("priorities")} where id=$1 and code='STANDARD' and active for share`,[priorityRow[0]!.id]);if(!currentPriority.rows[0])throw new AppError("PRIORITY_INVALID","Priority unavailable");
      const current = await client.query<VisaConfigRow>(
        `select visa.id as "visaTypeId", visa.name as "visaTypeName", visa.code as "visaTypeCode",
                category.name as "categoryName", country.id as "countryId", country.name as "countryName",
                visa.fee::text as fee, visa.currency, visa.processing_min_days as "processingMinDays", visa.processing_max_days as "processingMaxDays"
           from ${qualifiedTable("visa_types")} visa
           join ${qualifiedTable("countries")} country on country.id=visa.country_id
           join ${qualifiedTable("visa_categories")} category on category.id=visa.category_id
          where visa.id=$1 and visa.active and country.active and category.active and visa.currency='DZD'
          for share of visa, country, category`, [cfg.visaTypeId],
      );
      const latest = current.rows[0];
      if (!latest || (Object.keys(cfg) as (keyof VisaConfigRow)[]).some((key) => latest[key] !== cfg[key])) {
        throw new AppError("VISA_TYPE_INVALID", "This programme changed while preparing your request. Reopen the request preview before confirming.");
      }
      const currentRequirements = await client.query<RequirementRow>(
        `select type.id as "documentTypeId", type.name, type.name_fr as "nameFr", type.name_ar as "nameAr", type.code,
                requirement.required, requirement.sort_order as "sortOrder", requirement.notes
           from ${qualifiedTable("visa_requirements")} requirement
           join ${qualifiedTable("document_types")} type on type.id=requirement.document_type_id
          where requirement.visa_type_id=$1 and requirement.active and type.active
          order by requirement.sort_order, requirement.id for share of requirement, type`, [cfg.visaTypeId],
      );
      const requirementSnapshot = (rows: RequirementRow[]) => JSON.stringify(rows.map((row) => [row.documentTypeId, row.name, row.nameFr ?? null, row.nameAr ?? null, row.code, row.required, row.sortOrder, row.notes]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
      if (requirementSnapshot(requirements) !== requirementSnapshot(currentRequirements.rows)) {
        throw new AppError("VISA_TYPE_INVALID", "The document checklist changed. Reopen the request preview before confirming.");
      }


 await client.query(`insert into ${qualifiedTable("visa_request_groups")}(id,agency_id,created_by,manifest,member_count) values($1,$2,$3,$4,$5)`,[groupId,agencyId,actor.id,manifest,prepared.length]);
 for(const [position,m] of prepared.entries()){
 const {input,applicationId,docRows}=m;
 let reference=generateReference(),inserted=false;
 for(let attempt=0;attempt<5;attempt++){
          const insertedRow=await client.query(
            `insert into ${qualifiedTable("applications")}
               (id, reference, agency_id, country_id, visa_type_id, status_id, priority_id,
                visa_type_name, visa_type_code, category_name, country_name,
                fee, currency, processing_min_days, processing_max_days,
                agency_notes, created_by, idempotency_key,
                submitted_at, submitted_price, submitted_currency, effective_price)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::numeric,$13,$14,$15,$16,$17,$18, now(), $12::numeric, $13, $12::numeric) on conflict (reference) do nothing returning id`,
            [
              applicationId, reference, agencyId, cfg.countryId, cfg.visaTypeId, submittedId,
              priorityRow[0]!.id, cfg.visaTypeName, cfg.visaTypeCode, cfg.categoryName, cfg.countryName,
              cfg.fee, "DZD", cfg.processingMinDays, cfg.processingMaxDays,
              input.agencyNotes?.trim() || null, actor.id, input.idempotencyKey,
            ],
          );

 if(insertedRow.rowCount===1){inserted=true;break}reference=generateReference();
 }
 if(!inserted)throw new AppError("INTERNAL","Reference unavailable");
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
      if(hubEnabled()&&!validApplicationPassport(t.passportNumber,t.passportExpiryDate,algeriaToday()))throw new AppError("PASSPORT_VALIDITY","At least seven months of passport validity are required.");
      const insertedApplicant=await client.query<{id:string}>(
        `insert into ${qualifiedTable("applicants")}
           (application_id, first_name, last_name, full_name, date_of_birth, nationality,
            passport_number, passport_issue_date, passport_expiry_date, email, phone)
         values ($1,$2,'',$3,null,$4,$5,null,$6::date,null,null) returning id`,
        [applicationId, fullName, fullName, t.nationality.trim().toUpperCase(),hubEnabled()?passportKey(t.passportNumber)||null:null,hubEnabled()?civilDate(t.passportExpiryDate):null],
      );

      if(hubEnabled())await linkTravellerInSubmission(client,actor,insertedApplicant.rows[0]!.id,{name:fullName,nationality:t.nationality,passport:t.passportNumber??"",expiry:t.passportExpiryDate??""},t.travellerProfileId);
      // Document records (blobs are already in storage).
      for (const d of docRows) {
        await client.query(
          `insert into ${qualifiedTable("documents")}
             (id, application_id, checklist_item_id, document_type_id, original_filename,
              mime_type, size_bytes, sha256, storage_key, status, uploaded_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'UPLOADED',$10)`,
          [
            d.id, applicationId, itemByType.get(d.documentTypeId) ?? null, d.documentTypeId,
            d.file.name.slice(0, 200), d.file.type, d.file.data.length, d.sha256,
            buildStorageKey(applicationId, d.id), actor.id,
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
        [agencyId, applicationId, cfg.fee, "DZD", balance_before, balance_after, `Visa application ${reference}`, actor.id],
      );

      await client.query(
        `insert into ${qualifiedTable("application_status_history")}
           (application_id, from_status_id, to_status_id, changed_by, reason)
         values ($1, null, $2, $3, 'Request submitted')`,
        [applicationId, submittedId, actor.id],
      );

      await client.query(
        `insert into ${qualifiedTable("audit_logs")}
           (actor_id, actor_email, actor_role, agency_id, action, entity, entity_id, metadata, ip_address)
         values ($1,$2,$3,$4,'APPLICATION_SUBMITTED','application',$5,$6,$7)`,
        [
          actor.id, actor.email, actor.role, agencyId, applicationId,
          JSON.stringify({ reference, visaTypeCode: cfg.visaTypeCode, fee: cfg.fee, currency: "DZD", source: "three-step-request",
            actorName: actor.name, actorUsername: actor.username }),
          input.ipAddress ?? null,
        ],
      );


 await client.query(`insert into ${qualifiedTable("visa_request_group_members")}(agency_id,group_id,application_id,position) values($1,$2,$3,$4)`,[agencyId,groupId,applicationId,position+1]);
 results.push({applicationId,reference,reused:false,charge:{balanceBefore:balance_before,balanceAfter:balance_after,transactionId:txRes.rows[0]!.id}});
 }
 await storageReferenceCommitted(client,writtenKeys);
 uncertain=true;await client.query("commit");committed=true;uncertain=false;
 }catch(e){await client.query("rollback").catch(()=>{});throw e}finally{client.release()}
 try{const {staffUserIds,agencyUserIds,notifyUsers}=await import("@/lib/notifications");const [staff,agencyUsers]=await Promise.all([staffUserIds(),agencyUserIds(agencyId)]);for(const r of results){await notifyUsers(staff,{type:"APPLICATION_SUBMITTED",title:`Application ${r.reference} submitted`,body:`${cfg!.visaTypeName} (${cfg!.countryName})`,link:`/admin/applications/${r.applicationId}`,agencyId,applicationId:r.applicationId});await notifyUsers(agencyUsers,{type:"APPLICATION_SUBMITTED",title:`Application ${r.reference} submitted`,body:`Your wallet was charged ${cfg!.fee} DZD.`,link:`/portal/applications/${r.applicationId}`,agencyId,applicationId:r.applicationId});}}catch(e){console.error("group-notification-failed",e)}
 return results;
 }finally{if(!committed&&!uncertain)await Promise.allSettled(writtenKeys.map(k=>storageProvider().delete(k)))}
}
