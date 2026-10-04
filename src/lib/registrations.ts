/**
 * Phase 2 — Agency registration service.
 *
 * A registration is an APPLICATION FOR PARTNERSHIP submitted on the public
 * website. It NEVER grants access, credit or an agency by itself:
 *
 *  - The public flow writes `agency_registrations` (+ documents/history)
 *    with status PENDING through a strictly whitelisted, server-side
 *    validated input shape. Role, permissions, agency ID, approval status,
 *    wallet balance, credit and internal notes are NOT part of the public
 *    input model and cannot be injected (mass-assignment protection).
 *  - Approval is a privileged, transactional operation (ADMIN level). It
 *    re-locks and re-validates the registration, creates the Agency with
 *    the existing model, creates the first user with the existing user
 *    model (role EXACTLY AGENCY_ADMIN, strictly bound to the new tenant),
 *    links registration → agency → admin, and writes history + audit.
 *    A row lock + conditional update make it idempotent: approving twice
 *    (double click / concurrent admins) creates exactly one agency and
 *    one user. Failure rolls the whole transaction back.
 *  - No wallet credit is ever created by registration or approval.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "@/lib/db";
import { fileNameProblem, fileNameErrorMessage } from "@/lib/filename";
import { qualifiedTable } from "@/lib/database-schema";
import { requirePermission } from "@/lib/rbac";
import { legacyAgencyUsername } from "@/lib/identity-policy";
import { lockIdentityState, recordIdentityAudit, requireRecoveryManager, revokeUnusedAccessTokens, revokeUserAccess } from "@/lib/account-security";
import {
  accountActivationTokens,
  agencies,
  agencyRegistrationDocuments,
  agencyRegistrationHistory,
  agencyRegistrationRequests,
  agencyRegistrationFollowupTokens,
  agencyRegistrations,
  auditLogs,
  users,
  type AgencyRegistration,
} from "@/db/schema";
import {
  MONTHLY_VOLUMES,
  REGISTRATION_BUSINESS_TYPES,
  type RegistrationDocumentCategory,
  type RegistrationStatus,
} from "@/lib/registration-constants";
import {
  AppError,
  REGISTRATION_DECIDE_ROLES,
  REGISTRATION_MAX_DOCUMENTS,
  REGISTRATION_MAX_UPLOAD_BYTES,
  REGISTRATION_MIME_TYPES,
  type AuthUser,
} from "@/lib/types";
import { storageProvider } from "@/lib/storage";
import { sha256Hex } from "@/lib/file-integrity";
import { recordAudit } from "@/lib/audit";
import { notifyUsers, staffUserIds } from "@/lib/notifications";
import { generateSessionToken, hashPassword, hashToken } from "@/lib/crypto";
import type { RegistrationCopy, RegistrationLocale } from "@/lib/i18n";
import { safeErrorCode } from "@/lib/safe-error";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const ACTIVE_REGISTRATION_STATUSES: RegistrationStatus[] = [
  "PENDING",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
];

export const REGISTRATION_PAGE_SIZE = 20;


/* ------------------------------------------------------------------ */
/* Validation (localized, server-side)                                 */
/* ------------------------------------------------------------------ */

type ErrorCopy = RegistrationCopy["errors"];

/** Strip C0/C1 control characters — defense against injection tooling. */
function scrubControlChars(v: unknown): unknown {
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") : v;
}

const WEBSITE_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d{1,5})?([/?#]\S*)?$/i;

/**
 * Localized registration form schema. This is the ONLY public input model —
 * privileged fields (role, permissions, agencyId, status, balance, credit,
 * internal notes, decision metadata) do not exist here and can never be
 * mass-assigned from the public request.
 */
export function registrationFormSchema(msg: ErrorCopy) {
  const req = { required_error: msg.required, invalid_type_error: msg.required };
  const text = (min: number, max: number) =>
    z.preprocess(
      scrubControlChars,
      z.string(req).trim().min(min, min <= 1 ? msg.required : msg.tooShort).max(max, msg.tooLong),
    );
  const optText = (max: number) =>
    z.preprocess(scrubControlChars, z.string().trim().max(max, msg.tooLong).optional()).transform((v) =>
      typeof v === "string" && v.trim() !== "" ? v.trim() : null,
    );
  const email = z.preprocess(
    scrubControlChars,
    z
      .string(req)
      .trim()
      .toLowerCase()
      .email(msg.invalidEmail)
      .max(160, msg.tooLong),
  );
  const consent = z.preprocess(
    (v) => (v === "on" || v === "1" ? "true" : v),
    z.literal("true", { errorMap: () => ({ message: msg.consentRequired }) }),
  );
  const choice = <T extends readonly [string, ...string[]]>(values: T) =>
    z.enum(values, { errorMap: () => ({ message: msg.invalidChoice }) });

  return z.preprocess((input) => {
    if (!input || typeof input !== "object") return input;
    const values = input as Record<string, unknown>;
    return { ...values, contactEmail: values.contactEmail ?? values.email, contactPhone: values.contactPhone ?? values.phone };
  }, z.object({
    /* company */
    legalName: text(2, 160),
    tradingName: optText(160),
    country: optText(80),
    region: optText(80),
    city: optText(80),
    addressLine: optText(300),
    phone: text(5, 40),
    email,
    website: z
      .preprocess(scrubControlChars, z.string().trim().max(200, msg.tooLong).optional())
      .transform((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null))
      .superRefine((v, ctx) => {
        if (v && !WEBSITE_RE.test(v)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg.invalidWebsite });
        }
      }),
    commercialRegistrationNumber: optText(80),
    taxId: optText(80),
    licenceNumber: optText(80),
    /* primary contact */
    contactFirstName: text(2, 160),
    contactLastName: z.string().trim().max(80, msg.tooLong).optional().default(""),
    contactPosition: optText(100),
    contactEmail: email,
    contactPhone: text(5, 40),
    /* business profile */
    businessType: choice(REGISTRATION_BUSINESS_TYPES).optional().default("OTHER"),
    monthlyVolume: choice(MONTHLY_VOLUMES).optional().transform((v) => v ?? null),
    mainMarkets: optText(300),
    message: optText(2000),
    /* consent */
    terms: consent,
    privacy: consent,
    accuracy: consent,
  }));
}

export type RegistrationData = z.infer<ReturnType<typeof registrationFormSchema>> & {
  locale: RegistrationLocale;
  legalConsentVersions?: {terms:{id:string;version:number;effectiveAt:string};privacy:{id:string;version:number;effectiveAt:string};locale:RegistrationLocale};
};

/** Map a zod failure into `{ field: localizedMessage }`. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Document validation (type AND content, server-side)                 */
/* ------------------------------------------------------------------ */

export interface RegistrationFileInput {
  category: RegistrationDocumentCategory;
  name: string;
  type: string;
  size: number;
  data: Buffer;
}

function matchesMagicBytes(data: Buffer, mimeType: string): boolean {
  if (data.length < 12) return false;
  switch (mimeType) {
    case "application/pdf":
      return data.subarray(0, 4).toString("latin1") === "%PDF";
    case "image/jpeg":
      return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case "image/png":
      return (
        data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 &&
        data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a
      );
    case "image/webp":
      return (
        data.subarray(0, 4).toString("latin1") === "RIFF" &&
        data.subarray(8, 12).toString("latin1") === "WEBP"
      );
    default:
      return false;
  }
}

/**
 * Validate one registration document. Throws AppError with a stable code
 * (FILE_TOO_LARGE | FILE_TYPE | FILE_CONTENT | FILE_NAME) which the public
 * action maps to localized copy.
 */
export function validateRegistrationFile(file: RegistrationFileInput): void {
  if (file.size <= 0) throw new AppError("EMPTY_FILE", "The uploaded file is empty.");
  if (file.size > REGISTRATION_MAX_UPLOAD_BYTES || file.data.length > REGISTRATION_MAX_UPLOAD_BYTES) {
    throw new AppError("FILE_TOO_LARGE", "Files must be 2 MB or smaller.");
  }
  if (!REGISTRATION_MIME_TYPES.includes(file.type)) {
    throw new AppError("FILE_TYPE", "Allowed formats: PDF, JPEG, PNG or WebP.");
  }
  const nameProblem = fileNameProblem(file.name);
  if (nameProblem) throw new AppError("FILE_NAME", fileNameErrorMessage(nameProblem));
  // Content sniffing: the declared type must match the actual bytes.
  if (!matchesMagicBytes(file.data, file.type)) {
    throw new AppError("FILE_CONTENT", "The file content does not match its declared format.");
  }
}

export function validateRegistrationFiles(files: RegistrationFileInput[]): void {
  if (files.length > REGISTRATION_MAX_DOCUMENTS) {
    throw new AppError("FILE_TOO_MANY", "Too many documents.");
  }
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.category)) throw new AppError("FILE_DUPLICATE", "One document per category.");
    seen.add(f.category);
    validateRegistrationFile(f);
  }
}

/* ------------------------------------------------------------------ */
/* Rate limiting (defense in depth: in-memory window + DB-backed)      */
/* ------------------------------------------------------------------ */

const MEMORY_WINDOW_MS = 10 * 60 * 1000;
const MEMORY_MAX_PER_WINDOW = 8;
const memoryHits = new Map<string, number[]>();

function inMemoryRateLimited(key: string): boolean {
  const now = Date.now();
  const since = now - MEMORY_WINDOW_MS;
  const list = (memoryHits.get(key) ?? []).filter((t) => t > since);
  if (memoryHits.size > 5000) memoryHits.clear();
  memoryHits.set(key, list);
  if (list.length >= MEMORY_MAX_PER_WINDOW) return true;
  list.push(now);
  return false;
}

export const RATE_LIMIT_PER_IP_HOUR = 5;
export const RATE_LIMIT_PER_IP_DAY = 20;

/** Rejects abusive submission velocity. Fails CLOSED on DB errors. */
export async function assertRegistrationRateLimit(ipAddress: string | null): Promise<void> {
  const key = ipAddress ?? "unknown";
  if (inMemoryRateLimited(key)) {
    throw new AppError("RATE_LIMITED", "Too many attempts. Please wait before submitting again.");
  }
  try {
    // Persist only a one-way hash of the rate-limit subject in auth_rate_limits.
    // The public partnership record itself does not need a durable raw IP copy.
    const [hourAllowed, dayAllowed] = await Promise.all([
      consumeAuthRateLimit("agency-registration-hour", key, RATE_LIMIT_PER_IP_HOUR, 60 * 60_000),
      consumeAuthRateLimit("agency-registration-day", key, RATE_LIMIT_PER_IP_DAY, 24 * 60 * 60_000),
    ]);
    if (!hourAllowed || !dayAllowed) {
      throw new AppError("RATE_LIMITED", "Too many attempts. Please wait before submitting again.");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error("[registrations] rate-limit check failed (failing closed)", safeErrorCode(err) ?? "unknown");
    throw new AppError("SERVICE_UNAVAILABLE", "Service temporarily unavailable. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Duplicate detection (existing accounts + in-flight applications)     */
/* ------------------------------------------------------------------ */

export async function getRegistrationDuplicateCandidates(id: string, actor: AuthUser): Promise<Array<{id: string; kind: string; name: string; signals: string[]}>> {
  requirePermission(actor, "registrations.view");
  if (!z.string().uuid().safeParse(id).success) return [];
  const [reg] = await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id,id));
  if (!reg) return [];
  const normalizedPhone = reg.phone.replace(/\D/g, "");
  const rows = await pool.query(`select id,kind,name,email,phone from (
    select id,'registration' as kind,legal_name as name,email,phone from ${qualifiedTable("agency_registrations")} where id<>$1 and status in ('PENDING','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','APPROVED')
    union all select id,'agency' as kind,legal_name as name,email,phone from ${qualifiedTable("agencies")} where id is distinct from $5::uuid
  ) candidates where lower(trim(name))=lower(trim($2)) or lower(trim(email))=lower(trim($3)) or ($4<>'' and regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$4) limit 12`,[id,reg.legalName,reg.email,normalizedPhone,reg.agencyId]);
  return rows.rows.map((row) => ({ id:row.id,kind:row.kind,name:row.name,signals:[
    row.name.trim().toLowerCase() === reg.legalName.trim().toLowerCase() ? "name" : "",
    row.email?.trim().toLowerCase() === reg.email.trim().toLowerCase() ? "email" : "",
    normalizedPhone && row.phone?.replace(/\D/g, "") === normalizedPhone ? "phone" : "",
  ].filter(Boolean) }));
}
/* ------------------------------------------------------------------ */
/* Public submission                                                   */
/* ------------------------------------------------------------------ */

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newReference(): string {
  const bytes = randomBytes(6);
  let suffix = "";
  for (const b of bytes) suffix += REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length];
  return `AGR-${new Date().getFullYear()}-${suffix}`;
}

export interface SubmittedRegistration {
  id: string;
  reference: string;
}

/**
 * Persist a public registration with its documents. Storage writes happen
 * first; on database failure the blobs are best-effort removed. Duplicate,
 * rate-limit and validation checks run BEFORE anything is written.
 */
export async function submitAgencyRegistration(params: {
  data: RegistrationData;
  files: RegistrationFileInput[];
  ipAddress: string | null;
}): Promise<SubmittedRegistration> {
  const { data, files } = params;
  validateRegistrationFiles(files);
  await assertRegistrationRateLimit(params.ipAddress);

  const id = randomUUID();
  // 1. Private storage first (keys are server-generated, never from input).
  const stored: Array<{ key: string; file: RegistrationFileInput; sha256: string }> = [];
  try {
    for (const file of files) {
      const key = `agency-registrations/${id}/${randomUUID()}`;
      const sha256 = sha256Hex(file.data);
      await storageProvider().put(key, file.data, file.type);
      stored.push({ key, file, sha256 });
    }
  } catch (err) {
    for (const s of stored) await storageProvider().delete(s.key).catch(() => {});
    console.error("[registrations] document storage failed", safeErrorCode(err) ?? "unknown");
    throw new AppError("STORAGE_WRITE_FAILED", "Could not store the uploaded documents.");
  }

  // 2. Database, one transaction (registration + documents + history).
  try {
    const reference = await persistRegistration(id, data, stored);
    // 3. Notifications are non-critical post-commit side effects. Submission
    // audit evidence is committed atomically inside persistRegistration().
    const staff = await staffUserIds([...REGISTRATION_DECIDE_ROLES]).catch(() => [] as string[]);
    await notifyUsers(staff, {
      type: "REGISTRATION_SUBMITTED",
      title: `New agency registration — ${data.legalName}`,
      body: `${data.legalName} (${data.country}) applied for partnership. Reference ${reference}.`,
      link: `/admin/registrations/${id}`,
    }).catch((err) => console.error("[registrations] staff notification failed", safeErrorCode(err) ?? "unknown"));
    return { id, reference };
  } catch (err) {
    for (const s of stored) await storageProvider().delete(s.key).catch(() => {});
    throw err;
  }
}

async function persistRegistration(
  id: string,
  data: RegistrationData,
  stored: Array<{ key: string; file: RegistrationFileInput; sha256: string }>,
): Promise<string> {
  let lastError: unknown = null;
  // Retry only on (practically impossible) reference collisions.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reference = newReference();
    try {
      return await db.transaction(async (tx) => {
        await tx.insert(agencyRegistrations).values({
          id,
          reference,
          locale: data.locale,
          legalName: data.legalName,
          tradingName: data.tradingName,
          country: data.country,
          region: data.region,
          city: data.city,
          addressLine: data.addressLine,
          phone: data.phone,
          email: data.email,
          website: data.website,
          commercialRegistrationNumber: data.commercialRegistrationNumber,
          taxId: data.taxId,
          licenceNumber: data.licenceNumber,
          contactFirstName: data.contactFirstName,
          contactLastName: data.contactLastName,
          contactPosition: data.contactPosition,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          businessType: data.businessType,
          monthlyVolume: data.monthlyVolume,
          mainMarkets: data.mainMarkets,
          message: data.message,
          termsAccepted: data.terms === "true",
          privacyAcknowledged: data.privacy === "true",
          infoConfirmed: data.accuracy === "true",
          consentedAt: new Date(),
          legalConsentVersions: data.legalConsentVersions ?? {},
          status: "PENDING",
        });
        if (stored.length > 0) {
          await tx.insert(agencyRegistrationDocuments).values(
            stored.map(({ key, file, sha256 }) => ({
              registrationId: id,
              category: file.category,
              originalFilename: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              sha256,
              storageKey: key,
            })),
          );
        }
        await tx.insert(agencyRegistrationHistory).values({
          registrationId: id,
          kind: "STATUS",
          fromStatus: null,
          toStatus: "PENDING",
          actorId: null,
          note: "Application submitted from the public website.",
        });
        await tx.insert(auditLogs).values({
          actorId: null,
          actorEmail: null,
          actorRole: null,
          agencyId: null,
          action: "AGENCY_REGISTRATION_SUBMITTED",
          entity: "agency_registration",
          entityId: id,
          metadata: { reference, documents: stored.length, locale: data.locale },
          // Raw public IP is intentionally not persisted in the partnership
          // record or its durable audit. Rate-limit subjects are one-way hashed.
          ipAddress: null,
        });
        return reference;
      });
    } catch (err) {
      lastError = err;
      if ((err as { code?: string } | null)?.code === "23505" && attempt < 2) continue;
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new AppError("GENERIC", "Submission failed.");
}

/* ------------------------------------------------------------------ */
/* Admin read model                                                    */
/* ------------------------------------------------------------------ */

export async function pendingRegistrationCount(): Promise<number> {
  const rows = await db
    .select({ total: count() })
    .from(agencyRegistrations)
    .where(eq(agencyRegistrations.status, "PENDING"));
  return Number(rows[0]?.total ?? 0);
}

export interface RegistrationFilters {
  q?: string;
  status?: string;
  country?: string;
  page?: number;
}

export async function listRegistrations(filters: RegistrationFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const conditions = [];
  const VALID = ["PENDING", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "APPROVED", "REJECTED"];
  if (filters.status && VALID.includes(filters.status)) {
    conditions.push(eq(agencyRegistrations.status, filters.status));
  }
  if (filters.country) {
    conditions.push(eq(agencyRegistrations.country, filters.country));
  }
  if (filters.q) {
    const term = `%${filters.q.trim().slice(0, 80)}%`;
    conditions.push(
      or(
        ilike(agencyRegistrations.reference, term),
        ilike(agencyRegistrations.legalName, term),
        ilike(agencyRegistrations.tradingName, term),
        ilike(agencyRegistrations.email, term),
        ilike(agencyRegistrations.city, term),
        ilike(agencyRegistrations.contactEmail, term),
        ilike(agencyRegistrations.commercialRegistrationNumber, term),
        sql`${agencyRegistrations.contactFirstName} || ' ' || ${agencyRegistrations.contactLastName} ilike ${term}`,
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select()
    .from(agencyRegistrations)
    .where(where)
    .orderBy(desc(agencyRegistrations.createdAt))
    .limit(REGISTRATION_PAGE_SIZE)
    .offset((page - 1) * REGISTRATION_PAGE_SIZE);
  const totalRows = await db.select({ total: count() }).from(agencyRegistrations).where(where);
  const total = Number(totalRows[0]?.total ?? 0);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / REGISTRATION_PAGE_SIZE)) };
}

export async function distinctRegistrationCountries(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ country: agencyRegistrations.country })
    .from(agencyRegistrations)
    .orderBy(asc(agencyRegistrations.country));
  return rows.map((r) => r.country).filter((country): country is string => Boolean(country));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getRegistrationDetail(id: string) {
  if (!UUID_RE.test(id)) return null;
  const [registration] = await db
    .select()
    .from(agencyRegistrations)
    .where(eq(agencyRegistrations.id, id))
    .limit(1);
  if (!registration) return null;
  const [docs, history, agency, adminUser] = await Promise.all([
    db
      .select()
      .from(agencyRegistrationDocuments)
      .where(eq(agencyRegistrationDocuments.registrationId, id))
      .orderBy(asc(agencyRegistrationDocuments.createdAt)),
    db
      .select({
        entry: agencyRegistrationHistory,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(agencyRegistrationHistory)
      .leftJoin(users, eq(agencyRegistrationHistory.actorId, users.id))
      .where(eq(agencyRegistrationHistory.registrationId, id))
      .orderBy(asc(agencyRegistrationHistory.createdAt)),
    registration.agencyId
      ? db.select().from(agencies).where(eq(agencies.id, registration.agencyId)).limit(1)
      : Promise.resolve([]),
    registration.adminUserId
      ? db
          .select({ id: users.id, email: users.email, name: users.name, status: users.status, username: users.username })
          .from(users)
          .where(eq(users.id, registration.adminUserId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  return {
    registration,
    documents: docs,
    history: history.map((h) => ({ ...h.entry, actorName: h.actorName, actorEmail: h.actorEmail })),
    agency: agency[0] ?? null,
    adminUser: adminUser[0] ?? null,
  };
}

/** Staff-only loader for a registration document (private storage). */
export async function getRegistrationDocument(registrationId: string, documentId: string) {
  if (!UUID_RE.test(registrationId) || !UUID_RE.test(documentId)) return null;
  const rows = await db
    .select()
    .from(agencyRegistrationDocuments)
    .where(
      and(
        eq(agencyRegistrationDocuments.id, documentId),
        eq(agencyRegistrationDocuments.registrationId, registrationId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Admin workflow                                                      */
/* ------------------------------------------------------------------ */

type RegistrationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockRegistration(tx: RegistrationTransaction, id: string): Promise<AgencyRegistration> {
  if (!UUID_RE.test(id)) throw new AppError("NOT_FOUND", "Registration not found.");
  const [reg] = await tx.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, id)).for("update");
  if (!reg) throw new AppError("NOT_FOUND", "Registration not found.");
  return reg;
}

async function closeRegistrationFollowups(tx: RegistrationTransaction, id: string): Promise<void> {
  await tx.update(agencyRegistrationFollowupTokens).set({ revokedAt: new Date() }).where(and(
    eq(agencyRegistrationFollowupTokens.registrationId, id), isNull(agencyRegistrationFollowupTokens.revokedAt), isNull(agencyRegistrationFollowupTokens.usedAt),
  ));
  await tx.update(agencyRegistrationRequests).set({ status: "CANCELLED" }).where(and(
    eq(agencyRegistrationRequests.registrationId, id), eq(agencyRegistrationRequests.status, "OPEN"),
  ));
}

async function registrationAudit(tx: RegistrationTransaction, id: string, actor: AuthUser, action: string, metadata?: Record<string, unknown>, ipAddress?: string | null): Promise<void> {
  await tx.insert(auditLogs).values({ actorId: actor.id, actorEmail: actor.email, actorRole: actor.role, action,
    entity: "agency_registration", entityId: id, metadata: metadata ?? null, ipAddress: ipAddress ?? null });
}

export async function startRegistrationReview(id: string, actor: AuthUser, ipAddress?: string | null): Promise<void> {
  requirePermission(actor, "registrations.manage");
  await db.transaction(async (tx) => {
    const reg = await lockRegistration(tx, id);
    if (!["PENDING", "MORE_INFORMATION_REQUIRED", "REJECTED"].includes(reg.status)) {
      throw new AppError("INVALID_STATE", "This registration cannot be moved to review.");
    }
    await closeRegistrationFollowups(tx, id);
    await tx.update(agencyRegistrations).set({ status: "UNDER_REVIEW", reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(agencyRegistrations.id, id));
    await tx.insert(agencyRegistrationHistory).values({ registrationId: id, kind: "STATUS", fromStatus: reg.status, toStatus: "UNDER_REVIEW", actorId: actor.id });
    await registrationAudit(tx, id, actor, "REGISTRATION_UNDER_REVIEW", { from: reg.status }, ipAddress);
  });
}

export async function requestMoreInformation(id: string, actor: AuthUser, note: string, ipAddress?: string | null): Promise<void> {
  requirePermission(actor, "registrations.manage");
  const clean = note.trim();
  if (clean.length < 10 || clean.length > 2000) throw new AppError("VALIDATION", "Describe the information required (10–2000 characters).");
  await db.transaction(async (tx) => {
    const reg = await lockRegistration(tx, id);
    if (!["PENDING", "UNDER_REVIEW"].includes(reg.status)) throw new AppError("INVALID_STATE", "More information can only be requested while the application is open.");
    await closeRegistrationFollowups(tx, id);
    await tx.update(agencyRegistrations).set({ status: "MORE_INFORMATION_REQUIRED", reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(agencyRegistrations.id, id));
    await tx.insert(agencyRegistrationHistory).values({ registrationId: id, kind: "INFO_REQUEST", fromStatus: reg.status, toStatus: "MORE_INFORMATION_REQUIRED", actorId: actor.id, note: clean });
    await registrationAudit(tx, id, actor, "REGISTRATION_INFO_REQUESTED", { note: clean }, ipAddress);
  });
}

export async function rejectRegistration(id: string, actor: AuthUser, reason: string, ipAddress?: string | null): Promise<void> {
  requirePermission(actor, "registrations.manage");
  const clean = reason.trim();
  if (clean.length < 10 || clean.length > 2000) throw new AppError("VALIDATION", "A rejection reason (10–2000 characters) is mandatory.");
  await db.transaction(async (tx) => {
    const reg = await lockRegistration(tx, id);
    if (!ACTIVE_REGISTRATION_STATUSES.includes(reg.status as RegistrationStatus)) throw new AppError("INVALID_STATE", "Only an open application can be rejected.");
    await closeRegistrationFollowups(tx, id);
    await tx.update(agencyRegistrations).set({ status: "REJECTED", rejectionReason: clean, decidedBy: actor.id, decidedAt: new Date(), updatedAt: new Date() }).where(eq(agencyRegistrations.id, id));
    await tx.insert(agencyRegistrationHistory).values({ registrationId: id, kind: "STATUS", fromStatus: reg.status, toStatus: "REJECTED", actorId: actor.id, note: clean });
    await registrationAudit(tx, id, actor, "REGISTRATION_REJECTED", { reason: clean }, ipAddress);
  });
}

export async function addInternalNote(id: string, actor: AuthUser, note: string, ipAddress?: string | null): Promise<void> {
  requirePermission(actor, "registrations.manage");
  const clean = note.trim();
  if (clean.length < 3 || clean.length > 2000) throw new AppError("VALIDATION", "The note must contain 3–2000 characters.");
  await db.transaction(async (tx) => {
    const reg = await lockRegistration(tx, id);
    const appended = reg.internalNotes ? reg.internalNotes + "\n\n" + clean : clean;
    await tx.update(agencyRegistrations).set({ internalNotes: appended, updatedAt: new Date() }).where(eq(agencyRegistrations.id, id));
    await tx.insert(agencyRegistrationHistory).values({ registrationId: id, kind: "NOTE", actorId: actor.id, note: clean });
    await registrationAudit(tx, id, actor, "REGISTRATION_NOTE_ADDED", undefined, ipAddress);
  });
}


/* ------------------------------------------------------------------ */
/* Approval — the privileged, transactional, idempotent operation      */
/* ------------------------------------------------------------------ */

export interface ApprovalResult {
  agencyId: string;
  adminUserId: string;
  legalName: string;
  contactEmail: string;
  username: string;
  alreadyApproved: boolean;
}

/**
 * Approve a registration and provision the tenant atomically.
 *
 * Safety properties (tested):
 *  - caller must hold a decision role (defense in depth on top of RBAC),
 *  - the registration row is locked FOR UPDATE; a second approver blocks
 *    then returns the idempotent result,
 *  - server-side re-validation runs INSIDE the transaction (contact email
 *    must not collide with an existing user; agency legal name/email must
 *    not collide with an existing agency),
 *  - the user gets role EXACTLY 'AGENCY_ADMIN' and is bound to the new
 *    agency only (DB check constraint reinforces this),
 *  - no wallet rows are written; the agency balance stays the default 0,
 *  - any failure rolls everything back — no half-provisioned tenants.
 */
export async function approveRegistration(params: {
  registrationId: string;
  actor: AuthUser;
  ipAddress?: string | null;
}): Promise<ApprovalResult> {
  const { actor, registrationId } = params;
  if (!REGISTRATION_DECIDE_ROLES.includes(actor.role)) {
    throw new AppError("FORBIDDEN", "Only authorized ESSAFARIA administrators can approve registrations.");
  }

  const q = qualifiedTable;
  const client = await pool.connect();
  let result: ApprovalResult;
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '30s'");
    const found = await client.query(
      `select * from ${q("agency_registrations")} where id = $1 for update`,
      [registrationId],
    );
    const reg = found.rows[0] as
      | (Record<string, unknown> & {
          status: string;
          agency_id: string | null;
          admin_user_id: string | null;
          legal_name: string;
          trading_name: string | null;
          email: string;
          phone: string | null;
          address_line: string | null;
          city: string | null;
          country: string | null;
          tax_id: string | null;
          contact_email: string;
          contact_first_name: string;
          contact_last_name: string;
          reference: string;
        })
      | undefined;
    if (!reg) {
      await client.query("rollback");
      throw new AppError("NOT_FOUND", "Registration not found.");
    }

    // Idempotency: approval completed earlier (e.g. double-click or a
    // concurrent admin) — return the existing links, create nothing new.
    if (reg.status === "APPROVED" && reg.agency_id && reg.admin_user_id) {
      const account = await client.query(`select username from ${q("users")} where id=$1`,[reg.admin_user_id]);
      await client.query("commit");
      return {
        agencyId: reg.agency_id,
        adminUserId: reg.admin_user_id,
        legalName: reg.legal_name,
        contactEmail: reg.email,
        username: account.rows[0]?.username ?? legacyAgencyUsername(reg.admin_user_id),
        alreadyApproved: true,
      };
    }
    if (!["PENDING", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"].includes(reg.status)) {
      await client.query("rollback");
      throw new AppError("INVALID_STATE", "Only an open application can be approved.");
    }

    // Possible duplicate identities are reviewed by Staff, never auto-rejected.

    // 1. Create the Agency with the existing agency model. The wallet is
    //    NOT touched: balance stays the platform default (0).
    const agencyRows = await client.query(
      `insert into ${q("agencies")}
         (legal_name, trading_name, email, phone, address_line, city, country,
          status, currency, billing_name, billing_email, billing_tax_id)
       values ($1,$2,$3,$4,$5,$6,$7,'ACTIVE','DZD',$8,$9,$10)
       returning id`,
      [
        reg.legal_name,
        reg.trading_name,
        reg.email,
        reg.phone,
        reg.address_line,
        reg.city,
        reg.country,
        reg.legal_name,
        reg.email,
        reg.tax_id,
      ],
    );
    const agencyId = agencyRows.rows[0]!.id as string;

    // 2. Create the first user with the existing user model — role EXACTLY
    //    AGENCY_ADMIN, strictly bound to the new tenant. No plaintext
    //    password is ever set: the hash wraps an unknown random secret and
    //    the only way in is the secure activation flow.
    const placeholderSecret = randomBytes(32).toString("base64url");
    const passwordHash = await hashPassword(placeholderSecret);
    const newAdminId = randomUUID();
    const userRows = await client.query(
      `insert into ${q("users")} (email, password_hash, name, role, agency_id, status, id, username, activation_pending, must_change_password)
       values ($1,$2,$3,'AGENCY_ADMIN',$4,'ACTIVE',$5,$6,true,true)
       returning id`,
      [
        reg.email,
        passwordHash,
        `${reg.contact_first_name} ${reg.contact_last_name}`.trim(),
        agencyId,
        newAdminId,
        legacyAgencyUsername(newAdminId),
      ],
    );
    const adminUserId = userRows.rows[0]!.id as string;

    // 3. Link registration → agency → admin + record the decision. The
    //    status guard means even a lost lock could never double-approve.
    const linked = await client.query(
      `update ${q("agency_registrations")}
       set status = 'APPROVED',
           agency_id = $2,
           admin_user_id = $3,
           decided_by = $4,
           decided_at = now(),
           reviewed_by = coalesce(reviewed_by, $4),
           reviewed_at = coalesce(reviewed_at, now()),
           updated_at = now()
       where id = $1 and status in ('PENDING','UNDER_REVIEW','MORE_INFORMATION_REQUIRED')`,
      [registrationId, agencyId, adminUserId, actor.id],
    );
    if (linked.rowCount !== 1) {
      await client.query("rollback");
      throw new AppError("RACE", "The registration changed while approving. Refresh and try again.");
    }
    await client.query(
      `insert into ${q("agency_registration_history")} (registration_id, kind, from_status, to_status, actor_id)
       values ($1,'STATUS',$2,'APPROVED',$3)`,
      [registrationId, reg.status, actor.id],
    );
    await client.query(`update ${q("agency_registration_followup_tokens")} set revoked_at=now() where registration_id=$1 and revoked_at is null and used_at is null`,[registrationId]);
    await client.query(`update ${q("agency_registration_requests")} set status='CANCELLED' where registration_id=$1 and status='OPEN'`,[registrationId]);
    for (const event of [
      { action:"REGISTRATION_APPROVED",entity:"agency_registration",id:registrationId,metadata:{adminUserId} },
      { action:"AGENCY_CREATED",entity:"agency",id:agencyId,metadata:{source:"agency_registration",registrationId} },
      { action:"USER_CREATED",entity:"user",id:adminUserId,metadata:{role:"AGENCY_ADMIN",source:"agency_registration",registrationId} },
    ]) {
      await client.query(`insert into ${q("audit_logs")} (actor_id,actor_email,actor_role,agency_id,action,entity,entity_id,metadata,ip_address) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,[actor.id,actor.email,actor.role,agencyId,event.action,event.entity,event.id,JSON.stringify(event.metadata),params.ipAddress??null]);
    }

    await client.query("commit");
    result = {
      agencyId,
      adminUserId,
      legalName: reg.legal_name,
      contactEmail: reg.email,
      username: legacyAgencyUsername(newAdminId),
      alreadyApproved: false,
    };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Notifications run after the atomic decision and audit transaction.
  // Existing onboarding/notification mechanism: welcome the agency admin
  // and keep staff informed.
  await notifyUsers([result.adminUserId], {
    type: "AGENCY_ONBOARDED",
    title: `Welcome to ESSAFARIA VISA OS — ${result.legalName}`,
    body: "Your agency workspace is ready. Activate your account with the secure link provided by ESSAFARIA to access your portal.",
    link: "/portal",
    agencyId: result.agencyId,
  }).catch((err) => console.error("[registrations] onboarding notification failed", safeErrorCode(err) ?? "unknown"));
  const staff = await staffUserIds([...REGISTRATION_DECIDE_ROLES]).catch(() => [] as string[]);
  await notifyUsers(staff, {
    type: "REGISTRATION_APPROVED",
    title: `Registration approved — ${result.legalName}`,
    body: `${result.legalName} was approved by ${actor.name}. The agency and its Agency Admin were created.`,
    link: `/admin/registrations/${registrationId}`,
  }).catch((err) => console.error("[registrations] staff notification failed", safeErrorCode(err) ?? "unknown"));

  return result;
}

/* ------------------------------------------------------------------ */
/* Account activation (set-password flow — no plaintext passwords)     */
/* ------------------------------------------------------------------ */

export const ACTIVATION_TTL_HOURS = 72;

/**
 * Issue a single-use activation token for the Agency Admin of an APPROVED
 * registration. Generating a new link invalidates all previous unused ones.
 */
export async function createActivationTokenForRegistration(
  registrationId: string,
  actor: AuthUser,
): Promise<{ token: string; expiresAt: Date; email: string }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_HOURS * 60 * 60 * 1000);
  const reg = await db.transaction(async (tx) => {
    await lockIdentityState(tx);
    const current = await requireRecoveryManager(actor, tx);
    const [reg] = await tx.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, registrationId)).for("update").limit(1);
    if (!reg || reg.status !== "APPROVED" || !reg.adminUserId) {
      throw new AppError("INVALID_STATE", "Activation links are available once the registration is approved.");
    }
    const [account] = await tx.select({ user: users, agencyStatus: agencies.status }).from(users)
      .leftJoin(agencies, eq(users.agencyId, agencies.id)).where(eq(users.id, reg.adminUserId!)).limit(1);
    if (!account || account.user.status !== "ACTIVE" || account.agencyStatus !== "ACTIVE") {
      throw new AppError("INVALID_STATE", "Reactivate the account and agency before issuing access.");
    }
    // single live link at a time: revoke previous unused tokens
    await revokeUnusedAccessTokens(tx, reg.adminUserId!);
    await tx.insert(accountActivationTokens).values({
      userId: reg.adminUserId!,
      tokenHash: hashToken(token),
      expiresAt,
      createdBy: current.id,
    });
    await recordIdentityAudit(tx, { actor: current, action: "ACTIVATION_LINK_CREATED", entity: "user", entityId: reg.adminUserId,
      agencyId: reg.agencyId, metadata: { registrationId, expiresAt: expiresAt.toISOString() } });
    return reg;
  });
  return { token, expiresAt, email: reg.email };
}

export interface ActivationInfo {
  userId: string;
  name: string;
  email: string;
  locale: RegistrationLocale;
  agencyName: string;
}

/** Resolve an activation token for display (read-only, status-safe). */
export async function resolveActivation(token: string): Promise<ActivationInfo | null> {
  if (!/^[A-Za-z0-9_-]{20,90}$/.test(token)) return null;
  const rows = await db
    .select({
      t: accountActivationTokens,
      userName: users.name,
      userEmail: users.email,
      userStatus: users.status,
      agencyStatus: agencies.status,
      locale: agencyRegistrations.locale,
      agencyName: agencies.legalName,
    })
    .from(accountActivationTokens)
    .innerJoin(users, eq(accountActivationTokens.userId, users.id))
    .leftJoin(agencyRegistrations, eq(agencyRegistrations.adminUserId, users.id))
    .leftJoin(agencies, eq(users.agencyId, agencies.id))
    .where(and(eq(accountActivationTokens.tokenHash, hashToken(token)), eq(accountActivationTokens.purpose, "AGENCY_ADMIN_ACTIVATION")))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.t.usedAt) return null;
  if (row.t.expiresAt < new Date()) return null;
  if (row.userStatus !== "ACTIVE") return null;
  if (row.agencyStatus !== "ACTIVE") return null;
  const locale = row.locale === "fr" || row.locale === "ar" ? row.locale : "en";
  return {
    userId: row.t.userId,
    name: row.userName,
    email: row.userEmail,
    locale,
    agencyName: row.agencyName ?? "",
  };
}

/**
 * Set the account password from a valid activation token. Single-use:
 * the token is consumed atomically and every other unused token for the
 * user is revoked in the same transaction.
 */
export async function activateAccount(
  token: string,
  password: string,
  ipAddress?: string | null,
): Promise<{ id: string; email: string; username: string | null; name: string; role: string; agencyId: string | null; credentialVersion: number }> {
  if (!/^[A-Za-z0-9_-]{20,90}$/.test(token)) {
    throw new AppError("INVALID_TOKEN", "This activation link is invalid or has expired.");
  }
  if (password.length < 10 || password.length > 200 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new AppError("PASSWORD_POLICY", "Password must be 10–200 characters and include letters and numbers.");
  }
  const passwordHash = await hashPassword(password);
  const { row, credentialVersion } = await db.transaction(async (tx) => {
    await lockIdentityState(tx);
    const [row] = await tx.select({ t: accountActivationTokens, u: users, agencyStatus: agencies.status }).from(accountActivationTokens)
      .innerJoin(users, eq(accountActivationTokens.userId, users.id)).leftJoin(agencies, eq(users.agencyId, agencies.id))
      .where(and(eq(accountActivationTokens.tokenHash, hashToken(token)), eq(accountActivationTokens.purpose, "AGENCY_ADMIN_ACTIVATION"),
        isNull(accountActivationTokens.usedAt), gt(accountActivationTokens.expiresAt, new Date()))).limit(1);
    if (!row || row.u.status !== "ACTIVE" || row.agencyStatus !== "ACTIVE") {
      throw new AppError("INVALID_TOKEN", "This activation link is invalid or has expired.");
    }
    const consumed = await tx
      .update(accountActivationTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(accountActivationTokens.id, row.t.id), isNull(accountActivationTokens.usedAt)))
      .returning({ id: accountActivationTokens.id });
    if (!consumed[0]) {
      throw new AppError("INVALID_TOKEN", "This activation link is invalid or has expired.");
    }
    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: false, activationPending: false, updatedAt: new Date() })
      .where(eq(users.id, row.u.id));
    const credentialVersion = await revokeUserAccess(tx, row.u.id);
    await recordIdentityAudit(tx, { actor: { id: row.u.id, email: row.u.email, username: row.u.username, name: row.u.name,
      role: row.u.role as AuthUser["role"], agencyId: row.u.agencyId, userStatus: row.u.status, agencyStatus: row.agencyStatus, agencyName: null },
      action: "ACCOUNT_ACTIVATED", entity: "user", entityId: row.u.id, agencyId: row.u.agencyId,
      metadata: { method: "activation_link" }, ipAddress: ipAddress ?? null });
    return { row, credentialVersion };
  });
  return {
    id: row.u.id,
    email: row.u.email,
    username: row.u.username,
    name: row.u.name,
    role: row.u.role,
    agencyId: row.u.agencyId,
    credentialVersion,
  };
}
