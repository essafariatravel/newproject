import { afterEach, describe, expect, it, vi } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();
afterEach(() => vi.restoreAllMocks());

import { db } from "@/lib/db";
import {
  agencyRegistrationDocuments,
  agencyRegistrationHistory,
  agencyRegistrations,
  agencies,
  auditLogs,
  documentBlobs,
  notifications,
  users,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  assertRegistrationRateLimit,
  fieldErrorsFrom,
  registrationFormSchema,
  submitAgencyRegistration,
  validateRegistrationFile,
} from "@/lib/registrations";
import { registrationCopy } from "@/lib/i18n";
import { submitRegistrationAction } from "@/app/actions/registrations";
import { nextIp, registrationData, registrationPdf } from "./helpers/fixtures";

const schemaEn = registrationFormSchema(registrationCopy("en").errors);

function parseOrThrow(input: unknown) {
  const parsed = schemaEn.safeParse(input);
  if (!parsed.success) throw new Error(`fixture should parse: ${parsed.error.message}`);
  return parsed.data;
}

async function countRegistrations(): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(agencyRegistrations);
  return rows[0]?.n ?? 0;
}

describe("public agency registration — validation", () => {
  it("rejects missing required fields with localized field errors", () => {
    const parsed = schemaEn.safeParse({});
    expect(parsed.success).toBe(false);
    const fieldErrors = fieldErrorsFrom(parsed.error!);
    for (const key of [
      "legalName", "country", "city", "addressLine", "phone", "email",
      "commercialRegistrationNumber", "contactFirstName", "contactLastName",
      "contactPosition", "contactEmail", "contactPhone", "businessType",
      "terms", "privacy", "accuracy",
    ]) {
      expect(fieldErrors[key], `missing error for ${key}`).toBeTruthy();
    }
    const schemaFr = registrationFormSchema(registrationCopy("fr").errors);
    const fr = schemaFr.safeParse({});
    const frErrors = fieldErrorsFrom(fr.error!);
    expect(frErrors.legalName).toBe("Ce champ est obligatoire.");
    const schemaAr = registrationFormSchema(registrationCopy("ar").errors);
    const ar = schemaAr.safeParse({});
    const arErrors = fieldErrorsFrom(ar.error!);
    expect(arErrors.legalName).toBe("هذا الحقل إلزامي.");
  });

  it("rejects invalid emails and normalizes valid ones", () => {
    const bad = schemaEn.safeParse({ ...registrationData(), contactEmail: "not-an-email" });
    expect(bad.success).toBe(false);
    expect(fieldErrorsFrom(bad.error!).contactEmail).toBeTruthy();

    const good = parseOrThrow({
      ...registrationData(),
      email: "  MixedCase@TestVoyages.example ",
      contactEmail: "Amine.Benali@TestVoyages.example",
    });
    expect(good.email).toBe("mixedcase@testvoyages.example");
    expect(good.contactEmail).toBe("amine.benali@testvoyages.example");
  });

  it("rejects invalid websites", () => {
    const bad = schemaEn.safeParse({ ...registrationData(), website: "https://!!! invalid url" });
    expect(bad.success).toBe(false);
    expect(fieldErrorsFrom(bad.error!).website).toBeTruthy();
  });

  it("strips control characters and caps oversized values (malicious input)", () => {
    const probe = "Best<script>alert(1)</script>" + String.fromCharCode(7) + " Voyages";
    const clean = parseOrThrow({
      ...registrationData(),
      legalName: probe,
      message: "line one\nline two",
    });
    expect(clean.legalName).not.toBe(probe);
    expect(clean.legalName).not.toMatch(/[\u0000-\u001F]/);
    expect(clean.message).toBe("line one\nline two"); // legitimate newlines survive
    expect(clean.legalName).toContain("<script>"); // stored as inert text; React escapes on render

    const huge = schemaEn.safeParse({ ...registrationData(), legalName: "x".repeat(5000) });
    expect(huge.success).toBe(false);
    expect(fieldErrorsFrom(huge.error!).legalName).toBeTruthy();
  });

  it("mass-assignment: privileged keys are stripped from the public input model", () => {
    const parsed = parseOrThrow({
      ...registrationData(),
      role: "SUPER_ADMIN",
      permissions: "all",
      agencyId: "11111111-1111-1111-1111-111111111111",
      status: "APPROVED",
      balance: "999999",
      credit: "5000",
      internalNotes: "hacked",
      reviewedBy: "22222222-2222-2222-2222-222222222222",
    });
    for (const forbidden of ["role", "permissions", "agencyId", "status", "balance", "credit", "internalNotes", "reviewedBy"]) {
      expect(forbidden in parsed, `${forbidden} must not survive parsing`).toBe(false);
    }
  });
});

describe("public agency registration — document safety", () => {
  it("rejects oversized files", () => {
    expect(() =>
      validateRegistrationFile({
        category: "OTHER",
        name: "big.pdf",
        type: "application/pdf",
        size: 10 * 1024 * 1024 + 1,
        data: Buffer.alloc(11),
      }),
    ).toThrowError(expect.objectContaining({ code: "FILE_TOO_LARGE" }) as Error);
  });

  it("rejects unsupported MIME types", () => {
    expect(() =>
      validateRegistrationFile({
        category: "OTHER",
        name: "page.html",
        type: "text/html",
        size: 11,
        data: Buffer.from("<script></script>"),
      }),
    ).toThrowError(expect.objectContaining({ code: "FILE_TYPE" }) as Error);
  });

  it("rejects content that does not match the declared type (magic bytes)", () => {
    const fakePdf = {
      category: "COMMERCIAL_REGISTRATION" as const,
      name: "fake.pdf",
      type: "application/pdf",
      size: 24,
      data: Buffer.from("this is plain text, not a pdf"),
    };
    expect(() => validateRegistrationFile(fakePdf)).toThrowError(
      expect.objectContaining({ code: "FILE_CONTENT" }) as Error,
    );
  });

  it("rejects path-like file names", () => {
    expect(() =>
      validateRegistrationFile({ ...registrationPdf(), name: "../../etc/passwd" }),
    ).toThrowError(expect.objectContaining({ code: "FILE_NAME" }) as Error);
  });

  it("accepts a real PDF upload through the service and stores it privately", async () => {
    const before = await countRegistrations();
    const data = registrationData({ locale: "fr" });
    const files = [registrationPdf("COMMERCIAL_REGISTRATION"), registrationPdf("AGENCY_LICENCE", "licence-agence.pdf")];
    const result = await submitAgencyRegistration({ data, files, ipAddress: nextIp() });
    expect(result.reference).toMatch(/^AGR-\d{4}-[A-Z0-9]{6}$/);
    expect(await countRegistrations()).toBe(before + 1);

    const reg = (await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, result.id)))[0]!;
    expect(reg.status).toBe("PENDING");
    expect(reg.locale).toBe("fr");
    expect(reg.termsAccepted && reg.privacyAcknowledged && reg.infoConfirmed).toBe(true);
    expect(reg.consentedAt).not.toBeNull();
    // nothing privileged was created
    expect(reg.agencyId).toBeNull();
    expect(reg.adminUserId).toBeNull();
    expect(reg.internalNotes).toBeNull();
    expect(reg.rejectionReason).toBeNull();

    const docs = await db
      .select()
      .from(agencyRegistrationDocuments)
      .where(eq(agencyRegistrationDocuments.registrationId, result.id));
    expect(docs).toHaveLength(2);
    const blobs = await db.select().from(documentBlobs).where(eq(documentBlobs.key, docs[0]!.storageKey));
    expect(blobs).toHaveLength(1);
    expect(blobs[0]!.data.subarray(0, 4).toString("latin1")).toBe("%PDF");

    const history = await db
      .select()
      .from(agencyRegistrationHistory)
      .where(eq(agencyRegistrationHistory.registrationId, result.id));
    expect(history).toHaveLength(1);
    expect(history[0]!.toStatus).toBe("PENDING");
    expect(history[0]!.actorId).toBeNull();

    // staff were notified through the existing notification mechanism
    const notifs = await db
      .select()
      .from(notifications)
      .innerJoin(users, eq(notifications.userId, users.id))
      .where(eq(notifications.type, "REGISTRATION_SUBMITTED"));
    const roles = new Set(notifs.map((n) => n.users.role));
    expect(roles.has("SUPER_ADMIN")).toBe(true);
    expect(roles.has("ADMIN")).toBe(true);
    expect(roles.has("ACCOUNTING")).toBe(false);

    const audit = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "AGENCY_REGISTRATION_SUBMITTED"));
    expect(audit.some((a) => a.entityId === result.id && a.actorId === null)).toBe(true);

    // no agency, no user, no wallet activity was created by a public submission
    const createdAgencies = await db
      .select()
      .from(agencies)
      .where(sql`lower(${agencies.legalName}) = lower(${data.legalName})`);
    expect(createdAgencies).toHaveLength(0);
    const createdUsers = await db.select().from(users).where(eq(users.email, data.contactEmail));
    expect(createdUsers).toHaveLength(0);
  });
});

describe("public agency registration — duplicates & rate limiting", () => {
  it("blocks a duplicate submission (same contact email while in flight)", async () => {
    const data = registrationData();
    await submitAgencyRegistration({ data, files: [], ipAddress: nextIp() });
    await expect(
      submitAgencyRegistration({ data: registrationData({ contactEmail: data.contactEmail, email: "other@company.example", legalName: "Completely Different Name SARL", commercialRegistrationNumber: "RC-OTHER-1" }), files: [], ipAddress: nextIp() }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });

    await expect(
      submitAgencyRegistration({ data: registrationData({ legalName: data.legalName }), files: [], ipAddress: nextIp() }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("blocks emails that already belong to platform users", async () => {
    await expect(
      submitAgencyRegistration({ data: registrationData({ contactEmail: "a-admin@test.example" }), files: [], ipAddress: nextIp() }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("blocks companies that already exist as partner agencies", async () => {
    await expect(
      submitAgencyRegistration({ data: registrationData({ legalName: "Agency A Ltd" }), files: [], ipAddress: nextIp() }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
    await expect(
      submitAgencyRegistration({ data: registrationData({ email: "ops@agencya.example" }), files: [], ipAddress: nextIp() }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("rate limits abusive velocity from one source IP", async () => {
    const ip = nextIp();
    for (let i = 0; i < 5; i += 1) {
      await submitAgencyRegistration({ data: registrationData(), files: [], ipAddress: ip });
    }
    await expect(
      submitAgencyRegistration({ data: registrationData(), files: [], ipAddress: ip }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(assertRegistrationRateLimit(ip)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("public registration action — anti-automation & safe errors", () => {
  function actionFormData(overrides: Record<string, string> = {}) {
    const data = registrationData();
    const form = new FormData();
    for (const [k, v] of Object.entries({
      ...data,
      locale: "en",
      renderedAt: String(Date.now() - 10_000),
      ...overrides,
    })) {
      if (typeof v === "string") form.set(k, v);
    }
    form.delete("locale"); // explicit below
    form.set("locale", overrides.locale ?? "en");
    return form;
  }

  it("silently discards honeypot submissions (bots learn nothing)", async () => {
    const before = await countRegistrations();
    await expect(submitRegistrationAction({}, actionFormData({ fax: "0049-555-123" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(await countRegistrations()).toBe(before);
    const spam = await db.select().from(auditLogs).where(eq(auditLogs.action, "AGENCY_REGISTRATION_SPAM"));
    expect(spam.length).toBeGreaterThan(0);
  });

  it("rejects inhuman submission speed", async () => {
    const form = actionFormData();
    form.set("renderedAt", String(Date.now()));
    const result = await submitRegistrationAction({}, form);
    expect(result.error).toBe(registrationCopy("en").errors.tooFast);
  });

  it("returns localized field errors (French) without creating a record", async () => {
    const before = await countRegistrations();
    const form = actionFormData({ locale: "fr", legalName: "", email: "bad" });
    form.delete("legalName");
    const result = await submitRegistrationAction({}, form);
    expect(result.fieldErrors?.legalName).toBe("Ce champ est obligatoire.");
    expect(result.fieldErrors?.email).toBeTruthy();
    expect(await countRegistrations()).toBe(before);
  });

  it("enforces consent at the database level as a final backstop", async () => {
    await expect(
      db.insert(agencyRegistrations).values({
        reference: "AGR-2099-TSTCON",
        legalName: "Constraint Probe SARL",
        country: "Algeria",
        city: "Algiers",
        addressLine: "/dev/null",
        phone: "+213",
        email: "probe@example.com",
        commercialRegistrationNumber: "RC-X",
        contactFirstName: "A",
        contactLastName: "B",
        contactPosition: "C",
        contactEmail: "probe@example.com",
        contactPhone: "+213",
        businessType: "OTHER",
        termsAccepted: false,
        privacyAcknowledged: true,
        infoConfirmed: true,
      }),
    ).rejects.toThrow();
  });
});
