import { qualifiedTable } from "./database-schema";
/**
 * Read-model queries with server-side filtering and pagination.
 * Every query takes the authenticated user and enforces tenant scope.
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencies,
  agencyRegistrations,
  applicants,
  applications,
  auditLogs,
  communications,
  countries,
  currencies,
  documentTypes,
  documents,
  notifications,
  priorities,
  statuses,
  users,
  visaCategories,
  visaTypes,
  walletTransactions,
} from "@/db/schema";
import type { AuthUser } from "@/lib/types";

export const PAGE_SIZE = 20;

export interface ApplicationFilters {
  q?: string;
  agencyId?: string;
  countryId?: string;
  visaTypeId?: string;
  statusCode?: string;
  priorityCode?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  /** §25/§27 — ownership: "me" | "unassigned" | a staff user id. */
  assignedTo?: string;
  /** §27 — document workflow: open staff request, or a required doc still missing. */
  documents?: "requested" | "missing";
  /** §27/§31 — dossiers waiting at least N whole days in the current status. */
  agingDays?: number;
}

const applicationSelection = {
  app: applications,
  statusCode: statuses.code,
  statusName: statuses.name,
  priorityName: priorities.name,
  priorityWeight: priorities.weight,
  agencyName: sql<string>`(select coalesce(a.trading_name, a.legal_name) from ${sql.raw(qualifiedTable("agencies"))} a where a.id = applications.agency_id)`,
  // One application = one applicant (Phase 2-Final). Prefer the new
  // full_name column; legacy rows fall back to first/last composition.
  applicantSummary: sql<string>`(
    select coalesce(nullif(p.full_name, ''), nullif(concat_ws(' ', nullif(p.first_name, ''), nullif(p.last_name, '')), ''), '—')
      from ${sql.raw(qualifiedTable("applicants"))} p where p.application_id = applications.id limit 1
  )`,
  applicantCount: sql<number>`(select count(*)::int from ${sql.raw(qualifiedTable("applicants"))} p where p.application_id = applications.id)`,
  documentCount: sql<number>`(select count(*)::int from ${sql.raw(qualifiedTable("documents"))} d where d.application_id = applications.id)`,
  /** ISO-3166 code of the destination — localizes the name shown to the user (§53). */
  countryIso2: sql<string | null>`(select c.iso2 from ${sql.raw(qualifiedTable("countries"))} c where c.id = applications.country_id)`,
  /** §21/§31 — when this dossier entered its CURRENT status (real history). */
  statusSince: sql<string>`coalesce(
    (select max(h.created_at) from ${sql.raw(qualifiedTable("application_status_history"))} h
      where h.application_id = applications.id and h.to_status_id = applications.status_id),
    applications.created_at
  )`,
  /** §25 — the case officer currently owning the dossier (null = unassigned). */
  ownerName: sql<string | null>`(select u.name from ${sql.raw(qualifiedTable("users"))} u where u.id = applications.assigned_to)`,
};

export async function searchApplications(user: AuthUser, filters: ApplicationFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const conditions = [];

  if (user.agencyId) {
    conditions.push(eq(applications.agencyId, user.agencyId));
  } else if (filters.agencyId) {
    conditions.push(eq(applications.agencyId, filters.agencyId));
  }
  if (filters.countryId) conditions.push(eq(applications.countryId, filters.countryId));
  if (filters.visaTypeId) conditions.push(eq(applications.visaTypeId, filters.visaTypeId));
  if (filters.statusCode) {
    conditions.push(eq(statuses.code, filters.statusCode));
  } else if (user.agencyId) {
    // Bug 14 (Phase 2.3): the agency list defaults to ACTIVE workflow items.
    // Legacy DRAFT/CANCELLED rows stay in the DB untouched and remain
    // reachable only via an explicit status filter.
    conditions.push(notInArray(statuses.code, ["DRAFT", "CANCELLED"]));
  }
  if (filters.priorityCode) {
    const p = await db.select().from(priorities).where(eq(priorities.code, filters.priorityCode)).limit(1);
    if (p[0]) conditions.push(eq(applications.priorityId, p[0].id));
  }
  if (filters.dateFrom) conditions.push(gte(applications.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(applications.createdAt, new Date(`${filters.dateTo}T23:59:59`)));
  // §25/§27 — ownership scope.
  if (filters.assignedTo === "me") {
    conditions.push(eq(applications.assignedTo, user.id));
  } else if (filters.assignedTo === "unassigned") {
    conditions.push(isNull(applications.assignedTo));
  } else if (filters.assignedTo && UUID_RE.test(filters.assignedTo)) {
    conditions.push(eq(applications.assignedTo, filters.assignedTo));
  }
  // §27 — an OPEN staff document request is waiting on the agency.
  if (filters.documents === "requested") {
    conditions.push(
      sql`exists (select 1 from ${sql.raw(qualifiedTable("document_requests"))} dr
            where dr.application_id = applications.id and dr.status = 'OPEN')`,
    );
  }
  // §27 — a required, still-active checklist item without a usable upload.
  if (filters.documents === "missing") {
    conditions.push(
      sql`exists (select 1 from ${sql.raw(qualifiedTable("checklist_items"))} ci
            where ci.application_id = applications.id and ci.required and ci.active
              and not exists (select 1 from ${sql.raw(qualifiedTable("documents"))} d
                    where d.checklist_item_id = ci.id and d.status <> 'REJECTED'))`,
    );
  }
  // §27/§31 — waiting at least N whole days in the current status, from real history.
  if (filters.agingDays && filters.agingDays > 0) {
    conditions.push(
      sql`coalesce(
            (select max(h.created_at) from ${sql.raw(qualifiedTable("application_status_history"))} h
              where h.application_id = applications.id and h.to_status_id = applications.status_id),
            applications.created_at
          ) <= now() - (${filters.agingDays} || ' days')::interval`,
    );
  }
  if (filters.q) {
    const term = `%${filters.q.trim()}%`;
    conditions.push(
      or(
        ilike(applications.reference, term),
        ilike(applications.visaTypeName, term),
        ilike(applications.countryName, term),
        sql`exists (select 1 from ${sql.raw(qualifiedTable("applicants"))} p where p.application_id = applications.id
              and (coalesce(nullif(p.full_name, ''), p.first_name || ' ' || p.last_name) ilike ${term}
                or p.passport_number ilike ${term}))`,
      )!,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select(applicationSelection)
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .innerJoin(priorities, eq(applications.priorityId, priorities.id))
    .where(where)
    .orderBy(desc(applications.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const totalRows = await db
    .select({ total: count() })
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .where(where);
  const total = Number(totalRows[0]?.total ?? 0);

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** §18/§42 — embassy-stage applicability declared by the visa programme. */
export type EmbassyApplicability = "NOT_APPLICABLE" | "OPTIONAL" | "APPLICABLE";

export const EMBASSY_APPLICABILITY_VALUES: readonly EmbassyApplicability[] = [
  "NOT_APPLICABLE",
  "OPTIONAL",
  "APPLICABLE",
];

/**
 * Reads the embassy applicability of a visa programme. Unknown/missing rows
 * fail safe to OPTIONAL — the stage stays available exactly as before.
 */
export async function getEmbassyApplicability(visaTypeId: string | null | undefined): Promise<EmbassyApplicability> {
  if (!visaTypeId) return "OPTIONAL";
  const rows = await db
    .select({ value: visaTypes.embassyApplicability })
    .from(visaTypes)
    .where(eq(visaTypes.id, visaTypeId))
    .limit(1);
  const value = rows[0]?.value as EmbassyApplicability | undefined;
  return value && EMBASSY_APPLICABILITY_VALUES.includes(value) ? value : "OPTIONAL";
}

export async function getApplicationDetail(applicationId: string, user: AuthUser) {
  if (!UUID_RE.test(applicationId)) return null;
  if (user.agencyId) {
    const rows = await db
      .select(applicationSelection)
      .from(applications)
      .innerJoin(statuses, eq(applications.statusId, statuses.id))
      .innerJoin(priorities, eq(applications.priorityId, priorities.id))
      .where(and(eq(applications.id, applicationId), eq(applications.agencyId, user.agencyId)))
      .limit(1);
    return rows[0] ?? null;
  }
  const rows = await db
    .select(applicationSelection)
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .innerJoin(priorities, eq(applications.priorityId, priorities.id))
    .where(eq(applications.id, applicationId))
    .limit(1);
  return rows[0] ?? null;
}

/* ------------------------------ dashboards ------------------------------ */

export async function adminDashboard() {
  const statusCounts = await db
    .select({ code: statuses.code, name: statuses.name, total: count() })
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .groupBy(statuses.code, statuses.name, statuses.sortOrder)
    .orderBy(asc(statuses.sortOrder));

  const [totals] = await db
    .select({
      total: count(),
      pending: sql<number>`count(*) filter (where ${statuses.code} in ('SUBMITTED','DOCUMENTS_REQUESTED','DOCUMENTS_CHECKING'))::int`,
      processing: sql<number>`count(*) filter (where ${statuses.code} in ('IN_PROCESS','EMBASSY_SENT'))::int`,
      completed: sql<number>`count(*) filter (where ${statuses.code} in ('APPROVED','COMPLETED'))::int`,
      refused: sql<number>`count(*) filter (where ${statuses.code} in ('REJECTED','REFUSED'))::int`,
      missingDocs: sql<number>`count(*) filter (where ${statuses.code} = 'DOCUMENTS_REQUESTED')::int`,
      last30: sql<number>`count(*) filter (where ${applications.createdAt} > now() - interval '30 days')::int`,
      // Work queue metrics
      newApps: sql<number>`count(*) filter (where ${statuses.code} = 'SUBMITTED')::int`,
      docsChecking: sql<number>`count(*) filter (where ${statuses.code} = 'DOCUMENTS_CHECKING')::int`,
      docsRequested: sql<number>`count(*) filter (where ${statuses.code} = 'DOCUMENTS_REQUESTED')::int`,
      inProcess: sql<number>`count(*) filter (where ${statuses.code} = 'IN_PROCESS')::int`,
      embassySent: sql<number>`count(*) filter (where ${statuses.code} = 'EMBASSY_SENT')::int`,
      unassigned: sql<number>`count(*) filter (where ${applications.assignedTo} is null and ${statuses.code} not in ('APPROVED','REJECTED','COMPLETED','CANCELLED','REFUSED'))::int`,
      urgent: sql<number>`count(*) filter (where ${priorities.code} = 'URGENT' and ${statuses.code} not in ('APPROVED','REJECTED','COMPLETED','CANCELLED','REFUSED'))::int`,
      aging: sql<number>`count(*) filter (where ${applications.createdAt} < now() - interval '3 days' and ${statuses.code} not in ('APPROVED','REJECTED','COMPLETED','CANCELLED','REFUSED'))::int`,
    })
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .innerJoin(priorities, eq(applications.priorityId, priorities.id));

  const [agencyAgg] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${agencies.status} = 'ACTIVE')::int`,
      walletTotal: sql<string>`coalesce(sum(${agencies.balance}), 0)::text`,
    })
    .from(agencies);

  const [walletAgg] = await db
    .select({
      credits: sql<string>`coalesce(sum(${walletTransactions.amount}) filter (where ${walletTransactions.type} = 'CREDIT'), 0)::text`,
      charges: sql<string>`coalesce(sum(${walletTransactions.amount}) filter (where ${walletTransactions.type} = 'APPLICATION_CHARGE'), 0)::text`,
    })
    .from(walletTransactions);

  const recentApplications = await db
    .select(applicationSelection)
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .innerJoin(priorities, eq(applications.priorityId, priorities.id))
    .orderBy(desc(applications.createdAt))
    .limit(8);

  const recentAudit = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(8);

  const reviewQueue = await db
    .select({ total: count() })
    .from(documents)
    .where(inArray(documents.status, ["UPLOADED", "UNDER_REVIEW"]));

  const [pendingRegs] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${agencyRegistrations.status} = 'PENDING')::int`,
      inReview: sql<number>`count(*) filter (where ${agencyRegistrations.status} in ('UNDER_REVIEW','MORE_INFORMATION_REQUIRED'))::int`,
    })
    .from(agencyRegistrations);

  return {
    statusCounts,
    totals: totals!,
    agencyAgg: agencyAgg!,
    walletAgg: walletAgg!,
    recentApplications,
    recentAudit,
    documentsInReview: Number(reviewQueue[0]?.total ?? 0),
    pendingRegistrations: Number(pendingRegs?.pending ?? 0),
    registrationsInReview: Number(pendingRegs?.inReview ?? 0),
  };
}

export async function agencyDashboard(agencyId: string, userId: string) {
  const [totals] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${statuses.code} not in ('APPROVED','COMPLETED','CANCELLED','REJECTED','REFUSED') and ${statuses.code} <> 'DRAFT')::int`,
      completed: sql<number>`count(*) filter (where ${statuses.code} in ('APPROVED','COMPLETED'))::int`,
      refused: sql<number>`count(*) filter (where ${statuses.code} in ('REJECTED','REFUSED'))::int`,
      actionRequired: sql<number>`count(*) filter (where ${statuses.code} = 'DOCUMENTS_REQUESTED')::int`,
      drafts: sql<number>`count(*) filter (where ${statuses.code} = 'DRAFT')::int`,
    })
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .where(eq(applications.agencyId, agencyId));

  const [wallet] = await db
    .select({ balance: agencies.balance, currency: agencies.currency })
    .from(agencies)
    .where(eq(agencies.id, agencyId));

  const recentTx = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.agencyId, agencyId))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(5);

  const recentApplications = await db
    .select(applicationSelection)
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .innerJoin(priorities, eq(applications.priorityId, priorities.id))
    .where(eq(applications.agencyId, agencyId))
    .orderBy(desc(applications.createdAt))
    .limit(6);

  // Correction 1 (Phase 2-Final): ONE authoritative unread-count source —
  // unread notifications addressed to THIS USER (the same query that drives
  // the sidebar badge). The old agency-wide aggregate diverged from the
  // per-user mark-all-read action and could show stale counters.
  const unread = await unreadNotificationCount(userId);

  return {
    totals: totals!,
    wallet: wallet!,
    recentTx,
    recentApplications,
    unreadNotifications: unread,
  };
}

/* -------------------------------- reports ------------------------------- */

export async function reportData() {
  const byAgency = await db
    .select({
      agencyId: agencies.id,
      agencyName: sql<string>`coalesce(${agencies.tradingName}, ${agencies.legalName})`,
      total: count(applications.id),
      charged: sql<string>`coalesce(sum(${applications.fee}) filter (where ${applications.submittedAt} is not null), 0)::text`,
    })
    .from(agencies)
    .leftJoin(applications, eq(applications.agencyId, agencies.id))
    .groupBy(agencies.id)
    .orderBy(desc(count(applications.id)));

  const byCountry = await db
    .select({
      countryName: applications.countryName,
      total: count(),
      revenue: sql<string>`coalesce(sum(${applications.fee}) filter (where ${applications.submittedAt} is not null), 0)::text`,
    })
    .from(applications)
    .groupBy(applications.countryName)
    .orderBy(desc(count()));

  const byVisaType = await db
    .select({
      visaTypeName: applications.visaTypeName,
      total: count(),
    })
    .from(applications)
    .groupBy(applications.visaTypeName)
    .orderBy(desc(count()));

  const byStatus = await db
    .select({ statusCode: statuses.code, statusName: statuses.name, total: count() })
    .from(applications)
    .innerJoin(statuses, eq(applications.statusId, statuses.id))
    .groupBy(statuses.code, statuses.name, statuses.sortOrder)
    .orderBy(asc(statuses.sortOrder));

  const byPriority = await db
    .select({ priorityName: priorities.name, total: count() })
    .from(applications)
    .innerJoin(priorities, eq(applications.priorityId, priorities.id))
    .groupBy(priorities.name, priorities.weight)
    .orderBy(desc(priorities.weight));

  const docIssues = await db
    .select({ status: documents.status, total: count() })
    .from(documents)
    .where(inArray(documents.status, ["REJECTED", "RESUBMISSION_REQUIRED"]))
    .groupBy(documents.status);

  const [walletFlow] = await db
    .select({
      credits: sql<string>`coalesce(sum(${walletTransactions.amount}) filter (where ${walletTransactions.type} = 'CREDIT'), 0)::text`,
      debits: sql<string>`coalesce(sum(${walletTransactions.amount}) filter (where ${walletTransactions.type} = 'DEBIT'), 0)::text`,
      charges: sql<string>`coalesce(sum(${walletTransactions.amount}) filter (where ${walletTransactions.type} = 'APPLICATION_CHARGE'), 0)::text`,
    })
    .from(walletTransactions);

  const workload = await db
    .select({
      officer: users.name,
      assigned: count(applications.id),
    })
    .from(users)
    .leftJoin(applications, eq(applications.assignedTo, users.id))
    .where(inArray(users.role, ["SUPER_ADMIN", "ADMIN", "VISA_AGENT"]))
    .groupBy(users.id, users.name)
    .orderBy(desc(count(applications.id)));

  return { byAgency, byCountry, byVisaType, byStatus, byPriority, docIssues, walletFlow, workload };
}

/* ------------------------------ notifications --------------------------- */

export async function listNotificationsForUser(userId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const rows = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`));
  return Number(rows[0]?.total ?? 0);
}

/* ------------------------------ communications -------------------------- */

export async function listCommunications(applicationId: string, user: AuthUser) {
  const conditions = [eq(communications.applicationId, applicationId)];
  if (user.agencyId) {
    // agencies see only agency-visible messages
    conditions.push(eq(communications.visibility, "AGENCY"));
  }
  return db
    .select({
      message: communications,
      authorName: users.name,
      authorRole: users.role,
    })
    .from(communications)
    .innerJoin(users, eq(communications.authorId, users.id))
    .where(and(...conditions))
    .orderBy(asc(communications.createdAt));
}

export async function recentCommunications(limit = 30) {
  return db
    .select({
      message: communications,
      authorName: users.name,
      applicationReference: applications.reference,
      applicationId: applications.id,
      agencyName: sql<string>`(select coalesce(a.trading_name, a.legal_name) from ${sql.raw(qualifiedTable("agencies"))} a where a.id = applications.agency_id)`,
    })
    .from(communications)
    .innerJoin(users, eq(communications.authorId, users.id))
    .innerJoin(applications, eq(communications.applicationId, applications.id))
    .orderBy(desc(communications.createdAt))
    .limit(limit);
}

/* --------------------------------- config ------------------------------- */

export async function listCountries() {
  return db.select().from(countries).orderBy(asc(countries.sortOrder), asc(countries.name));
}

export async function listVisaCategories() {
  return db.select().from(visaCategories).orderBy(asc(visaCategories.sortOrder));
}

export async function listVisaTypesWithRelations() {
  return db
    .select({
      vt: visaTypes,
      countryName: countries.name,
      categoryName: visaCategories.name,
    })
    .from(visaTypes)
    .innerJoin(countries, eq(visaTypes.countryId, countries.id))
    .innerJoin(visaCategories, eq(visaTypes.categoryId, visaCategories.id))
    .orderBy(asc(countries.name), asc(visaTypes.name));
}

export async function listDocumentTypes() {
  return db.select().from(documentTypes).orderBy(asc(documentTypes.sortOrder));
}

export async function listCurrencies() {
  return db.select().from(currencies).orderBy(asc(currencies.sortOrder));
}

export async function activeVisaOptions() {
  return db
    .select({
      id: visaTypes.id,
      label: sql<string>`${countries.name} || ' — ' || ${visaTypes.name}`,
      name: visaTypes.name,
      countryName: countries.name,
      /** ISO-3166 code — lets the UI localize the destination name (§53). */
      countryIso2: countries.iso2,
      categoryName: visaCategories.name,
      description: visaTypes.description,
      fee: visaTypes.fee,
      currency: visaTypes.currency,
      minDays: visaTypes.processingMinDays,
      maxDays: visaTypes.processingMaxDays,
      embassyApplicability: visaTypes.embassyApplicability,
      countryId: visaTypes.countryId,
    })
    .from(visaTypes)
    .innerJoin(countries, eq(visaTypes.countryId, countries.id))
    .innerJoin(visaCategories, eq(visaTypes.categoryId, visaCategories.id))
    // Bookable = active programme + active destination + DZD price (§7/§13):
    // a non-DZD price is configuration debt, never something an agency can book.
    .where(and(eq(visaTypes.active, true), eq(countries.active, true), eq(visaTypes.currency, "DZD")))
    .orderBy(asc(countries.name), asc(visaTypes.name));
}

export async function listAgencies(q?: string) {
  const conditions = [];
  if (q) {
    const term = `%${q.trim()}%`;
    conditions.push(
      or(ilike(agencies.legalName, term), ilike(agencies.tradingName, term), ilike(agencies.email, term))!,
    );
  }
  return db
    .select({
      agency: agencies,
      userCount: sql<number>`(select count(*)::int from ${sql.raw(qualifiedTable("users"))} u where u.agency_id = agencies.id)`,
      applicationCount: sql<number>`(select count(*)::int from ${sql.raw(qualifiedTable("applications"))} ap where ap.agency_id = agencies.id)`,
    })
    .from(agencies)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(agencies.legalName));
}

export async function listUsers(q?: string, agencyId?: string) {
  const conditions = [];
  if (q) {
    const term = `%${q.trim()}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term))!);
  }
  if (agencyId) conditions.push(eq(users.agencyId, agencyId));
  return db
    .select({
      user: users,
      agencyName: sql<string | null>`(select coalesce(a.trading_name, a.legal_name) from ${sql.raw(qualifiedTable("agencies"))} a where a.id = users.agency_id)`,
    })
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(users.role), asc(users.name));
}

export async function listAuditLogs(filters: { q?: string; agencyId?: string; action?: string; page?: number }) {
  const page = Math.max(1, filters.page ?? 1);
  const conditions = [];
  if (filters.q) {
    const term = `%${filters.q.trim()}%`;
    conditions.push(or(ilike(auditLogs.action, term), ilike(auditLogs.entity, term), ilike(auditLogs.actorEmail, term))!);
  }
  if (filters.agencyId) conditions.push(eq(auditLogs.agencyId, filters.agencyId));
  if (filters.action) conditions.push(ilike(auditLogs.action, `%${filters.action}%`));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      log: auditLogs,
      agencyName: sql<string | null>`(select coalesce(a.trading_name, a.legal_name) from ${sql.raw(qualifiedTable("agencies"))} a where a.id = audit_logs.agency_id)`,
    })
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const totalRows = await db.select({ total: count() }).from(auditLogs).where(where);
  const total = Number(totalRows[0]?.total ?? 0);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export interface WalletLedgerFilters {
  agencyId?: string;
  /** CREDIT | DEBIT | APPLICATION_CHARGE | COMMERCIAL_DISCOUNT | COMMERCIAL_SURCHARGE */
  type?: string;
  /** Inclusive lower bound (transaction date). */
  from?: Date;
  /** Exclusive upper bound (transaction date). */
  to?: Date;
  /** Free text over the ledger reference, the application reference and the reason. */
  q?: string;
  page?: number;
  pageSize?: number;
}

/**
 * One ledger query for both sides of the platform — always tenant-scoped when
 * an agencyId is supplied, always server-side paginated (§57).
 */
export async function listWalletTransactions(filters: WalletLedgerFilters) {
  const pageSize = filters.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, filters.page ?? 1);
  const conditions = [];
  if (filters.agencyId) conditions.push(eq(walletTransactions.agencyId, filters.agencyId));
  if (filters.type) conditions.push(eq(walletTransactions.type, filters.type));
  if (filters.from) conditions.push(gte(walletTransactions.createdAt, filters.from));
  if (filters.to) conditions.push(lt(walletTransactions.createdAt, filters.to));
  if (filters.q?.trim()) {
    const term = `%${filters.q.trim()}%`;
    conditions.push(
      or(
        ilike(walletTransactions.reference, term),
        ilike(walletTransactions.reason, term),
        ilike(applications.reference, term),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select({
      tx: walletTransactions,
      agencyName: sql<string>`(select coalesce(a.trading_name, a.legal_name) from ${sql.raw(qualifiedTable("agencies"))} a where a.id = wallet_transactions.agency_id)`,
      applicationReference: applications.reference,
    })
    .from(walletTransactions)
    .leftJoin(applications, eq(walletTransactions.applicationId, applications.id))
    .where(where)
    .orderBy(desc(walletTransactions.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const totalRows = await db.select({ total: count() }).from(walletTransactions).leftJoin(applications, eq(walletTransactions.applicationId, applications.id)).where(where);
  const total = Number(totalRows[0]?.total ?? 0);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listAllDocuments(filters: { status?: string; q?: string; page?: number; agencyId?: string }) {
  const page = Math.max(1, filters.page ?? 1);
  const conditions = [];
  if (filters.status) conditions.push(eq(documents.status, filters.status));
  if (filters.agencyId) conditions.push(eq(applications.agencyId, filters.agencyId));
  if (filters.q) {
    const term = `%${filters.q.trim()}%`;
    conditions.push(or(ilike(documents.originalFilename, term), ilike(applications.reference, term))!);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select({
      doc: documents,
      applicationReference: applications.reference,
      agencyName: sql<string>`(select coalesce(a.trading_name, a.legal_name) from ${sql.raw(qualifiedTable("agencies"))} a where a.id = applications.agency_id)`,
      documentTypeName: documentTypes.name,
      reviewerName: sql<string | null>`(select u.name from ${sql.raw(qualifiedTable("users"))} u where u.id = documents.reviewed_by)`,
    })
    .from(documents)
    .innerJoin(applications, eq(documents.applicationId, applications.id))
    .innerJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id))
    .where(where)
    .orderBy(desc(documents.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const totalRows = await db
    .select({ total: count() })
    .from(documents)
    .innerJoin(applications, eq(documents.applicationId, applications.id))
    .where(where);
  const total = Number(totalRows[0]?.total ?? 0);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function listApplicants(filters: { q?: string; page?: number; agencyId?: string }) {
  const page = Math.max(1, filters.page ?? 1);
  const conditions = [];
  if (filters.agencyId) conditions.push(eq(applications.agencyId, filters.agencyId));
  if (filters.q) {
    const term = `%${filters.q.trim()}%`;
    conditions.push(
      or(ilike(applicants.firstName, term), ilike(applicants.lastName, term), ilike(applicants.passportNumber, term))!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select({
      applicant: applicants,
      applicationReference: applications.reference,
      applicationId: applications.id,
      agencyName: sql<string>`(select coalesce(a.trading_name, a.legal_name) from ${sql.raw(qualifiedTable("agencies"))} a where a.id = applications.agency_id)`,
    })
    .from(applicants)
    .innerJoin(applications, eq(applicants.applicationId, applications.id))
    .where(where)
    .orderBy(desc(applicants.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const totalRows = await db
    .select({ total: count() })
    .from(applicants)
    .innerJoin(applications, eq(applicants.applicationId, applications.id))
    .where(where);
  const total = Number(totalRows[0]?.total ?? 0);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
