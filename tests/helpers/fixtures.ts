/**
 * Deterministic test fixtures: workflow config, visa catalogue, staff,
 * two agencies (A/B) with users. Inserted into a freshly migrated database.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencies,
  currencies,
  countries,
  documentTypes,
  priorities,
  statusTransitions,
  statuses,
  users,
  visaCategories,
  visaRequirements,
  visaTypes,
} from "@/db/schema";
import { hashPassword } from "@/lib/crypto";
import type { RegistrationData, RegistrationFileInput } from "@/lib/registrations";
import type { RegistrationDocumentCategory } from "@/db/schema";

/** Canonical Phase 2.2 workflow: 8 default statuses (+ CANCELLED). */
export const STATUS_CODES = {
  draft: "DRAFT",
  submitted: "SUBMITTED",
  docsChecking: "DOCUMENTS_CHECKING",
  docsRequested: "DOCUMENTS_REQUESTED",
  inProcess: "IN_PROCESS",
  embassySent: "EMBASSY_SENT",
  approved: "APPROVED",
  rejected: "REJECTED",
  cancelled: "CANCELLED",
} as const;

const STATUS_LABELS_FIXTURE: Record<string, { fr: string; ar: string }> = {
  DRAFT: { fr: "Brouillon", ar: "مسودة" },
  SUBMITTED: { fr: "Soumis", ar: "مقدَّم" },
  DOCUMENTS_CHECKING: { fr: "Vérification des documents", ar: "فحص المستندات" },
  DOCUMENTS_REQUESTED: { fr: "Documents demandés", ar: "مستندات مطلوبة" },
  IN_PROCESS: { fr: "En cours", ar: "قيد المعالجة" },
  EMBASSY_SENT: { fr: "Envoyé à l'ambassade", ar: "أُرسل إلى السفارة" },
  APPROVED: { fr: "Approuvé", ar: "مقبول" },
  REJECTED: { fr: "Refusé", ar: "مرفوض" },
  CANCELLED: { fr: "Annulé", ar: "ملغى" },
};

export async function seedFixtures(): Promise<void> {
  // workflow config
  const statusRows = await db
    .insert(statuses)
    .values(
      Object.values(STATUS_CODES).map((code, i) => ({
        code,
        nameFr: STATUS_LABELS_FIXTURE[code]?.fr ?? null,
        nameAr: STATUS_LABELS_FIXTURE[code]?.ar ?? null,
        name: code.replaceAll("_", " "),
        sortOrder: (i + 1) * 10,
        isTerminal: ["APPROVED", "REJECTED", "CANCELLED"].includes(code),
        isDraft: code === "DRAFT",
      })),
    )
    .onConflictDoNothing({ target: statuses.code })
    .returning();
  void statusRows;
  // Rows skipped by conflicts (concurrent boots) must still be resolvable —
  // always re-read the canonical set after the idempotent insert.
  const allStatuses = await db.select().from(statuses);
  const byCode = new Map(allStatuses.map((s) => [s.code, s]));
  const transitions: Array<[string, string, "STAFF" | "AGENCY" | "BOTH"]> = [
    ["DRAFT", "SUBMITTED", "BOTH"],
    ["DRAFT", "CANCELLED", "AGENCY"],
    ["SUBMITTED", "CANCELLED", "STAFF"],
    ["SUBMITTED", "DOCUMENTS_CHECKING", "STAFF"],
    ["DOCUMENTS_CHECKING", "DOCUMENTS_REQUESTED", "STAFF"],
    ["DOCUMENTS_CHECKING", "IN_PROCESS", "STAFF"],
    ["DOCUMENTS_REQUESTED", "DOCUMENTS_CHECKING", "STAFF"],
    ["IN_PROCESS", "EMBASSY_SENT", "STAFF"],
    // finals: graph-valid, but reachable ONLY via the decision workflow
    ["IN_PROCESS", "APPROVED", "STAFF"],
    ["IN_PROCESS", "REJECTED", "STAFF"],
    ["EMBASSY_SENT", "APPROVED", "STAFF"],
    ["EMBASSY_SENT", "REJECTED", "STAFF"],
  ];
  await db.insert(statusTransitions).values(
    transitions.map(([f, t, scope]) => ({ fromStatusId: byCode.get(f)!.id, toStatusId: byCode.get(t)!.id, scope })),
  );

  await db
    .insert(currencies)
    .values([
      { code: "DZD", name: "Algerian Dinar", symbol: "دج", sortOrder: 5 },
      { code: "EUR", name: "Euro", symbol: "€", sortOrder: 10 },
    ])
    .onConflictDoNothing({ target: currencies.code });

  await db.insert(priorities).values([
    { code: "STANDARD", name: "Standard", weight: 0, sortOrder: 10 },
    { code: "URGENT", name: "Urgent", weight: 5, sortOrder: 20 },
  ]);

  // catalogue
  const countryRows = await db
    .insert(countries)
    .values([
      { name: "France", iso2: "FR", region: "Europe", sortOrder: 10 },
      { name: "Japan", iso2: "JP", region: "Asia", sortOrder: 20 },
    ])
    .returning();
  const categoryRows = await db
    .insert(visaCategories)
    .values([
      { name: "Tourist", code: "TOURIST", sortOrder: 10 },
      { name: "Business", code: "BUSINESS", sortOrder: 20 },
    ])
    .returning();
  const docTypeRows = await db
    .insert(documentTypes)
    .values([
      { name: "Passport", code: "PASSPORT", sortOrder: 10 },
      { name: "Passport Photo", code: "PHOTO", sortOrder: 20 },
      { name: "Bank Statement", code: "BANK_STATEMENT", sortOrder: 30 },
      { name: "Flight Reservation", code: "FLIGHT_RESERVATION", sortOrder: 40 },
      { name: "Hotel Reservation", code: "HOTEL_RESERVATION", sortOrder: 50 },
      { name: "Travel Insurance", code: "INSURANCE", sortOrder: 60 },
      { name: "Issued Visa / Approval Decision", code: "DECISION_VISA_APPROVAL", sortOrder: 900 },
      { name: "Refusal / Rejection Decision Letter", code: "DECISION_REFUSAL_LETTER", sortOrder: 910 },
    ])
    .returning();
  const docByCode = new Map(docTypeRows.map((d) => [d.code, d]));

  const visaTypeRows = await db
    .insert(visaTypes)
    .values([
      {
        countryId: countryRows[0]!.id,
        categoryId: categoryRows[0]!.id,
        name: "France Schengen Tourist",
        code: "FR-SCH-TOUR",
        processingMinDays: 10,
        processingMaxDays: 25,
        fee: "120.00",
        currency: "DZD",
      },
      {
        countryId: countryRows[1]!.id,
        categoryId: categoryRows[1]!.id,
        name: "Japan Business Visa",
        code: "JP-BUS",
        processingMinDays: 5,
        processingMaxDays: 10,
        fee: "80.00",
        currency: "DZD",
      },
    ])
    .returning();
  if (visaTypeRows.length < 2) throw new Error("expected two visa types");
  const frVisa = visaTypeRows[0]!;
  const jpVisa = visaTypeRows[1]!;
  await db.insert(visaRequirements).values([
    { visaTypeId: frVisa.id, documentTypeId: docByCode.get("PASSPORT")!.id, required: true, sortOrder: 10 },
    { visaTypeId: frVisa.id, documentTypeId: docByCode.get("PHOTO")!.id, required: true, sortOrder: 20 },
    { visaTypeId: frVisa.id, documentTypeId: docByCode.get("BANK_STATEMENT")!.id, required: true, sortOrder: 30 },
    { visaTypeId: frVisa.id, documentTypeId: docByCode.get("FLIGHT_RESERVATION")!.id, required: false, sortOrder: 40 },
    { visaTypeId: jpVisa.id, documentTypeId: docByCode.get("PASSPORT")!.id, required: true, sortOrder: 10 },
    { visaTypeId: jpVisa.id, documentTypeId: docByCode.get("PHOTO")!.id, required: true, sortOrder: 20 },
  ]);

  // agencies
  const agencyRows = await db
    .insert(agencies)
    .values([
      {
        legalName: "Agency A Ltd",
        tradingName: "Agency A",
        email: "ops@agencya.example",
        city: "Casablanca",
        country: "Morocco",
        currency: "DZD",
        balance: "0",
      },
      {
        legalName: "Agency B Ltd",
        tradingName: "Agency B",
        email: "ops@agencyb.example",
        city: "London",
        country: "United Kingdom",
        currency: "DZD",
        balance: "0",
      },
    ])
    .returning();

  // users
  const pw = await hashPassword("Test-Password-123");
  await db.insert(users).values([
    { email: "superadmin@test.example", passwordHash: pw, name: "Super Admin", role: "SUPER_ADMIN" },
    { email: "admin@test.example", passwordHash: pw, name: "Back Admin", role: "ADMIN" },
    { email: "agent@test.example", passwordHash: pw, name: "Visa Agent", role: "VISA_AGENT" },
    { email: "accounting@test.example", passwordHash: pw, name: "Accounting", role: "ACCOUNTING" },
    { email: "a-admin@test.example", passwordHash: pw, name: "A Admin", role: "AGENCY_ADMIN", agencyId: agencyRows[0]!.id },
    { email: "a-user@test.example", passwordHash: pw, name: "A User", role: "AGENCY_USER", agencyId: agencyRows[0]!.id },
    { email: "b-admin@test.example", passwordHash: pw, name: "B Admin", role: "AGENCY_ADMIN", agencyId: agencyRows[1]!.id },
    { email: "b-user@test.example", passwordHash: pw, name: "B User", role: "AGENCY_USER", agencyId: agencyRows[1]!.id },
  ]);
}

export function authUser(overrides: {
  id: string;
  email: string;
  name?: string;
  role: string;
  agencyId?: string | null;
}) {
  return {
    id: overrides.id,
    email: overrides.email,
    name: overrides.name ?? overrides.email,
    role: overrides.role as never,
    agencyId: overrides.agencyId ?? null,
    userStatus: "ACTIVE",
    agencyStatus: overrides.agencyId ? "ACTIVE" : null,
    agencyName: null,
  };
}

/** Resolve a seeded document type id by its stable code. */
export async function documentTypeIdByCode(code: string): Promise<string> {
  const rows = await db.select({ id: documentTypes.id }).from(documentTypes).where(eq(documentTypes.code, code)).limit(1);
  const row = rows[0];
  if (!row) throw new Error(`document type not seeded: ${code}`);
  return row.id;
}

export async function userByEmail(email: string) {
  const rows = await db.select().from(users);
  const u = rows.find((r) => r.email === email)!;
  return authUser({ id: u.id, email: u.email, name: u.name, role: u.role, agencyId: u.agencyId });
}

export async function agencyByEmail(email: string) {
  const rows = await db.select().from(agencies);
  return rows.find((a) => a.email === email)!;
}

/* ------------------------------------------------------------------ */
/* Phase 2 — agency registration fixtures                              */
/* ------------------------------------------------------------------ */

let registrationSeq = 0;

/** Unique-per-call valid registration payload (already validated shape). */
export function registrationData(overrides: Partial<RegistrationData> = {}): RegistrationData {
  registrationSeq += 1;
  const n = registrationSeq;
  return {
    legalName: `Voyageurs Monde ${n} SARL`,
    tradingName: `Voyageurs Monde ${n}`,
    country: "Algeria",
    region: "Alger",
    city: "Algiers",
    addressLine: `${10 + n} Rue Didouche Mourad`,
    phone: "+213 21 00 00 00",
    email: `ops@voyageurs-${n}.example`,
    website: `https://www.voyageurs-${n}.example`,
    commercialRegistrationNumber: `RC-16-${90000 + n}`,
    taxId: `NIF-${90000 + n}`,
    licenceNumber: `LIC-${2020 + n}`,
    contactFirstName: "Amine",
    contactLastName: `Benali${n}`,
    contactPosition: "General Manager",
    contactEmail: `amine.benali${n}@voyageurs-${n}.example`,
    contactPhone: "+213 550 00 00 00",
    businessType: "TRAVEL_AGENCY",
    monthlyVolume: "11-50",
    mainMarkets: "Schengen, United Kingdom",
    message: "Growing agency seeking wholesale visa processing.",
    terms: "true",
    privacy: "true",
    accuracy: "true",
    locale: "en",
    ...overrides,
  };
}

/** A magic-bytes-valid PDF registration document. */
export function registrationPdf(
  category: RegistrationDocumentCategory = "COMMERCIAL_REGISTRATION",
  name = "registre-commerce.pdf",
): RegistrationFileInput {
  const data = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
  return { category, name, type: "application/pdf", size: data.length, data };
}

let ipSeq = 0;

/** Unique source IP per call — keeps rate-limit heuristics isolated per test. */
export function nextIp(): string {
  ipSeq += 1;
  return `10.77.${Math.floor(ipSeq / 240)}.${ipSeq % 240}`;
}
