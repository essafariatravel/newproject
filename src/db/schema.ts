/**
 * ESSAFARIA VISA OS — Database schema (Drizzle ORM)
 *
 * Conventions:
 * - All ids are UUIDs generated in the database (gen_random_uuid()).
 * - Money is numeric(14,2) stored as string; always handled server-side.
 * - Business configuration (statuses, priorities, fees, requirements) is DB-driven.
 * - Applications snapshot their configuration at creation (historical integrity).
 * - No destructive cascading deletes on business data.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable as publicTable,
  pgSchema,
  type PgTableFn,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { databaseSchema } from "../lib/database-schema";

const schemaName = databaseSchema();
// Explicit qualification is safe with transaction poolers: no session search_path.
const pgTable: PgTableFn<string | undefined> = schemaName === "public" ? publicTable : pgSchema(schemaName).table;

/* ------------------------------------------------------------------ */
/* Shared column helpers                                               */
/* ------------------------------------------------------------------ */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

/* ------------------------------------------------------------------ */
/* Tenancy: agencies + users + sessions                                */
/* ------------------------------------------------------------------ */

export const agencies = pgTable(
  "agencies",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    legalName: text("legal_name").notNull(),
    tradingName: text("trading_name"),
    email: text("email").notNull(),
    phone: text("phone"),
    addressLine: text("address_line"),
    city: text("city"),
    country: text("country"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED
    /** Prepaid wallet. Never negative (enforced by CHECK). Server-authoritative. */
    balance: money("balance").notNull().default("0"),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    billingName: text("billing_name"),
    billingEmail: text("billing_email"),
    billingTaxId: text("billing_tax_id"),
    /** White-label agency logo (storage key resolved through the storage provider). */
    logoKey: text("logo_key"),
    logoMime: text("logo_mime"),
    logoUploadedAt: timestamp("logo_uploaded_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    check("agencies_balance_nonnegative", sql`${t.balance} >= 0`),
    index("agencies_status_idx").on(t.status),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    /** SUPER_ADMIN | ADMIN | VISA_AGENT | ACCOUNTING | AGENCY_ADMIN | AGENCY_USER */
    role: text("role").notNull(),
    agencyId: uuid("agency_id").references(() => agencies.id),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    check(
      "users_role_agency_check",
      sql`(${t.role} in ('AGENCY_ADMIN','AGENCY_USER')) = (${t.agencyId} is not null)`,
    ),
    index("users_agency_idx").on(t.agencyId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Visa configuration (database-driven)                                */
/* ------------------------------------------------------------------ */

export const countries = pgTable(
  "countries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    iso2: char("iso2", { length: 2 }).notNull(),
    region: text("region"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [unique("countries_iso2_unique").on(t.iso2)],
);

export const visaCategories = pgTable(
  "visa_categories",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
);

export const visaTypes = pgTable(
  "visa_types",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => visaCategories.id),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    description: text("description"),
    processingMinDays: integer("processing_min_days").notNull().default(5),
    processingMaxDays: integer("processing_max_days").notNull().default(15),
    fee: money("fee").notNull().default("0"),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("visa_types_country_idx").on(t.countryId),
    check("visa_types_processing_check", sql`${t.processingMinDays} <= ${t.processingMaxDays}`),
    check("visa_types_fee_nonnegative", sql`${t.fee} >= 0`),
  ],
);

export const documentTypes = pgTable(
  "document_types",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
);

export const visaRequirements = pgTable(
  "visa_requirements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    visaTypeId: uuid("visa_type_id")
      .notNull()
      .references(() => visaTypes.id, { onDelete: "cascade" }),
    documentTypeId: uuid("document_type_id")
      .notNull()
      .references(() => documentTypes.id),
    required: boolean("required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [unique("visa_requirements_unique").on(t.visaTypeId, t.documentTypeId)],
);

export const currencies = pgTable("currencies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: char("code", { length: 3 }).notNull().unique(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* Workflow configuration: statuses, transitions, priorities           */
/* ------------------------------------------------------------------ */

export const statuses = pgTable("statuses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  /** EN display label (configurable). */
  name: text("name").notNull(),
  /** Optional configured FR/AR display labels (null → canonical dictionary). */
  nameFr: text("name_fr"),
  nameAr: text("name_ar"),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isTerminal: boolean("is_terminal").notNull().default(false),
  /** true = application in this status is not yet charged/visible to staff as live work */
  isDraft: boolean("is_draft").notNull().default(false),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const statusTransitions = pgTable(
  "status_transitions",
  {
    fromStatusId: uuid("from_status_id")
      .notNull()
      .references(() => statuses.id, { onDelete: "cascade" }),
    toStatusId: uuid("to_status_id")
      .notNull()
      .references(() => statuses.id, { onDelete: "cascade" }),
    /** STAFF = internal roles only, AGENCY = agency roles, BOTH */
    scope: text("scope").notNull().default("STAFF"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.fromStatusId, t.toStatusId] })],
);

export const priorities = pgTable("priorities", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  weight: integer("weight").notNull().default(0),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* Applications, applicants, checklist                                 */
/* ------------------------------------------------------------------ */

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reference: text("reference").notNull().unique(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id),
    visaTypeId: uuid("visa_type_id")
      .notNull()
      .references(() => visaTypes.id),
    statusId: uuid("status_id")
      .notNull()
      .references(() => statuses.id),
    priorityId: uuid("priority_id")
      .notNull()
      .references(() => priorities.id),
    /* ---- immutable snapshots (historical integrity) ---- */
    visaTypeName: text("visa_type_name").notNull(),
    visaTypeCode: text("visa_type_code").notNull(),
    categoryName: text("category_name").notNull(),
    countryName: text("country_name").notNull(),
    fee: money("fee").notNull(),
    /** §17 — snapshot of the submitted price + the live effective price (after adjustments). */
    submittedPrice: money("submitted_price"),
    submittedCurrency: char("submitted_currency", { length: 3 }),
    effectivePrice: money("effective_price"),
    currency: char("currency", { length: 3 }).notNull(),
    processingMinDays: integer("processing_min_days").notNull(),
    processingMaxDays: integer("processing_max_days").notNull(),
    /* ----------------------------------------------------- */
    agencyNotes: text("agency_notes"),
    internalNotes: text("internal_notes"),
    createdBy: uuid("created_by").references(() => users.id),
    assignedTo: uuid("assigned_to").references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    decisionAt: timestamp("decision_at", { withTimezone: true }),
    overrideReason: text("override_reason"),
    overrideBy: uuid("override_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("applications_agency_idx").on(t.agencyId),
    index("applications_status_idx").on(t.statusId),
    index("applications_created_at_idx").on(t.createdAt),
  ],
);

export const applicants = pgTable(
  "applicants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    gender: text("gender"), // MALE | FEMALE | OTHER
    nationality: text("nationality").notNull(),
    passportNumber: text("passport_number").notNull(),
    passportIssueDate: date("passport_issue_date"),
    passportExpiryDate: date("passport_expiry_date").notNull(),
    email: text("email"),
    phone: text("phone"),
    addressLine: text("address_line"),
    city: text("city"),
    country: text("country"),
    ...timestamps,
  },
  (t) => [index("applicants_application_idx").on(t.applicationId)],
);

/**
 * Checklist is snapshotted per application from visa_requirements at creation,
 * then re-synced (additions only) while the application is still a draft,
 * preserving historical meaning of existing items.
 */
export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    documentTypeId: uuid("document_type_id").references(() => documentTypes.id),
    documentTypeName: text("document_type_name").notNull(),
    documentTypeCode: text("document_type_code").notNull(),
    required: boolean("required").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
    /** false = requirement was deactivated after application creation */
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("checklist_items_unique").on(t.applicationId, t.documentTypeCode),
    index("checklist_items_application_idx").on(t.applicationId),
  ],
);

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    applicantId: uuid("applicant_id").references(() => applicants.id, { onDelete: "set null" }),
    checklistItemId: uuid("checklist_item_id").references(() => checklistItems.id, {
      onDelete: "set null",
    }),
    documentTypeId: uuid("document_type_id")
      .notNull()
      .references(() => documentTypes.id),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    status: text("status").notNull().default("UPLOADED"), // UPLOADED | UNDER_REVIEW | ACCEPTED | REJECTED | RESUBMISSION_REQUIRED
    reviewNotes: text("review_notes"),
    rejectionReason: text("rejection_reason"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("documents_application_idx").on(t.applicationId),
    index("documents_status_idx").on(t.status),
    index("documents_storage_key_idx").on(t.storageKey),
  ],
);

/* ------------------------------------------------------------------ */
/* Wallet ledger                                                       */
/* ------------------------------------------------------------------ */

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    /** CREDIT | DEBIT | APPLICATION_CHARGE | COMMERCIAL_DISCOUNT | COMMERCIAL_SURCHARGE */
    type: text("type").notNull(),
    amount: money("amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    balanceBefore: money("balance_before").notNull(),
    balanceAfter: money("balance_after").notNull(),
    reason: text("reason").notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("wallet_transactions_agency_idx").on(t.agencyId, t.createdAt),
    check("wallet_tx_amount_positive", sql`${t.amount} > 0`),
    check(
      "wallet_tx_type_check",
      sql`${t.type} in ('CREDIT','DEBIT','APPLICATION_CHARGE','COMMERCIAL_DISCOUNT','COMMERCIAL_SURCHARGE')`,
    ),
  ],
);

/** Partial unique index created in migration: one APPLICATION_CHARGE per application. */

/** §17 — immutable staff price adjustments linked to their compensating wallet entries. */
export const applicationPriceAdjustments = pgTable(
  "application_price_adjustments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    /** DISCOUNT | SURCHARGE | REFUND */
    type: text("type").notNull(),
    amount: money("amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    reason: text("reason").notNull(),
    effectiveBefore: money("effective_before").notNull(),
    effectiveAfter: money("effective_after").notNull(),
    walletTransactionId: uuid("wallet_transaction_id")
      .notNull()
      .references(() => walletTransactions.id),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_adjustments_application_idx").on(t.applicationId, t.createdAt)],
);

export const applicationStatusHistory = pgTable(
  "application_status_history",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatusId: uuid("from_status_id").references(() => statuses.id),
    toStatusId: uuid("to_status_id")
      .notNull()
      .references(() => statuses.id),
    changedBy: uuid("changed_by").references(() => users.id),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_status_history_application_idx").on(t.applicationId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Notifications, communications, audit                                */
/* ------------------------------------------------------------------ */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const communications = pgTable(
  "communications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    /** INTERNAL = staff only, AGENCY = visible to the agency */
    visibility: text("visibility").notNull().default("AGENCY"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("communications_application_idx").on(t.applicationId, t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
    index("audit_logs_agency_idx").on(t.agencyId),
  ],
);

/* ------------------------------------------------------------------ */
/* Phase 2 — Public agency registration & approval workflow            */
/* ------------------------------------------------------------------ */

/**
 * An APPLICATION FOR PARTNERSHIP. Never grants access by itself:
 * agency_id / admin_user_id are written ONLY by the privileged,
 * transactional admin approval (see src/lib/registrations.ts).
 * Domain enums live in the dependency-free src/lib/registration-constants.ts
 * so client components can share them; they are re-exported here.
 */
export {
  REGISTRATION_STATUSES,
  REGISTRATION_BUSINESS_TYPES,
  REGISTRATION_DOCUMENT_CATEGORIES,
  type RegistrationStatus,
  type RegistrationBusinessType,
  type RegistrationDocumentCategory,
} from "../lib/registration-constants";

export const agencyRegistrations = pgTable(
  "agency_registrations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reference: text("reference").notNull().unique(),
    locale: text("locale").notNull().default("en"), // en | fr | ar
    /* company */
    legalName: text("legal_name").notNull(),
    tradingName: text("trading_name"),
    country: text("country").notNull(),
    region: text("region"),
    city: text("city").notNull(),
    addressLine: text("address_line").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(), // normalized lowercase
    website: text("website"),
    commercialRegistrationNumber: text("commercial_registration_number").notNull(),
    taxId: text("tax_id"),
    licenceNumber: text("licence_number"),
    /* primary contact */
    contactFirstName: text("contact_first_name").notNull(),
    contactLastName: text("contact_last_name").notNull(),
    contactPosition: text("contact_position").notNull(),
    contactEmail: text("contact_email").notNull(), // normalized lowercase
    contactPhone: text("contact_phone").notNull(),
    /* business profile */
    businessType: text("business_type").notNull(),
    monthlyVolume: text("monthly_volume"),
    mainMarkets: text("main_markets"),
    message: text("message"),
    /* consent */
    termsAccepted: boolean("terms_accepted").notNull().default(false),
    privacyAcknowledged: boolean("privacy_acknowledged").notNull().default(false),
    infoConfirmed: boolean("info_confirmed").notNull().default(false),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    /* workflow */
    status: text("status").notNull().default("PENDING"),
    internalNotes: text("internal_notes"),
    rejectionReason: text("rejection_reason"),
    /* set ONLY by the privileged approval transaction */
    agencyId: uuid("agency_id").references(() => agencies.id),
    adminUserId: uuid("admin_user_id").references(() => users.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    ...timestamps,
  },
  (t) => [
    check(
      "agency_registrations_status_check",
      sql`${t.status} in ('PENDING','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','APPROVED','REJECTED')`,
    ),
    check(
      "agency_registrations_consent_check",
      sql`${t.termsAccepted} and ${t.privacyAcknowledged} and ${t.infoConfirmed}`,
    ),
    index("agency_registrations_status_idx").on(t.status),
    index("agency_registrations_created_idx").on(t.createdAt),
  ],
);

export const agencyRegistrationDocuments = pgTable(
  "agency_registration_documents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => agencyRegistrations.id),
    category: text("category").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "agency_registration_documents_category_check",
      sql`${t.category} in ('COMMERCIAL_REGISTRATION','AGENCY_LICENCE','TAX_DOCUMENT','OTHER')`,
    ),
    index("agency_registration_documents_registration_idx").on(t.registrationId),
  ],
);

export const agencyRegistrationHistory = pgTable(
  "agency_registration_history",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => agencyRegistrations.id),
    kind: text("kind").notNull().default("STATUS"), // STATUS | NOTE | INFO_REQUEST
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actorId: uuid("actor_id").references(() => users.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agency_registration_history_registration_idx").on(t.registrationId, t.createdAt)],
);

/** Single-use, expiring, hashed activation tokens (set-password flow). */
export const accountActivationTokens = pgTable(
  "account_activation_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    purpose: text("purpose").notNull().default("AGENCY_ADMIN_ACTIVATION"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_activation_tokens_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* CMS / site settings                                                 */
/* ------------------------------------------------------------------ */

export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Secure document blob storage (provider: "db")                       */
/* ------------------------------------------------------------------ */


const bytea = customType<{ data: Buffer; notNull: true; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const documentBlobs = pgTable(
  "document_blobs",
  {
    key: text("key").primaryKey(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/* ------------------------------------------------------------------ */
/* Convenience types                                                   */
/* ------------------------------------------------------------------ */

export type Agency = typeof agencies.$inferSelect;
export type User = typeof users.$inferSelect;
export type Country = typeof countries.$inferSelect;
export type VisaCategory = typeof visaCategories.$inferSelect;
export type VisaType = typeof visaTypes.$inferSelect;
export type DocumentType = typeof documentTypes.$inferSelect;
export type VisaRequirement = typeof visaRequirements.$inferSelect;
export type Currency = typeof currencies.$inferSelect;
export type Status = typeof statuses.$inferSelect;
export type Priority = typeof priorities.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type Applicant = typeof applicants.$inferSelect;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Communication = typeof communications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type AgencyRegistration = typeof agencyRegistrations.$inferSelect;
export type AgencyRegistrationDocument = typeof agencyRegistrationDocuments.$inferSelect;
export type AgencyRegistrationHistoryEntry = typeof agencyRegistrationHistory.$inferSelect;
export type AccountActivationToken = typeof accountActivationTokens.$inferSelect;
export type SiteSetting = typeof siteSettings.$inferSelect;
