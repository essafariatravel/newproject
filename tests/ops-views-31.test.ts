import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import { applicants as applicantsTb, checklistItems, documentRequests } from "@/db/schema";
import { sql } from "drizzle-orm";
import { createDraftApplication, submitApplication } from "@/lib/applications";
import { uploadDocument } from "@/lib/documents";
import { adjustWallet } from "@/lib/wallet";
import { searchApplications } from "@/lib/queries";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { currentStatusSince, elapsedDays, elapsedLabel, formatElapsed, waitingBand } from "@/lib/time-in-status";
import { countryName } from "@/lib/country-names";
import { searchEverything, countHits } from "@/lib/command-search";

/* ------------------------------------------------------------------ */
/* §21/§31 — time in status (pure helpers)                             */
/* ------------------------------------------------------------------ */

describe("§21/§31 — time in the current status", () => {
  it("uses the newest transition INTO the current status, falling back to creation", () => {
    const history = [
      { toStatusId: "S1", createdAt: new Date("2026-09-01T08:00:00Z") },
      { toStatusId: "S2", createdAt: new Date("2026-09-03T08:00:00Z") },
      { toStatusId: "S2", createdAt: new Date("2026-09-05T08:00:00Z") }, // re-entered S2
      { toStatusId: "S3", createdAt: new Date("2026-09-06T08:00:00Z") },
    ];
    expect(currentStatusSince(history, "S2", null)?.toISOString()).toBe("2026-09-05T08:00:00.000Z");
    // No history for the current status → the provided fallback wins.
    const fallback = new Date("2026-08-30T00:00:00Z");
    expect(currentStatusSince(history, "S9", fallback)?.toISOString()).toBe(fallback.toISOString());
    expect(currentStatusSince([], null, null)).toBeNull();
  });

  it("counts whole elapsed days and never goes negative", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    expect(elapsedDays(new Date("2026-09-21T12:00:00Z"), now)).toBe(3);
    expect(elapsedDays(new Date("2026-09-24T13:00:00Z"), now)).toBe(0);
  });

  it("formats elapsed time in EN, FR and AR without inventing deadlines", () => {
    expect(formatElapsed(30_000, "en")).toBe("<1 min");
    expect(formatElapsed(42 * 60_000, "en")).toBe("42 min");
    expect(formatElapsed(3 * 3_600_000 + 20 * 60_000, "en")).toBe("3 h 20 min");
    expect(formatElapsed(2 * 86_400_000 + 5 * 3_600_000, "en")).toBe("2 days 5 h");
    expect(formatElapsed(87 * 86_400_000, "en")).toBe("2 months");
    expect(formatElapsed(42 * 60_000, "fr")).toContain("min");
    expect(formatElapsed(2 * 86_400_000, "fr")).toContain("jours");
    expect(formatElapsed(45 * 86_400_000, "fr")).toContain("mois");
    expect(formatElapsed(2 * 86_400_000, "ar")).toContain("أيام");
    expect(elapsedLabel(null, "en")).toBe("just now");
  });

  it("bands waiting time from real days only", () => {
    expect(waitingBand(0)).toBe("fresh");
    expect(waitingBand(3)).toBe("waiting");
    expect(waitingBand(7)).toBe("aging");
  });
});

/* ------------------------------------------------------------------ */
/* §53 — localized country names                                       */
/* ------------------------------------------------------------------ */

describe("§53 — destination names follow the interface language", () => {
  it("prefers an explicit catalogue override, then ICU, then the stored name", () => {
    expect(countryName({ name: "Spain", iso2: "ES" }, "en")).toBe("Spain");
    expect(countryName({ name: "Turkey", iso2: "TR", nameFr: "Turquie" }, "fr")).toBe("Turquie");
    expect(countryName({ name: "Spain", iso2: "ES" }, "fr")).toMatch(/Espagne/);
    expect(countryName({ name: "Spain", iso2: "ES" }, "ar")).toMatch(/[؀-ۿ]/);
    // No code and no override → the stored name is still shown (never blank).
    expect(countryName({ name: "Atlantis" }, "ar")).toBe("Atlantis");
  });
});

/* ------------------------------------------------------------------ */
/* §25/§27/§28 — ownership, saved views, command search                */
/* ------------------------------------------------------------------ */

async function inProcessApplication(label: string) {
  const agency = await agencyByEmail("ops@agencya.example");
  const staffA = await userByEmail("a-admin@test.example");
  // Prepaid wallet must cover the DZD fee before a submission can be charged.
  const accounting = await userByEmail("accounting@test.example");
  await adjustWallet({ agencyId: agency.id, amount: 50_000, reason: "ops-views test funding", actor: accounting });
  const visaId = (
    (await db.execute(sql`select id from visa_types where code='FR-SCH-TOUR'`)).rows[0] as { id: string }
  ).id;

  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visaId, createdBy: staffA });
  // Legacy NOT NULL columns still exist alongside the new full_name field (§12).
  const [first, ...rest] = label.split(" ");
  await db.insert(applicantsTb).values({
    applicationId: app.id,
    firstName: first!,
    lastName: rest.join(" ") || "—",
    fullName: label,
    nationality: "DZ",
  });
  const required = await db
    .select()
    .from(checklistItems)
    .where(sql`${checklistItems.applicationId} = ${app.id} and ${checklistItems.required} = true`);
  for (const item of required) {
    const bytes = Buffer.from("%PDF-1.4 ops-view test");
    await uploadDocument({
      applicationId: app.id,
      actor: staffA,
      checklistItemId: item.id,
      file: { name: `${item.documentTypeCode.toLowerCase()}.pdf`, type: "application/pdf", size: bytes.length, data: bytes },
    });
  }
  await submitApplication({ applicationId: app.id, actor: staffA });
  return { app, agency, staffA };
}

describe("§25/§27/§28 — staff operations surface", () => {
  it("filters by ownership (mine / unassigned) server-side", async () => {
    const staffA = await userByEmail("a-admin@test.example");
    const { app } = await inProcessApplication("Owner Filter Traveller");

    const mine = await searchApplications(staffA, { assignedTo: "me" });
    expect(mine.rows.some((r) => r.app.id === app.id)).toBe(false);

    await db.execute(sql`update applications set assigned_to = ${staffA.id} where id = ${app.id}`);
    const afterAssign = await searchApplications(staffA, { assignedTo: "me" });
    expect(afterAssign.rows.some((r) => r.app.id === app.id)).toBe(true);
    const owner = afterAssign.rows.find((r) => r.app.id === app.id);
    expect(owner?.ownerName).toBe(staffA.name);

    await db.execute(sql`update applications set assigned_to = null where id = ${app.id}`);
    const unassigned = await searchApplications(staffA, { assignedTo: "unassigned" });
    expect(unassigned.rows.some((r) => r.app.id === app.id)).toBe(true);
  });

  it("filters documents requested / missing from real rows", async () => {
    const staffA = await userByEmail("a-admin@test.example");
    const { app, staffA: officer } = await inProcessApplication("Docs Filter Traveller");

    const missing = await searchApplications(staffA, { documents: "missing" });
    expect(missing.rows.some((r) => r.app.id === app.id)).toBe(false); // everything uploaded

    const item = (
      await db.select().from(checklistItems).where(sql`${checklistItems.applicationId} = ${app.id} limit 1`)
    )[0]!;
    await db.execute(sql`delete from documents where checklist_item_id = ${item.id}`);
    const missingNow = await searchApplications(staffA, { documents: "missing" });
    expect(missingNow.rows.some((r) => r.app.id === app.id)).toBe(true);

    await db.insert(documentRequests).values({
      applicationId: app.id,
      checklistItemId: item.id,
      documentTypeId: item.documentTypeId!,
      type: "REPLACEMENT",
      reason: "Blurred scan — please re-upload.",
      requestedBy: officer.id,
    });
    const requested = await searchApplications(staffA, { documents: "requested" });
    expect(requested.rows.some((r) => r.app.id === app.id)).toBe(true);
  });

  it("aging filter uses real status timestamps and the list carries statusSince", async () => {
    const staffA = await userByEmail("a-admin@test.example");
    const { app } = await inProcessApplication("Aging Filter Traveller");

    const fresh = await searchApplications(staffA, { agingDays: 3 });
    expect(fresh.rows.some((r) => r.app.id === app.id)).toBe(false);

    await db.execute(sql`update applications set created_at = now() - interval '9 days' where id = ${app.id}`);
    await db.execute(
      sql`update application_status_history set created_at = now() - interval '8 days' where application_id = ${app.id}`,
    );
    const aged = await searchApplications(staffA, { agingDays: 3 });
    const row = aged.rows.find((r) => r.app.id === app.id);
    expect(row).toBeTruthy();
    expect(elapsedDays(new Date(row!.statusSince))).toBeGreaterThanOrEqual(3);
  });

  it("global search is permission-scoped and returns deep links", async () => {
    const superAdmin = await userByEmail("superadmin@test.example");
    const visaAgent = await userByEmail("agent@test.example");
    const { app } = await inProcessApplication("Searchable Applicant");

    const hits = await searchEverything(superAdmin, "Searchable Applicant");
    expect(countHits(hits)).toBeGreaterThan(0);
    const apps = hits.find((g) => g.key === "applications");
    expect(apps?.items.some((i) => i.href === `/admin/applications/${app.id}`)).toBe(true);

    // Reference search also resolves, and every href is a staff route.
    const byReference = await searchEverything(superAdmin, app.reference);
    expect(byReference.flatMap((g) => g.items).some((i) => i.label === app.reference)).toBe(true);

    // Short terms are ignored (no accidental catalogue dumps).
    expect(await searchEverything(superAdmin, "a")).toEqual([]);

    // Every hit is scoped by the caller's permissions: a VISA_AGENT may read
    // dossiers + applicants but never agency or catalogue administration.
    const agentHits = await searchEverything(visaAgent, "Searchable Applicant");
    const agentGroups = agentHits.map((g) => g.key);
    expect(agentGroups).toContain("applications");
    expect(agentGroups).not.toContain("agencies");
    expect(agentGroups).not.toContain("config");
  });
});
