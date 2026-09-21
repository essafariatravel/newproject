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
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import {
  accountActivationTokens,
  agencies,
  agencyRegistrationDocuments,
  agencyRegistrationHistory,
  agencyRegistrations,
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
import { recordAudit } from "@/lib/audit";
import { notifyUsers, staffUserIds } from "@/lib/notifications";
import { generateSessionToken, hashPassword, hashToken } from "@/lib/crypto";
import type { RegistrationCopy, RegistrationLocale } from "@/lib/i18n";

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

  return z.object({
    /* company */
    legalName: text(2, 160),
    tradingName: optText(160),
    country: text(2, 80),
    region: optText(80),
    city: text(2, 80),
    addressLine: text(5, 300),
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
    commercialRegistrationNumber: text(3, 80),
    taxId: optText(80),
    licenceNumber: optText(80),
    /* primary contact */
    contactFirstName: text(2, 80),
    contactLastName: text(2, 80),
    contactPosition: text(2, 100),
    contactEmail: email,
    contactPhone: text(5, 40),
    /* business profile */
    businessType: choice(REGISTRATION_BUSINESS_TYPES),
    monthlyVolume: choice(MONTHLY_VOLUMES).optional().transform((v) => v ?? null),
    mainMarkets: optText(300),
    message: optText(2000),
    /* consent */
    terms: consent,
    privacy: consent,
    accuracy: consent,
  });
}

export type RegistrationData = z.infer<ReturnType<typeof registrationFormSchema>> & {
  locale: RegistrationLocale;
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
    throw new AppError("FILE_TOO_LARGE", "Files must be 10 MB or smaller.");
  }
  if (!REGISTRATION_MIME_TYPES.includes(file.type)) {
    throw new AppError("FILE_TYPE", "Allowed formats: PDF, JPEG, PNG or WebP.");
  }
  if (file.name.length > 200 || /[\u0000-\u001f\\/]/.test(file.name)) {
    throw new AppError("FILE_NAME", "Invalid file name.");
  }
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
    const rows = await db
      .select({
        lastHour: sql<number>`count(*) filter (where ${agencyRegistrations.createdAt} > now() - interval '1 hour')::int`,
        lastDay: sql<number>`count(*) filter (where ${agencyRegistrations.createdAt} > now() - interval '1 day')::int`,
      })
      .from(agencyRegistrations)
      .where(eq(agencyRegistrations.ipAddress, key));
    const r = rows[0];
    if (r && (r.lastHour >= RATE_LIMIT_PER_IP_HOUR || r.lastDay >= RATE_LIMIT_PER_IP_DAY)) {
      throw new AppError("RATE_LIMITED", "Too many attempts. Please wait before submitting again.");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error("[registrations] rate-limit check failed (failing closed)", err);
    throw new AppError("SERVICE_UNAVAILABLE", "Service temporarily unavailable. Please try again.");
  }
}

/* ------------------------------------------------------------------ */
/* Duplicate detection (existing accounts + in-flight applications)     */
/* ------------------------------------------------------------------ */

async function assertNoDuplicates(data: RegistrationData): Promise<void> {
  // 1. A live user account already owns the primary contact email.
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${data.contactEmail}`)
    .limit(1);
  if (existingUser[0]) {
    throw new AppError("DUPLICATE", "An account already exists for this contact email.");
  }
  // 2. An in-flight registration matches identity signals.
  const inFlight = await db
    .select({ id: agencyRegistrations.id })
    .from(agencyRegistrations)
    .where(
      and(
        inArray(agencyRegistrations.status, ACTIVE_REGISTRATION_STATUSES),
        or(
          eq(agencyRegistrations.contactEmail, data.contactEmail),
          eq(agencyRegistrations.email, data.email),
          sql`lower(${agencyRegistrations.legalName}) = lower(${data.legalName})`,
          and(
            sql`lower(${agencyRegistrations.country}) = lower(${data.country})`,
            sql`lower(${agencyRegistrations.commercialRegistrationNumber}) = lower(${data.commercialRegistrationNumber})`,
          ),
        )!,
      ),
    )
    .limit(1);
  if (inFlight[0]) {
    throw new AppError("DUPLICATE", "A registration for this agency is already being processed.");
  }
  // 3. An existing tenant matches legal name or company email.
  const existingAgency = await db
    .select({ id: agencies.id })
    .from(agencies)
    .where(
      or(
        sql`lower(${agencies.legalName}) = lower(${data.legalName})`,
        sql`lower(${agencies.email}) = lower(${data.email})`,
      )!,
    )
    .limit(1);
  if (existingAgency[0]) {
    throw new AppError("DUPLICATE", "A partner agency with this legal name or email already exists.");
  }
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
  await assertNoDuplicates(data);

  const id = randomUUID();
  // 1. Private storage first (keys are server-generated, never from input).
  const stored: Array<{ key: string; file: RegistrationFileInput }> = [];
  try {
    for (const file of files) {
      const key = `agency-registrations/${id}/${randomUUID()}`;
      await storageProvider().put(key, file.data, file.type);
      stored.push({ key, file });
    }
  } catch (err) {
    for (const s of stored) await storageProvider().delete(s.key).catch(() => {});
    console.error("[registrations] document storage failed", err);
    throw new AppError("STORAGE_WRITE_FAILED", "Could not store the uploaded documents.");
  }

  // 2. Database, one transaction (registration + documents + history).
  try {
    const reference = await persistRegistration(id, data, stored, params.ipAddress);
    // 3. Side effects (non-critical, individually guarded).
    await recordAudit({
      actor: null,
      action: "AGENCY_REGISTRATION_SUBMITTED",
      entity: "agency_registration",
      entityId: id,
      metadata: {
        reference,
        legalName: data.legalName,
        country: data.country,
        businessType: data.businessType,
        documents: stored.length,
        locale: data.locale,
      },
      ipAddress: params.ipAddress,
    });
    const staff = await staffUserIds(["SUPER_ADMIN", "ADMIN"]).catch(() => [] as string[]);
    await notifyUsers(staff, {
      type: "REGISTRATION_SUBMITTED",
      title: `New agency registration — ${data.legalName}`,
      body: `${data.legalName} (${data.country}) applied for partnership. Reference ${reference}.`,
      link: `/admin/registrations/${id}`,
    }).catch((err) => console.error("[registrations] staff notification failed", err));
    return { id, reference };
  } catch (err) {
    for (const s of stored) await storageProvider().delete(s.key).catch(() => {});
    throw err;
  }
}

async function persistRegistration(
  id: string,
  data: RegistrationData,
  stored: Array<{ key: string; file: RegistrationFileInput }>,
  ipAddress: string | null,
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
          status: "PENDING",
          ipAddress,
        });
        if (stored.length > 0) {
          await tx.insert(agencyRegistrationDocuments).values(
            stored.map(({ key, file }) => ({
              registrationId: id,
              category: file.category,
              originalFilename: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
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
  return rows.map((r) => r.country);
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
          .select({ id: users.id, email: users.email, name: users.name, status: users.status })
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

async function loadRegistration(id: string): Promise<AgencyRegistration> {
  const rows = await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, id)).limit(1);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Registration not found.");
  return rows[0];
}

export async function startRegistrationReview(
  id: string,
  actor: AuthUser,
  ipAddress?: string | null,
): Promise<void> {
  const reg = await loadRegistration(id);
  // PENDING / MORE_INFORMATION_REQUIRED start (or resume) review; REJECTED
  // can be reopened through review — every path is audited.
  if (!["PENDING", "MORE_INFORMATION_REQUIRED", "REJECTED"].includes(reg.status)) {
    throw new AppError("INVALID_STATE", "This registration cannot be moved to review.");
  }
  const updated = await db
    .update(agencyRegistrations)
    .set({
      status: "UNDER_REVIEW",
      reviewedBy: actor.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(agencyRegistrations.id, id), eq(agencyRegistrations.status, reg.status)))
    .returning({ id: agencyRegistrations.id });
  if (!updated[0]) throw new AppError("RACE", "The registration changed while updating. Refresh and try again.");
  await db.insert(agencyRegistrationHistory).values({
    registrationId: id,
    kind: "STATUS",
    fromStatus: reg.status,
    toStatus: "UNDER_REVIEW",
    actorId: actor.id,
  });
  await recordAudit({
    actor,
    action: "REGISTRATION_UNDER_REVIEW",
    entity: "agency_registration",
    entityId: id,
    metadata: { from: reg.status },
    ipAddress: ipAddress ?? null,
  });
}

export async function requestMoreInformation(
  id: string,
  actor: AuthUser,
  note: string,
  ipAddress?: string | null,
): Promise<void> {
  const reg = await loadRegistration(id);
  if (!["PENDING", "UNDER_REVIEW"].includes(reg.status)) {
    throw new AppError("INVALID_STATE", "More information can only be requested while the application is open.");
  }
  const clean = note.trim();
  if (clean.length < 10) {
    throw new AppError("VALIDATION", "Describe the information required (min 10 characters).");
  }
  if (clean.length > 2000) throw new AppError("VALIDATION", "The note is too long.");
  await db
    .update(agencyRegistrations)
    .set({ status: "MORE_INFORMATION_REQUIRED", reviewedBy: actor.id, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(agencyRegistrations.id, id));
  await db.insert(agencyRegistrationHistory).values({
    registrationId: id,
    kind: "INFO_REQUEST",
    fromStatus: reg.status,
    toStatus: "MORE_INFORMATION_REQUIRED",
    actorId: actor.id,
    note: clean,
  });
  await recordAudit({
    actor,
    action: "REGISTRATION_INFO_REQUESTED",
    entity: "agency_registration",
    entityId: id,
    metadata: { note: clean },
    ipAddress: ipAddress ?? null,
  });
}

export async function rejectRegistration(
  id: string,
  actor: AuthUser,
  reason: string,
  ipAddress?: string | null,
): Promise<void> {
  const reg = await loadRegistration(id);
  if (!["PENDING", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"].includes(reg.status)) {
    throw new AppError("INVALID_STATE", "Only an open application can be rejected.");
  }
  const clean = reason.trim();
  if (clean.length < 10) {
    throw new AppError("VALIDATION", "A rejection reason (min 10 characters) is mandatory.");
  }
  if (clean.length > 2000) throw new AppError("VALIDATION", "The reason is too long.");
  await db
    .update(agencyRegistrations)
    .set({
      status: "REJECTED",
      rejectionReason: clean,
      decidedBy: actor.id,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agencyRegistrations.id, id));
  await db.insert(agencyRegistrationHistory).values({
    registrationId: id,
    kind: "STATUS",
    fromStatus: reg.status,
    toStatus: "REJECTED",
    actorId: actor.id,
    note: clean,
  });
  await recordAudit({
    actor,
    action: "REGISTRATION_REJECTED",
    entity: "agency_registration",
    entityId: id,
    metadata: { reason: clean, legalName: reg.legalName },
    ipAddress: ipAddress ?? null,
  });
}

export async function addInternalNote(
  id: string,
  actor: AuthUser,
  note: string,
  ipAddress?: string | null,
): Promise<void> {
  const reg = await loadRegistration(id);
  const clean = note.trim();
  if (clean.length < 3) throw new AppError("VALIDATION", "The note is too short.");
  if (clean.length > 2000) throw new AppError("VALIDATION", "The note is too long.");
  const appended = reg.internalNotes ? `${reg.internalNotes}\n\n${clean}` : clean;
  await db
    .update(agencyRegistrations)
    .set({ internalNotes: appended, updatedAt: new Date() })
    .where(eq(agencyRegistrations.id, id));
  await db.insert(agencyRegistrationHistory).values({
    registrationId: id,
    kind: "NOTE",
    actorId: actor.id,
    note: clean,
  });
  await recordAudit({
    actor,
    action: "REGISTRATION_NOTE_ADDED",
    entity: "agency_registration",
    entityId: id,
    ipAddress: ipAddress ?? null,
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
      await client.query("commit");
      return {
        agencyId: reg.agency_id,
        adminUserId: reg.admin_user_id,
        legalName: reg.legal_name,
        contactEmail: reg.contact_email,
        alreadyApproved: true,
      };
    }
    if (!["PENDING", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"].includes(reg.status)) {
      await client.query("rollback");
      throw new AppError("INVALID_STATE", "Only an open application can be approved.");
    }

    // Re-validate server-side at decision time.
    const dupUser = await client.query(
      `select id from ${q("users")} where lower(email) = lower($1) limit 1`,
      [reg.contact_email],
    );
    if (dupUser.rows[0]) {
      await client.query("rollback");
      throw new AppError(
        "CONFLICT",
        "A user account already exists for the primary contact email. Resolve the conflict before approving.",
      );
    }
    const dupAgency = await client.query(
      `select id from ${q("agencies")} where lower(legal_name) = lower($1) or lower(email) = lower($2) limit 1`,
      [reg.legal_name, reg.email],
    );
    if (dupAgency.rows[0]) {
      await client.query("rollback");
      throw new AppError(
        "CONFLICT",
        "A partner agency with this legal name or email already exists. Resolve the conflict before approving.",
      );
    }

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
    const userRows = await client.query(
      `insert into ${q("users")} (email, password_hash, name, role, agency_id, status)
       values ($1,$2,$3,'AGENCY_ADMIN',$4,'ACTIVE')
       returning id`,
      [
        reg.contact_email,
        passwordHash,
        `${reg.contact_first_name} ${reg.contact_last_name}`,
        agencyId,
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
       where id = $1 and status <> 'APPROVED'`,
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

    await client.query("commit");
    result = {
      agencyId,
      adminUserId,
      legalName: reg.legal_name,
      contactEmail: reg.contact_email,
      alreadyApproved: false,
    };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Post-commit side effects — audited and notified, never fatal.
  await recordAudit({
    actor,
    action: "REGISTRATION_APPROVED",
    entity: "agency_registration",
    entityId: registrationId,
    agencyId: result.agencyId,
    metadata: { legalName: result.legalName, adminUserId: result.adminUserId },
    ipAddress: params.ipAddress ?? null,
  });
  await recordAudit({
    actor,
    action: "AGENCY_CREATED",
    entity: "agency",
    entityId: result.agencyId,
    agencyId: result.agencyId,
    metadata: { legalName: result.legalName, source: "agency_registration", registrationId },
    ipAddress: params.ipAddress ?? null,
  });
  await recordAudit({
    actor,
    action: "USER_CREATED",
    entity: "user",
    entityId: result.adminUserId,
    agencyId: result.agencyId,
    metadata: { email: result.contactEmail, role: "AGENCY_ADMIN", source: "agency_registration" },
    ipAddress: params.ipAddress ?? null,
  });
  // Existing onboarding/notification mechanism: welcome the agency admin
  // and keep staff informed.
  await notifyUsers([result.adminUserId], {
    type: "AGENCY_ONBOARDED",
    title: `Welcome to ESSAFARIA VISA OS — ${result.legalName}`,
    body: "Your agency workspace is ready. Activate your account with the secure link provided by ESSAFARIA to access your portal.",
    link: "/portal",
    agencyId: result.agencyId,
  }).catch((err) => console.error("[registrations] onboarding notification failed", err));
  const staff = await staffUserIds(["SUPER_ADMIN", "ADMIN"]).catch(() => [] as string[]);
  await notifyUsers(staff, {
    type: "REGISTRATION_APPROVED",
    title: `Registration approved — ${result.legalName}`,
    body: `${result.legalName} was approved by ${actor.name}. The agency and its Agency Admin were created.`,
    link: `/admin/registrations/${registrationId}`,
  }).catch((err) => console.error("[registrations] staff notification failed", err));

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
  const reg = await loadRegistration(registrationId);
  if (reg.status !== "APPROVED" || !reg.adminUserId) {
    throw new AppError("INVALID_STATE", "Activation links are available once the registration is approved.");
  }
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_HOURS * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    // single live link at a time: revoke previous unused tokens
    await tx
      .delete(accountActivationTokens)
      .where(and(eq(accountActivationTokens.userId, reg.adminUserId!), isNull(accountActivationTokens.usedAt)));
    await tx.insert(accountActivationTokens).values({
      userId: reg.adminUserId!,
      tokenHash: hashToken(token),
      expiresAt,
      createdBy: actor.id,
    });
  });
  await recordAudit({
    actor,
    action: "ACTIVATION_LINK_CREATED",
    entity: "user",
    entityId: reg.adminUserId,
    agencyId: reg.agencyId,
    metadata: { registrationId, email: reg.contactEmail, expiresAt: expiresAt.toISOString() },
  });
  return { token, expiresAt, email: reg.contactEmail };
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
      locale: agencyRegistrations.locale,
      agencyName: agencies.legalName,
    })
    .from(accountActivationTokens)
    .innerJoin(users, eq(accountActivationTokens.userId, users.id))
    .leftJoin(agencyRegistrations, eq(agencyRegistrations.adminUserId, users.id))
    .leftJoin(agencies, eq(agencyRegistrations.agencyId, agencies.id))
    .where(eq(accountActivationTokens.tokenHash, hashToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.t.usedAt) return null;
  if (row.t.expiresAt < new Date()) return null;
  if (row.userStatus !== "ACTIVE") return null;
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
): Promise<{ id: string; email: string; name: string; role: string; agencyId: string | null }> {
  if (!/^[A-Za-z0-9_-]{20,90}$/.test(token)) {
    throw new AppError("INVALID_TOKEN", "This activation link is invalid or has expired.");
  }
  if (password.length < 10 || password.length > 200) {
    throw new AppError("PASSWORD_POLICY", "Password must be at least 10 characters.");
  }
  const rows = await db
    .select({ t: accountActivationTokens, u: users })
    .from(accountActivationTokens)
    .innerJoin(users, eq(accountActivationTokens.userId, users.id))
    .where(eq(accountActivationTokens.tokenHash, hashToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row || row.t.usedAt || row.t.expiresAt < new Date()) {
    throw new AppError("INVALID_TOKEN", "This activation link is invalid or has expired.");
  }
  if (row.u.status !== "ACTIVE") {
    throw new AppError("USER_SUSPENDED", "This account has been suspended. Contact ESSAFARIA support.");
  }
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
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
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, row.u.id));
    await tx
      .delete(accountActivationTokens)
      .where(
        and(eq(accountActivationTokens.userId, row.u.id), isNull(accountActivationTokens.usedAt)),
      );
  });
  await recordAudit({
    actor: {
      id: row.u.id,
      email: row.u.email,
      name: row.u.name,
      role: row.u.role as AuthUser["role"],
      agencyId: row.u.agencyId,
      userStatus: row.u.status,
      agencyStatus: null,
      agencyName: null,
    },
    action: "ACCOUNT_ACTIVATED",
    entity: "user",
    entityId: row.u.id,
    agencyId: row.u.agencyId,
    metadata: { method: "activation_link" },
    ipAddress: ipAddress ?? null,
  });
  return {
    id: row.u.id,
    email: row.u.email,
    name: row.u.name,
    role: row.u.role,
    agencyId: row.u.agencyId,
  };
}
