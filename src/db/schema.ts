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
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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
  name: text("name").notNull(),
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
    /** CREDIT | DEBIT | APPLICATION_CHARGE */
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
      sql`${t.type} in ('CREDIT','DEBIT','APPLICATION_CHARGE')`,
    ),
  ],
);

/** Partial unique index created in migration: one APPLICATION_CHARGE per application. */

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
export type SiteSetting = typeof siteSettings.$inferSelect;
