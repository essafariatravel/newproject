/**
 * Deterministic, idempotent demo/development seed.
 *
 * - Configuration entities (currencies, statuses, transitions, priorities,
 *   countries, categories, document types, visa types, requirements) are
 *   inserted with ON CONFLICT — safe to run repeatedly.
 * - Staff and demo agency users/agencies are created only if absent.
 * - A small demo dataset (one submitted application) is created through the
 *   real service functions so the data is relationally valid.
 *
 * DEMO DATA IS CLEARLY SEPARATED FROM PRODUCTION: run this only in
 * development/demo environments.
 */
import "./lib/load-env";
import { databaseUrl } from "../src/lib/database-config";
import { hashPassword } from "../src/lib/crypto";
import { createDraftApplication, submitApplication } from "../src/lib/applications";
import { adjustWallet } from "../src/lib/wallet";
import { db, pool } from "../src/lib/db";
import {
  agencies,
  applicants,
  applications,
  countries,
  currencies,
  documentTypes,
  priorities,
  siteSettings,
  statusTransitions,
  statuses,
  users,
  visaCategories,
  visaRequirements,
  visaTypes,
} from "../src/db/schema";
import { eq, sql } from "drizzle-orm";
import type { AuthUser, Role } from "../src/lib/types";

type StatusSeed = {
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  isTerminal?: boolean;
  isDraft?: boolean;
};

const STATUS_SEED: StatusSeed[] = [
  { code: "DRAFT", name: "Draft", description: "Being prepared by the agency; not yet charged.", sortOrder: 10, isDraft: true },
  { code: "SUBMITTED", name: "Submitted", description: "Received by ESSAFARIA and charged.", sortOrder: 20 },
  { code: "DOCUMENTS_REQUIRED", name: "Documents Required", description: "Waiting for the agency to provide documents.", sortOrder: 30 },
  { code: "UNDER_REVIEW", name: "Under Review", description: "Documents and applicant data under review.", sortOrder: 40 },
  { code: "PROCESSING", name: "Processing", description: "Visa file is being processed.", sortOrder: 50 },
  { code: "EMBASSY_SUBMISSION", name: "Embassy Submission", description: "Submitted to the embassy / consulate.", sortOrder: 60 },
  { code: "AWAITING_DECISION", name: "Awaiting Decision", description: "Awaiting the embassy decision.", sortOrder: 70 },
  { code: "APPROVED", name: "Approved", description: "Visa approved.", sortOrder: 80 },
  { code: "REFUSED", name: "Refused", description: "Visa refused by the authority.", sortOrder: 90, isTerminal: true },
  { code: "COMPLETED", name: "Completed", description: "File closed and delivered.", sortOrder: 100, isTerminal: true },
  { code: "CANCELLED", name: "Cancelled", description: "Cancelled before processing finished.", sortOrder: 110, isTerminal: true },
];

const TRANSITIONS: Array<[string, string, "STAFF" | "AGENCY" | "BOTH"]> = [
  ["DRAFT", "SUBMITTED", "BOTH"],
  ["DRAFT", "CANCELLED", "AGENCY"],
  ["SUBMITTED", "DOCUMENTS_REQUIRED", "STAFF"],
  ["SUBMITTED", "UNDER_REVIEW", "STAFF"],
  ["SUBMITTED", "PROCESSING", "STAFF"],
  ["SUBMITTED", "CANCELLED", "STAFF"],
  ["DOCUMENTS_REQUIRED", "UNDER_REVIEW", "STAFF"],
  ["DOCUMENTS_REQUIRED", "CANCELLED", "STAFF"],
  ["UNDER_REVIEW", "DOCUMENTS_REQUIRED", "STAFF"],
  ["UNDER_REVIEW", "PROCESSING", "STAFF"],
  ["UNDER_REVIEW", "CANCELLED", "STAFF"],
  ["PROCESSING", "EMBASSY_SUBMISSION", "STAFF"],
  ["PROCESSING", "AWAITING_DECISION", "STAFF"],
  ["PROCESSING", "APPROVED", "STAFF"],
  ["PROCESSING", "REFUSED", "STAFF"],
  ["PROCESSING", "CANCELLED", "STAFF"],
  ["EMBASSY_SUBMISSION", "AWAITING_DECISION", "STAFF"],
  ["EMBASSY_SUBMISSION", "APPROVED", "STAFF"],
  ["EMBASSY_SUBMISSION", "REFUSED", "STAFF"],
  ["AWAITING_DECISION", "APPROVED", "STAFF"],
  ["AWAITING_DECISION", "REFUSED", "STAFF"],
  ["APPROVED", "COMPLETED", "STAFF"],
  ["REFUSED", "COMPLETED", "STAFF"],
];

const CURRENCIES = [
  { code: "EUR", name: "Euro", symbol: "€", sortOrder: 10 },
  { code: "USD", name: "US Dollar", symbol: "$", sortOrder: 20 },
  { code: "GBP", name: "British Pound", symbol: "£", sortOrder: 30 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", sortOrder: 40 },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", sortOrder: 50 },
];

const COUNTRIES = [
  { name: "France", iso2: "FR", region: "Europe", sortOrder: 10 },
  { name: "Germany", iso2: "DE", region: "Europe", sortOrder: 20 },
  { name: "Italy", iso2: "IT", region: "Europe", sortOrder: 30 },
  { name: "Spain", iso2: "ES", region: "Europe", sortOrder: 40 },
  { name: "Netherlands", iso2: "NL", region: "Europe", sortOrder: 50 },
  { name: "United Kingdom", iso2: "GB", region: "Europe", sortOrder: 60 },
  { name: "United States", iso2: "US", region: "Americas", sortOrder: 70 },
  { name: "Canada", iso2: "CA", region: "Americas", sortOrder: 80 },
  { name: "United Arab Emirates", iso2: "AE", region: "Middle East", sortOrder: 90 },
  { name: "Türkiye", iso2: "TR", region: "Middle East", sortOrder: 100 },
  { name: "China", iso2: "CN", region: "Asia", sortOrder: 110 },
  { name: "India", iso2: "IN", region: "Asia", sortOrder: 120 },
  { name: "Japan", iso2: "JP", region: "Asia", sortOrder: 130 },
  { name: "Morocco", iso2: "MA", region: "Africa", sortOrder: 140 },
  { name: "South Africa", iso2: "ZA", region: "Africa", sortOrder: 150 },
  { name: "Australia", iso2: "AU", region: "Oceania", sortOrder: 160 },
];

const CATEGORIES = [
  { name: "Tourist", code: "TOURIST", description: "Leisure and tourism travel.", sortOrder: 10 },
  { name: "Business", code: "BUSINESS", description: "Business meetings, fairs and corporate travel.", sortOrder: 20 },
  { name: "Student", code: "STUDENT", description: "Study and exchange programs.", sortOrder: 30 },
  { name: "Work", code: "WORK", description: "Employment and posted workers.", sortOrder: 40 },
  { name: "Transit", code: "TRANSIT", description: "Airport and seaport transit.", sortOrder: 50 },
  { name: "Family Visit", code: "FAMILY_VISIT", description: "Visiting family and friends.", sortOrder: 60 },
];

const DOCUMENT_TYPES = [
  { name: "Passport", code: "PASSPORT", description: "Valid passport bio page.", sortOrder: 10 },
  { name: "Passport Photo", code: "PHOTO", description: "Biometric photo per ICAO rules.", sortOrder: 20 },
  { name: "Bank Statement", code: "BANK_STATEMENT", description: "Last 3–6 months, stamped by the bank.", sortOrder: 30 },
  { name: "Hotel Reservation", code: "HOTEL_RESERVATION", description: "Confirmed accommodation booking.", sortOrder: 40 },
  { name: "Flight Reservation", code: "FLIGHT_RESERVATION", description: "Round-trip reservation or itinerary.", sortOrder: 50 },
  { name: "Travel Insurance", code: "INSURANCE", description: "Medical coverage per destination rules.", sortOrder: 60 },
  { name: "Employment Certificate", code: "EMPLOYMENT_CERT", description: "Employer letter with leave approval.", sortOrder: 70 },
  { name: "Invitation Letter", code: "INVITATION_LETTER", description: "Invitation from host or company.", sortOrder: 80 },
  { name: "Proof of Accommodation", code: "ACCOMMODATION_PROOF", description: "Utility bill or host declaration.", sortOrder: 90 },
  { name: "Marriage Certificate", code: "MARRIAGE_CERT", description: "For spousal applications.", sortOrder: 100 },
];

interface VisaTypeSeed {
  countryIso: string;
  categoryCode: string;
  name: string;
  code: string;
  description: string;
  minDays: number;
  maxDays: number;
  fee: string;
  currency: string;
  requirements: Array<[docCode: string, required: boolean, notes?: string]>;
}

const VISA_TYPES: VisaTypeSeed[] = [
  {
    countryIso: "FR", categoryCode: "TOURIST", name: "France Schengen Tourist Visa", code: "FR-SCH-TOUR",
    description: "Short-stay Schengen visa (up to 90 days) for tourism in France.",
    minDays: 10, maxDays: 25, fee: "120.00", currency: "EUR",
    requirements: [
      ["PASSPORT", true, "Valid 3+ months beyond return date, 2 blank pages."],
      ["PHOTO", true],
      ["BANK_STATEMENT", true, "Last 3 months."],
      ["HOTEL_RESERVATION", true],
      ["FLIGHT_RESERVATION", true],
      ["INSURANCE", true, "Minimum €30,000 medical coverage."],
      ["EMPLOYMENT_CERT", false],
      ["MARRIAGE_CERT", false],
    ],
  },
  {
    countryIso: "DE", categoryCode: "BUSINESS", name: "Germany Schengen Business Visa", code: "DE-SCH-BUS",
    description: "Short-stay Schengen visa for business meetings and trade fairs in Germany.",
    minDays: 10, maxDays: 30, fee: "120.00", currency: "EUR",
    requirements: [
      ["PASSPORT", true],
      ["PHOTO", true],
      ["INVITATION_LETTER", true, "From the German host company."],
      ["BANK_STATEMENT", true],
      ["FLIGHT_RESERVATION", true],
      ["INSURANCE", true],
      ["EMPLOYMENT_CERT", true],
    ],
  },
  {
    countryIso: "IT", categoryCode: "TOURIST", name: "Italy Schengen Tourist Visa", code: "IT-SCH-TOUR",
    description: "Short-stay Schengen visa for tourism in Italy.",
    minDays: 12, maxDays: 30, fee: "115.00", currency: "EUR",
    requirements: [
      ["PASSPORT", true],
      ["PHOTO", true],
      ["BANK_STATEMENT", true],
      ["HOTEL_RESERVATION", true],
      ["FLIGHT_RESERVATION", true],
      ["INSURANCE", true],
    ],
  },
  {
    countryIso: "US", categoryCode: "BUSINESS", name: "USA B1/B2 Visitor Visa", code: "US-B1B2",
    description: "US visitor visa for business (B1) or tourism (B2).",
    minDays: 20, maxDays: 60, fee: "220.00", currency: "USD",
    requirements: [
      ["PASSPORT", true],
      ["PHOTO", true, "5x5cm, white background."],
      ["BANK_STATEMENT", true],
      ["EMPLOYMENT_CERT", false],
      ["INVITATION_LETTER", false, "If visiting a company or family."],
    ],
  },
  {
    countryIso: "GB", categoryCode: "TOURIST", name: "UK Standard Visitor Visa", code: "GB-STD-VIS",
    description: "UK visitor visa for tourism, family visits or short business trips.",
    minDays: 15, maxDays: 30, fee: "160.00", currency: "GBP",
    requirements: [
      ["PASSPORT", true],
      ["BANK_STATEMENT", true],
      ["HOTEL_RESERVATION", true],
      ["FLIGHT_RESERVATION", true],
      ["EMPLOYMENT_CERT", false],
      ["ACCOMMODATION_PROOF", false],
    ],
  },
  {
    countryIso: "AE", categoryCode: "TOURIST", name: "UAE Tourist Visa (30 days)", code: "AE-TOUR-30",
    description: "30-day single-entry UAE tourist visa.",
    minDays: 3, maxDays: 7, fee: "95.00", currency: "USD",
    requirements: [
      ["PASSPORT", true],
      ["PHOTO", true],
      ["FLIGHT_RESERVATION", true],
      ["HOTEL_RESERVATION", false],
    ],
  },
  {
    countryIso: "TR", categoryCode: "TOURIST", name: "Türkiye Tourist e-Visa Support", code: "TR-TOUR",
    description: "Türkiye tourist visa application support service.",
    minDays: 3, maxDays: 10, fee: "80.00", currency: "EUR",
    requirements: [
      ["PASSPORT", true],
      ["HOTEL_RESERVATION", true],
      ["FLIGHT_RESERVATION", true],
    ],
  },
  {
    countryIso: "CN", categoryCode: "BUSINESS", name: "China M Visa (Business)", code: "CN-M-BUS",
    description: "China business visa for trade and commercial activities.",
    minDays: 7, maxDays: 15, fee: "180.00", currency: "USD",
    requirements: [
      ["PASSPORT", true],
      ["PHOTO", true],
      ["INVITATION_LETTER", true, "Government-authorized invitation required."],
      ["FLIGHT_RESERVATION", true],
      ["HOTEL_RESERVATION", true],
    ],
  },
];

const SITE_SETTINGS: Record<string, unknown> = {
  "brand.name": "ESSAFARIA TRAVEL",
  "brand.product": "ESSAFARIA VISA OS",
  "brand.tagline": "The operating system for professional visa processing.",
  "brand.description": "Enterprise-grade B2B visa processing for travel agencies, wholesalers and tour operators.",
  "site.contactEmail": "partners@essafaria.example",
  "site.contactPhone": "+212 5 00 00 00 00",
  "site.address": "Boulevard Mohammed V, Casablanca, Morocco",
  "site.social": { linkedin: "https://www.linkedin.com/company/essafaria", instagram: "", x: "" },
  "site.officeHours": "Monday – Friday, 09:00 – 18:00 (GMT+1)",
  "legal.privacy": "ESSAFARIA TRAVEL processes personal data of visa applicants strictly for the purpose of preparing and submitting visa applications, in line with applicable data protection law. Documents are stored encrypted at rest, access is restricted to authorized staff of the handling agency and ESSAFARIA operations team, and records are retained only as long as legally required. Applicants may request access, correction or deletion of their data via their agency.",
  "legal.terms": "These terms govern the B2B visa services provided by ESSAFARIA TRAVEL to partner agencies. 1. Services: ESSAFARIA reviews, prepares and submits visa applications on behalf of partner agencies. 2. Fees: each submitted application is charged against the agency prepaid wallet at the rate published in the platform configuration at the time of submission. 3. Wallet: balances are prepaid and non-interest bearing; refunds for cancelled files are issued as wallet credit. 4. Decisions: ESSAFARIA facilitates submission but does not influence consular decisions. 5. Liability: agencies remain responsible for the authenticity of applicant documents.",
};

async function seedStatuses() {
  for (const s of STATUS_SEED) {
    await db
      .insert(statuses)
      .values(s)
      .onConflictDoUpdate({
        target: statuses.code,
        set: { name: s.name, description: s.description, sortOrder: s.sortOrder, isTerminal: s.isTerminal ?? false, isDraft: s.isDraft ?? false },
      });
  }
  const all = await db.select().from(statuses);
  const byCode = new Map(all.map((s) => [s.code, s]));
  for (const [from, to, scope] of TRANSITIONS) {
    const f = byCode.get(from);
    const t = byCode.get(to);
    if (!f || !t) throw new Error(`Unknown transition status ${from} -> ${to}`);
    await db
      .insert(statusTransitions)
      .values({ fromStatusId: f.id, toStatusId: t.id, scope })
      .onConflictDoNothing();
  }
}

async function ensureUser(u: {
  email: string;
  password: string;
  name: string;
  role: string;
  agencyId?: string | null;
}) {
  const existing = await db.select().from(users).where(sql`lower(${users.email}) = lower(${u.email})`).limit(1);
  if (existing[0]) return existing[0];
  const hash = await hashPassword(u.password);
  const inserted = await db
    .insert(users)
    .values({ email: u.email, passwordHash: hash, name: u.name, role: u.role, agencyId: u.agencyId ?? null })
    .returning();
  return inserted[0]!;
}

async function ensureAgency(a: {
  legalName: string;
  tradingName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  balance?: string;
}) {
  const existing = await db.select().from(agencies).where(sql`lower(${agencies.legalName}) = lower(${a.legalName})`).limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(agencies)
    .values({
      legalName: a.legalName,
      tradingName: a.tradingName,
      email: a.email,
      phone: a.phone,
      city: a.city,
      country: a.country,
      balance: a.balance ?? "0",
      currency: "EUR",
      billingName: a.legalName,
      billingEmail: a.email,
    })
    .returning();
  return inserted[0]!;
}

async function main() {
  // VERCEL_ENV is the reliable production indicator: NODE_ENV is "production"
  // during EVERY Vercel build (Preview builds included), so checking NODE_ENV
  // here would also block the explicitly opted-in Preview demo seed.
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Demo seeding is disabled for Production deployments.");
  }
  const host = new URL(databaseUrl()).hostname;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (!local && (process.env.ALLOW_DEMO_SEED !== "true" ||
      !process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_AGENCY_PASSWORD ||
      process.env.SEED_ADMIN_PASSWORD === "Admin!2345" || process.env.SEED_AGENCY_PASSWORD === "Agency!2345")) {
    throw new Error("Remote demo seeding requires explicit ALLOW_DEMO_SEED=true and non-default SEED_ADMIN_PASSWORD / SEED_AGENCY_PASSWORD. Review the full demo dataset first.");
  }
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin!2345";
  const agencyPassword = process.env.SEED_AGENCY_PASSWORD ?? "Agency!2345";

  // --- configuration ---
  for (const c of CURRENCIES) {
    await db.insert(currencies).values(c).onConflictDoNothing();
  }
  await seedStatuses();
  for (const p of [
    { code: "STANDARD", name: "Standard", weight: 0, sortOrder: 10 },
    { code: "URGENT", name: "Urgent", weight: 5, sortOrder: 20 },
    { code: "EXPRESS", name: "Express", weight: 10, sortOrder: 30 },
  ]) {
    await db.insert(priorities).values(p).onConflictDoNothing();
  }
  for (const c of COUNTRIES) {
    await db.insert(countries).values(c).onConflictDoNothing();
  }
  for (const c of CATEGORIES) {
    await db.insert(visaCategories).values(c).onConflictDoNothing();
  }
  for (const d of DOCUMENT_TYPES) {
    await db.insert(documentTypes).values(d).onConflictDoNothing();
  }
  const countryRows = await db.select().from(countries);
  const categoryRows = await db.select().from(visaCategories);
  const docTypeRows = await db.select().from(documentTypes);
  const isoToCountry = new Map(countryRows.map((c) => [c.iso2, c]));
  const codeToCategory = new Map(categoryRows.map((c) => [c.code, c]));
  const codeToDocType = new Map(docTypeRows.map((d) => [d.code, d]));

  for (const vt of VISA_TYPES) {
    const country = isoToCountry.get(vt.countryIso);
    const category = codeToCategory.get(vt.categoryCode);
    if (!country || !category) throw new Error(`Missing country/category for ${vt.code}`);
    await db
      .insert(visaTypes)
      .values({
        countryId: country.id,
        categoryId: category.id,
        name: vt.name,
        code: vt.code,
        description: vt.description,
        processingMinDays: vt.minDays,
        processingMaxDays: vt.maxDays,
        fee: vt.fee,
        currency: vt.currency,
      })
      .onConflictDoNothing();
    const vtRow = (await db.select().from(visaTypes).where(eq(visaTypes.code, vt.code)).limit(1))[0]!;
    for (const [docCode, required, notes] of vt.requirements) {
      const dt = codeToDocType.get(docCode);
      if (!dt) throw new Error(`Missing document type ${docCode}`);
      await db
        .insert(visaRequirements)
        .values({ visaTypeId: vtRow.id, documentTypeId: dt.id, required, notes: notes ?? null, sortOrder: dt.sortOrder })
        .onConflictDoNothing();
    }
  }

  for (const [key, value] of Object.entries(SITE_SETTINGS)) {
    await db
      .insert(siteSettings)
      .values({ key, value: value as never })
      .onConflictDoNothing();
  }

  // --- staff users ---
  await ensureUser({ email: "superadmin@essafaria.example", password: adminPassword, name: "Amira El Fassi", role: "SUPER_ADMIN" });
  await ensureUser({ email: "admin@essafaria.example", password: adminPassword, name: "Youssef Benali", role: "ADMIN" });
  await ensureUser({ email: "agent@essafaria.example", password: adminPassword, name: "Salma Idrissi", role: "VISA_AGENT" });
  await ensureUser({ email: "accounting@essafaria.example", password: adminPassword, name: "Karim Ouazzani", role: "ACCOUNTING" });

  // --- demo agencies + users ---
  const agencyA = await ensureAgency({
    legalName: "Horizon Voyages SARL",
    tradingName: "Horizon Voyages",
    email: "ops@horizonvoyages.example",
    phone: "+212 5 22 00 00 01",
    city: "Casablanca",
    country: "Morocco",
  });
  const agencyB = await ensureAgency({
    legalName: "Atlas Travel Group Ltd",
    tradingName: "Atlas Travel Group",
    email: "visas@atlascgroup.example",
    phone: "+44 20 0000 0002",
    city: "London",
    country: "United Kingdom",
  });
  const agencyAdminA = await ensureUser({ email: "admin@horizonvoyages.example", password: agencyPassword, name: "Nadia Bennis", role: "AGENCY_ADMIN", agencyId: agencyA.id });
  await ensureUser({ email: "user@horizonvoyages.example", password: agencyPassword, name: "Omar Tazi", role: "AGENCY_USER", agencyId: agencyA.id });
  await ensureUser({ email: "admin@atlascgroup.example", password: agencyPassword, name: "James Whitfield", role: "AGENCY_ADMIN", agencyId: agencyB.id });

  // --- demo data: fund wallet + one submitted application (via real services) ---
  const demoRefExists = await db.execute(sql`select 1 from applications where reference = 'EVT-DEMO-0001' limit 1`);
  if (demoRefExists.rows.length === 0) {
    const superAdmin = (await db.select().from(users).where(sql`lower(${users.email}) = lower(${"superadmin@essafaria.example"})`).limit(1))[0]!;
    const visaType = (await db.select().from(visaTypes).where(eq(visaTypes.code, "FR-SCH-TOUR")).limit(1))[0]!;
    await adjustWallet({ agencyId: agencyA.id, amount: 2000, reason: "Initial demo funding", actor: { ...superAdmin, role: superAdmin.role as Role, userStatus: superAdmin.status, agencyStatus: null, agencyName: null } });
    const app = await createDraftApplication({
      agencyId: agencyA.id,
      visaTypeId: visaType.id,
      agencyNotes: "Honeymoon couple, departure in 6 weeks.",
      createdBy: { ...agencyAdminA, role: agencyAdminA.role as Role, userStatus: "ACTIVE", agencyStatus: "ACTIVE", agencyName: agencyA.legalName } as AuthUser,
    });
    await db.insert(applicants).values({
      applicationId: app.id,
      firstName: "Leila",
      lastName: "Haddad",
      dateOfBirth: "1992-04-18",
      gender: "FEMALE",
      nationality: "Moroccan",
      passportNumber: "AB1234567",
      passportIssueDate: "2023-02-01",
      passportExpiryDate: "2033-02-01",
      email: "leila.haddad@example.com",
      phone: "+212 6 00 00 00 03",
      city: "Casablanca",
      country: "Morocco",
    });
    const actor = { ...agencyAdminA, role: agencyAdminA.role as Role, userStatus: "ACTIVE", agencyStatus: "ACTIVE", agencyName: agencyA.legalName } as AuthUser;
    // Submit via the legitimate staff-override path (demo seed has no document files).
    await submitApplication({
      applicationId: app.id,
      actor: { ...superAdmin, role: superAdmin.role as Role, userStatus: "ACTIVE", agencyStatus: null, agencyName: null },
      overrideReason: "Demo seed dataset: showcase application created without physical document files.",
    });
    await db.update(applications).set({ reference: "EVT-DEMO-0001" }).where(eq(applications.id, app.id));
    await db.execute(sql`update wallet_transactions set reason = 'Visa application EVT-DEMO-0001' where application_id = ${app.id}`);
  }

  console.log("Seed complete.");
  console.log("  Staff logins   : superadmin@ / admin@ / agent@ / accounting@essafaria.example  (password from SEED_ADMIN_PASSWORD, default Admin!2345)");
  console.log("  Agency A logins: admin@ / user@horizonvoyages.example  (password from SEED_AGENCY_PASSWORD, default Agency!2345)");
  console.log("  Agency B login : admin@atlascgroup.example");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
