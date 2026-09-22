/**
 * Phase 2 end-to-end:
 *   Public registration → Pending → Admin review → Approval → Agency creation
 *   → Agency Admin activation (set password) → Agency login → Agency Portal
 * …with tenant isolation and wallet non-interference proven on the way.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();
afterEach(() => {
  request.cookie = "";
  request.set.mockClear();
  vi.restoreAllMocks();
});

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencies,
  agencyRegistrations,
  users,
} from "@/db/schema";
import { submitRegistrationAction } from "@/app/actions/registrations";
import { activateAccountAction } from "@/app/actions/activation";
import {
  addInternalNote,
  approveRegistration,
  createActivationTokenForRegistration,
  listRegistrations,
  pendingRegistrationCount,
  requestMoreInformation,
  startRegistrationReview,
} from "@/lib/registrations";
import { getSessionUser } from "@/lib/auth";
import { getApplicationForUser, createDraftApplication } from "@/lib/applications";
import { searchApplications, agencyDashboard } from "@/lib/queries";
import { getBalance, getTransactions } from "@/lib/wallet";
import { registrationPdf, userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";

/** Run an action that ends in a Next redirect; returns the redirect digest. */
async function captureRedirect(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    const digest = String((err as { digest?: string })?.digest ?? err);
    expect(digest).toContain("NEXT_REDIRECT");
    return digest;
  }
  throw new Error("expected the action to redirect");
}

function publicForm(): FormData {
  const form = new FormData();
  form.set("locale", "fr");
  form.set("renderedAt", String(Date.now() - 30_000));
  form.set("legalName", "Atlas Cristal Voyages SARL");
  form.set("tradingName", "Atlas Cristal");
  form.set("country", "Algérie");
  form.set("region", "Oran");
  form.set("city", "Oran");
  form.set("addressLine", "44 Boulevard de la Soummam");
  form.set("phone", "+213 41 00 00 00");
  form.set("email", "contact@atlas-cristal.example");
  form.set("website", "https://www.atlas-cristal.example");
  form.set("commercialRegistrationNumber", "RC-31-445566");
  form.set("taxId", "NIF-0931004455");
  form.set("licenceNumber", "LIC-DZ-2024");
  form.set("contactFirstName", "Yasmine");
  form.set("contactLastName", "Kaci");
  form.set("contactPosition", "Directrice Générale");
  form.set("contactEmail", "y.kaci@atlas-cristal.example");
  form.set("contactPhone", "+213 660 00 00 00");
  form.set("businessType", "TRAVEL_AGENCY");
  form.set("monthlyVolume", "51-200");
  form.set("mainMarkets", "Schengen, Turquie, Canada");
  form.set("message", "Agence établie depuis 2012, 4 agences physiques.");
  form.set("terms", "true");
  form.set("privacy", "true");
  form.set("accuracy", "true");
  // Mass-assignment attempt — must be ignored by the action input model.
  form.set("role", "SUPER_ADMIN");
  form.set("status", "APPROVED");
  form.set("balance", "1000000");
  form.set("agencyId", "00000000-0000-0000-0000-000000000000");
  // A real (magic-bytes-valid) PDF document via the multipart path.
  const pdf = registrationPdf("COMMERCIAL_REGISTRATION");
  form.set("doc_COMMERCIAL_REGISTRATION", new File([new Uint8Array(pdf.data)], pdf.name, { type: pdf.type }));
  return form;
}

describe("Phase 2 E2E — registration to portal", () => {
  it("walks the complete onboarding flow with the real actions and session stack", async () => {
    /* 1 — PUBLIC REGISTRATION (fr) through the real server action */
    const beforePending = await pendingRegistrationCount();
    const redirect = await captureRedirect(submitRegistrationAction({}, publicForm()));
    expect(redirect).toContain("/agency/register/success");
    expect(redirect).toContain("ref=AGR-");
    expect(redirect).toContain("lang=fr");

    const reg = (
      await db
        .select()
        .from(agencyRegistrations)
        .where(eq(agencyRegistrations.legalName, "Atlas Cristal Voyages SARL"))
    )[0]!;
    expect(reg.status).toBe("PENDING");
    expect(reg.locale).toBe("fr");
    // mass-assignment attempt did nothing
    expect(reg.agencyId).toBeNull();
    expect(reg.internalNotes).toBeNull();
    expect(await pendingRegistrationCount()).toBe(beforePending + 1);

    const listed = await listRegistrations({ status: "PENDING", q: "Atlas Cristal" });
    expect(listed.rows.some((r) => r.id === reg.id)).toBe(true);

    /* 2 — ADMIN REVIEW (start review, request info, internal note, review again) */
    const admin = await userByEmail("admin@test.example");
    await startRegistrationReview(reg.id, admin, null);
    await requestMoreInformation(reg.id, admin, "Merci de préciser votre agrément IATA.", null);
    await addInternalNote(reg.id, admin, "Dossier solide, vérification IATA en cours.", null);
    await startRegistrationReview(reg.id, admin, null);
    const current = (await db.select().from(agencyRegistrations).where(eq(agencyRegistrations.id, reg.id)))[0]!;
    expect(current.status).toBe("UNDER_REVIEW");

    /* 3 — APPROVAL: agency + AGENCY_ADMIN, linked, no wallet credit */
    const approval = await approveRegistration({ registrationId: reg.id, actor: admin });
    expect(approval.alreadyApproved).toBe(false);
    const agency = (await db.select().from(agencies).where(eq(agencies.id, approval.agencyId)))[0]!;
    expect(agency.legalName).toBe("Atlas Cristal Voyages SARL");
    expect(agency.balance).toBe("0.00");
    expect((await getTransactions(agency.id)).length).toBe(0);

    /* 4 — ACTIVATION: generate link → set password through the public action */
    const issued = await createActivationTokenForRegistration(reg.id, admin);
    const activationForm = new FormData();
    activationForm.set("token", issued.token);
    activationForm.set("locale", "fr");
    activationForm.set("password", "AtlasSecure!2026");
    activationForm.set("passwordConfirm", "AtlasSecure!2026");
    const actRedirect = await captureRedirect(activateAccountAction({}, activationForm));
    expect(actRedirect).toContain("/portal");

    /* 5 — LOGIN: the activation action opened a session; verify it resolves */
    expect(request.set).toHaveBeenCalledWith(
      "evos_session",
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
    const sessionUser = await getSessionUser();
    expect(sessionUser).not.toBeNull();
    expect(sessionUser!.email).toBe("y.kaci@atlas-cristal.example");
    expect(sessionUser!.role).toBe("AGENCY_ADMIN");
    expect(sessionUser!.agencyId).toBe(agency.id);

    /* 6 — PORTAL: dashboard renders own-tenant data only */
    const dash = await agencyDashboard(agency.id, sessionUser!.id);
    expect(dash.wallet!.balance).toBe("0.00");
    const ownApps = await searchApplications(sessionUser!, {});
    expect(ownApps.total).toBe(0);

    /* 7 — TENANT ISOLATION: foreign application is invisible (IDOR-safe 404) */
    const staffA = await userByEmail("a-admin@test.example");
    const agencyA = (
      await db.select().from(agencies).where(eq(agencies.email, "ops@agencya.example"))
    )[0]!;
    const visaType = (
      await db.execute(sql`select id from visa_types where code = 'FR-SCH-TOUR' limit 1`)
    ).rows[0] as { id: string };
    const foreignApp = await createDraftApplication({
      agencyId: agencyA.id,
      visaTypeId: visaType.id,
      createdBy: staffA,
    });
    await expect(getApplicationForUser(foreignApp.id, sessionUser!)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // staff still see everything
    await expect(getApplicationForUser(foreignApp.id, admin)).resolves.toBeTruthy();

    /* 8 — WALLET UNTOUCHED: funding stays an ADMIN/ACCOUNTING workflow */
    expect((await getBalance(agency.id)).balance).toBe("0.00");
    const allUsers = await db.select().from(users).where(eq(users.agencyId, agency.id));
    expect(allUsers).toHaveLength(1);
    expect(allUsers[0]!.role).toBe("AGENCY_ADMIN");
  });
});
