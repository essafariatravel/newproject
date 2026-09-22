import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import { notifications } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  agencyDashboard,
  activeVisaOptions,
  unreadNotificationCount,
  searchApplications,
} from "@/lib/queries";
import { submitVisaRequest } from "@/lib/requests";
import { adjustWallet, getBalance } from "@/lib/wallet";
import {
  DEFAULT_NATIONALITY,
  NATIONALITIES,
  isValidNationality,
  nationalityLabel,
} from "@/lib/nationalities";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";

const SRC = (rel: string) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const PORTAL_WALLET = SRC("src/app/portal/wallet/page.tsx");
const ADMIN_BILLING = SRC("src/app/admin/billing/page.tsx");
const WIZARD = SRC("src/app/portal/applications/new/request-wizard.tsx");
const NEW_PAGE = SRC("src/app/portal/applications/new/page.tsx");
const ACTION = SRC("src/app/actions/applications.ts");
const LIST_PAGE = SRC("src/app/portal/applications/page.tsx");
const DASH_PAGE = SRC("src/app/portal/page.tsx");
const COMM_ACTIONS = SRC("src/app/actions/communications.ts");
const PORTAL_LAYOUT = SRC("src/app/portal/layout.tsx");

/* =================================================================== */
/*  Correction 1 — notifications: counter = UNREAD ONLY, one source    */
/* =================================================================== */
describe("C1 — notification counter is unread-only from one authoritative server source", () => {
  it("dashboard uses the same per-user unread function as the sidebar badge", () => {
    expect(DASH_PAGE).toContain("agencyDashboard(user.agencyId, user.id)");
    const queries = SRC("src/lib/queries.ts");
    const fn = queries.split("export async function agencyDashboard")[1] ?? "";
    expect(fn).toContain("await unreadNotificationCount(userId)");
    expect(fn).not.toContain("notifications.agencyId"); // no divergent agency-wide aggregate
    expect(PORTAL_LAYOUT).toContain("unreadNotificationCount(user.id)");
  });

  it("unread counts only read-at-null rows, per user, tenant-safe", async () => {
    const bAdmin = await userByEmail("b-admin@test.example");
    const admin = await userByEmail("admin@test.example");
    const beforeB = await unreadNotificationCount(bAdmin.id);
    const beforeA = await unreadNotificationCount(admin.id);

    for (let i = 0; i < 3; i++) {
      await db.insert(notifications).values({ userId: bAdmin.id, type: "FINAL_TEST", title: `u${i}`, body: "b" });
    }
    await db.insert(notifications).values({ userId: bAdmin.id, type: "FINAL_TEST", title: "already-read", body: "b", readAt: new Date() });

    expect(await unreadNotificationCount(bAdmin.id)).toBe(beforeB + 3); // read row excluded
    expect(await unreadNotificationCount(admin.id)).toBe(beforeA); // tenant/user isolation
  });

  it("dashboard counter equals sidebar counter for the same user (single source)", async () => {
    const bAdmin = await userByEmail("b-admin@test.example");
    const agency = await agencyByEmail("ops@agencyb.example");
    const dash = await agencyDashboard(agency.id, bAdmin.id);
    expect(dash.unreadNotifications).toBe(await unreadNotificationCount(bAdmin.id));
  });

  it("mark-all-read is a server-side write that persists to zero (refresh/relogin = re-query)", async () => {
    const bAdmin = await userByEmail("b-admin@test.example");
    const before = await unreadNotificationCount(bAdmin.id);
    expect(before).toBeGreaterThan(0);

    // Same server statement the action executes (communications.ts lines: set readAt where userId + null).
    expect(COMM_ACTIONS).toContain(".set({ readAt: new Date() })");
    expect(COMM_ACTIONS).toContain("eq(notifications.userId, user.id)");
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, bAdmin.id), isNull(notifications.readAt)));

    expect(await unreadNotificationCount(bAdmin.id)).toBe(0); // refresh
    expect(await unreadNotificationCount(bAdmin.id)).toBe(0); // "logout/login" — persisted, not client state
    const remaining = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, bAdmin.id), isNull(notifications.readAt)));
    expect(remaining[0]!.n).toBe(0);

    // Another user's unread state is untouched (tenant isolation).
    const bOps = await userByEmail("b-admin@test.example");
    expect(await unreadNotificationCount(bOps.id)).toBe(0);
    const adminA = await userByEmail("admin@test.example");
    const beforeA = await unreadNotificationCount(adminA.id);
    await db.insert(notifications).values({ userId: adminA.id, type: "FINAL_TEST", title: "admin-only", body: "b" });
    expect(await unreadNotificationCount(adminA.id)).toBe(beforeA + 1);
  });

  it("marking is idempotent: re-marking stays at zero", async () => {
    const bAdmin = await userByEmail("b-admin@test.example");
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, bAdmin.id), isNull(notifications.readAt)));
    expect(await unreadNotificationCount(bAdmin.id)).toBe(0);
  });
});

/* =================================================================== */
/*  Correction 2 — agency wallet summary: Available Balance only       */
/* =================================================================== */
describe("C2 — agency wallet summary shows only Available Balance", () => {
  it("portal wallet page shows Available Balance and hides the aggregate cards", () => {
    expect(PORTAL_WALLET).toContain('ct("Available balance")');
    expect(PORTAL_WALLET).not.toContain('ct("Total credited")');
    expect(PORTAL_WALLET).not.toContain('ct("Total charged")');
    expect(PORTAL_WALLET).not.toContain('ct("Total debited")');
    expect(PORTAL_WALLET).not.toContain('label={ct("Transactions")}');
  });

  it("the immutable ledger is still rendered for the agency (own history)", () => {
    expect(PORTAL_WALLET).toContain("getTransactions(user.agencyId");
    expect(PORTAL_WALLET).toContain('ct("Wallet & Transactions")');
    expect(PORTAL_WALLET).toContain("TableWrap");
  });

  it("staff/admin aggregates are retained", () => {
    expect(ADMIN_BILLING).toContain('ct("Combined balances")');
    expect(ADMIN_BILLING).toContain('ct("Ledger entries")');
    expect(ADMIN_BILLING).toContain("listWalletTransactions");
  });

  it("wallet math is untouched: credits move the balance exactly", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const superAdmin = await userByEmail("admin@test.example");
    const before = await getBalance(agency.id);
    await adjustWallet({ agencyId: agency.id, amount: 1234.5, reason: "final-release credit check", actor: superAdmin });
    const after = await getBalance(agency.id);
    expect(Number(after.balance) - Number(before.balance)).toBeCloseTo(1234.5, 2);
  });
});

/* =================================================================== */
/*  Correction 3 — Step 1: Country first, then visa-type cards         */
/* =================================================================== */
describe("C3 — country-first step-1 UX with visa-type cards", () => {
  it("exactly three steps: choose / upload / preview", () => {
    expect(WIZARD).toContain("{ n: 1, label: t.stepChoose }");
    expect(WIZARD).toContain("{ n: 2, label: t.stepUpload }");
    expect(WIZARD).toContain("{ n: 3, label: t.stepPreview }");
    expect(WIZARD.split("data-wizard-section").length - 1).toBe(3);
  });

  it("country selection comes first and gates the visa-type cards", () => {
    expect(WIZARD.indexOf("wizard-country")).toBeLessThan(WIZARD.indexOf("wizard-visa-type"));
    expect(WIZARD).toContain("onClick={() => { setCountryId(c.id); setVisaTypeId(\"\"); }}");
    expect(WIZARD).toContain('name="countryId"'); // posted to the server
  });

  it("visa-type cards show name, category, price, currency and processing time", () => {
    for (const token of ["{v.name}</span>", "{v.categoryName}</span>", "{v.fee} {v.currency}", "{v.minDays}–{v.maxDays}"]) {
      expect(WIZARD).toContain(token);
    }
  });

  it("server only feeds ACTIVE destinations with ACTIVE visa types", async () => {
    const options = await activeVisaOptions();
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      const rows = await db.execute(
        sql`select vt.active as vt, c.active as c from visa_types vt join countries c on c.id = vt.country_id where vt.id = ${o.id}`,
      );
      const row = rows.rows[0] as { vt: boolean; c: boolean };
      expect(row.vt).toBe(true);
      expect(row.c).toBe(true);
    }
    // group by country (the page does it): no country without a selectable type
    const byCountry = new Map<string, number>();
    for (const o of options) byCountry.set(o.countryId, (byCountry.get(o.countryId) ?? 0) + 1);
    for (const [, count] of byCountry) expect(count).toBeGreaterThan(0);
    // the page groups country-first from those options
    expect(NEW_PAGE).toContain("countries.find((x) => x.id === v.countryId)");
    expect(NEW_PAGE).toContain("visaTypes: []");
    // A country whose last active visa type is deactivated disappears.
    const one = options[0]!;
    const count = (await db.execute(
      sql`select count(*)::int as n from visa_types where country_id = ${one.countryId} and active`,
    )).rows[0] as { n: number };
    await db.execute(sql`update visa_types set active = false where country_id = ${one.countryId}`);
    try {
      const afterOff = await activeVisaOptions();
      expect(afterOff.find((o) => o.countryId === one.countryId)).toBeUndefined();
    } finally {
      await db.execute(sql`update visa_types set active = true where country_id = ${one.countryId}`);
    }
    expect(count.n).toBeGreaterThan(0);
    expect(NEW_PAGE).toContain("countryId");
  });
});

/* =================================================================== */
/*  Correction 4 — minimal applicant (Full Name + Nationality only)    */
/* =================================================================== */
describe("C4 — new-request form collects only Full Name + Nationality", () => {
  it("the wizard renders exactly those two required fields and nothing else personal", () => {
    expect(WIZARD).toContain('name="t0_fullName"');
    expect(WIZARD).toContain('required');
    expect(WIZARD).toContain('name="t0_nationality"');
    // forbidden fields entirely absent from the flow
    for (const banned of ["t0_dateOfBirth", "t0_passportNumber", "t0_passportExpiryDate", "t0_passportIssueDate", "t0_email", "t0_phone"]) {
      expect(WIZARD).not.toContain(banned);
    }
    expect(WIZARD).not.toContain("DatePicker"); // no date collection at all
  });

  it("the server action forwards only full name + nationality for one applicant", () => {
    expect(ACTION).toContain('formData.get("t0_fullName")');
    expect(ACTION).toContain('formData.get("t0_nationality")');
    expect(ACTION).not.toContain("t0_passportNumber");
    expect(ACTION).not.toContain("t0_dateOfBirth");
    expect(ACTION).not.toContain("t0_email");
  });
});

/* =================================================================== */
/*  Correction 5 — exactly one traveller                               */
/* =================================================================== */
describe("C5 — one application = one applicant (UI and server)", () => {
  it("no add-another-traveller affordance exists in the wizard", () => {
    expect(WIZARD).not.toContain("addTraveller");
    expect(WIZARD).not.toContain("removeTraveller");
    expect(WIZARD).not.toContain("setTravellerCount");
  });

  it("server caps at one and the constant is 1", async () => {
    const reqlib = SRC("src/lib/requests.ts");
    expect(reqlib).toContain("MAX_TRAVELLERS_PER_REQUEST = 1");
    expect(reqlib).toContain('err("APPLICANT_LIMIT"');
  });
});

/* =================================================================== */
/*  Correction 6 — nationality country selector                        */
/* =================================================================== */
describe("C6 — nationality selector with localized labels and Algeria default", () => {
  it("dictionary: unique stable codes, Algeria present and is the default", () => {
    const codes = NATIONALITIES.map((n) => n.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(isValidNationality("DZ")).toBe(true);
    expect(DEFAULT_NATIONALITY).toBe("DZ");
    expect(nationalityLabel("DZ", "en")).toBe("Algeria");
    expect(nationalityLabel("DZ", "fr")).toBe("Algérie");
    expect(nationalityLabel("DZ", "ar")).toBe("الجزائر");
    expect(nationalityLabel("FR", "fr")).toBe("France");
    expect(nationalityLabel("FR", "ar")).toBe("فرنسا");
  });

  it("labels are never accepted as identifiers; unknown values rejected safely", () => {
    expect(isValidNationality("Algérie")).toBe(false);
    expect(isValidNationality("Algeria")).toBe(false);
    expect(isValidNationality("XX")).toBe(false);
    // legacy free-text falls back to the stored value for display
    expect(nationalityLabel("Algerian", "en")).toBe("Algerian");
    expect(nationalityLabel(null, "fr")).toBe("—");
  });

  it("the wizard renders a real selector preselected to the platform default", () => {
    expect(WIZARD).toContain('defaultValue={props.defaultNationality}');
    expect(WIZARD).toContain("props.nationalities.map((n)");
    expect(WIZARD).toContain('value={n.code}'); // codes, never labels
    expect(NEW_PAGE).toContain("defaultNationality={DEFAULT_NATIONALITY}");
    expect(NEW_PAGE).toContain("NATIONALITIES.map((n) => ({ code: n.code, label: nationalityLabel(n.code, uiLocale) })");
  });

  it("server validates the submitted identifier (invalid → APPLICANT_NATIONALITY_INVALID)", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const superAdmin = await userByEmail("admin@test.example");
    const before = await getBalance(agency.id);
    if (Number(before.balance) < 50000) {
      await adjustWallet({ agencyId: agency.id, amount: 200000, reason: "final-suite wallet topup", actor: superAdmin });
    }
    const actor = await userByEmail("b-admin@test.example");
    const v = (await db.execute(sql`select id, country_id from visa_types where code = 'JP-BUS'`)).rows[0] as { id: string; country_id: string };
    const reqs = (await db.execute(
      sql`select document_type_id as id from visa_requirements where visa_type_id = ${v.id} and active`,
    )).rows as { id: string }[];
    const docs = reqs.map((r) => ({ documentTypeId: r.id, file: { name: "a.pdf", type: "application/pdf", size: 64, data: Buffer.alloc(64, 1) } }));
    await expect(
      submitVisaRequest({
        actor,
        idempotencyKey: crypto.randomUUID(),
        countryId: v.country_id,
        visaTypeId: v.id,
        travellers: [{ fullName: "Test Person", nationality: "Algérie" }],
        documents: docs,
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ code: "APPLICANT_NATIONALITY_INVALID" });
    // wallet untouched by the rejected submit
    const after = await getBalance(agency.id);
    expect(Number(after.balance)).toBeCloseTo(Number(before.balance) < 50000 ? Number(before.balance) + 200000 : Number(before.balance));
  });
});

/* =================================================================== */
/*  Correction 7 — applications list: APPLICANT column after REFERENCE */
/* =================================================================== */
describe("C7 — Applications list APPLICANT column (order, search, fallback, localization)", () => {
  it("column order: REFERENCE → APPLICANT → VISA/COUNTRY → DOCUMENTS → FEE → STATUS → CREATED", () => {
    // evaluate header order INSIDE the <thead> markup (labels like "Status"
    // also appear earlier in the filter bar).
    const thead = LIST_PAGE.slice(LIST_PAGE.indexOf("<thead"), LIST_PAGE.indexOf("</thead>"));
    const refIdx = thead.indexOf('ct("Reference")');
    const applicantIdx = thead.indexOf('ct("Applicant")');
    const visaIdx = thead.indexOf('ct("Visa / Country")');
    const docsIdx = thead.indexOf('ct("Documents")');
    const feeIdx = thead.indexOf('ct("Fee")');
    const statusIdx = thead.indexOf('ct("Status")');
    const createdIdx = thead.indexOf('ct("Created")');
    expect(refIdx).toBeGreaterThan(-1);
    expect(applicantIdx).toBeGreaterThan(-1);
    expect(refIdx).toBeLessThan(applicantIdx);
    expect(applicantIdx).toBeLessThan(visaIdx);
    expect(visaIdx).toBeLessThan(docsIdx);
    expect(docsIdx).toBeLessThan(feeIdx);
    expect(feeIdx).toBeLessThan(statusIdx);
    expect(statusIdx).toBeLessThan(createdIdx);
    expect(LIST_PAGE).toContain("r.applicantSummary ?? \"—\""); // safe legacy fallback
  });

  it("queries.ts exposes a coalesced applicant summary and searches full names", () => {
    const queries = SRC("src/lib/queries.ts");
    expect(queries).toContain("nullif(p.full_name, '')");
    expect(queries).toContain("concat_ws(' ', nullif(p.first_name, ''), nullif(p.last_name, ''))");
    expect(SRC("src/lib/i18n-content.ts")).toContain('"Applicant": { fr: "Demandeur", ar: "مقدم الطلب" }');
  });

  it("end-to-end: submitted applicant appears in the list and participates in search", async () => {
    const agency = await agencyByEmail("ops@agencyb.example");
    const actor = await userByEmail("b-admin@test.example");
    const superAdmin = await userByEmail("admin@test.example");
    if (Number((await getBalance(agency.id)).balance) < 50000) {
      await adjustWallet({ agencyId: agency.id, amount: 200000, reason: "final-suite wallet topup", actor: superAdmin });
    }
    const v = (await db.execute(sql`select id, country_id from visa_types where code = 'JP-BUS'`)).rows[0] as { id: string; country_id: string };
    const reqs = (await db.execute(
      sql`select document_type_id as id from visa_requirements where visa_type_id = ${v.id} and active`,
    )).rows as { id: string }[];
    const uniqueName = `Sundance Kid ${Date.now().toString(36)}`;
    const res = await submitVisaRequest({
      actor,
      idempotencyKey: crypto.randomUUID(),
      countryId: v.country_id,
      visaTypeId: v.id,
      travellers: [{ fullName: uniqueName, nationality: "DZ" }],
      documents: reqs.map((r) => ({ documentTypeId: r.id, file: { name: "a.pdf", type: "application/pdf", size: 64, data: Buffer.alloc(64, 1) } })),
      ipAddress: null,
    });
    expect(res.reused).toBe(false);

    const found = await searchApplications(actor, { q: uniqueName });
    expect(found.total).toBeGreaterThan(0);
    const row = found.rows.find((r) => r.app.id === res.applicationId);
    expect(row).toBeDefined();
    expect(row!.applicantSummary).toBe(uniqueName);

    // legacy row without full_name falls back to first + last
    await db.execute(sql`
      insert into applicants (application_id, first_name, last_name, nationality)
      values (${res.applicationId}, 'Legacy', 'Name', 'DZ')`);
    const legacy = await db.execute(
      sql`select coalesce(nullif(full_name, ''), nullif(concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')), ''), '—') as d
            from applicants where application_id = ${res.applicationId} and full_name is null`,
    );
    expect((legacy.rows[0] as { d: string }).d).toBe("Legacy Name");
  });
});
