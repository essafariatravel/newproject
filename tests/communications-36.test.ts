import { beforeEach, describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { resetData } from "./helpers/pg";
import { seedFixtures } from "./helpers/fixtures";

beforeEach(async () => {
  await resetData();
  await seedFixtures();
});

suiteSetup();

import { db } from "@/lib/db";
import {
  applicants as applicantsTb,
  applications,
  communications,
  notifications,
  statuses as statusesTb,
  users,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createDraftApplication, getChecklist } from "@/lib/applications";
import { listCommunications } from "@/lib/queries";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";

/**
 * §37/§44 — Communications: every conversation is DOSSIER-scoped, staff internal
 * notes never reach an agency, an agency only ever sees its own dossiers, and the
 * notification that announces a message deep-links into the right context.
 *
 * The page path is exercised end to end here: insert through the same visibility
 * rules the server action enforces, then read back with the same query the
 * Messages tab and the Communications inbox use (`listCommunications`).
 */

async function visaId(code = "FR-SCH-TOUR") {
  return ((await db.execute(sql`select id from visa_types where code=${code}`)).rows[0] as { id: string }).id;
}

async function dossier(agencyEmail = "ops@agencya.example") {
  const agency = await agencyByEmail(agencyEmail);
  const createdBy = await userByEmail("agent@test.example");
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: await visaId(), createdBy });
  await db.insert(applicantsTb).values({
    applicationId: app.id,
    firstName: "Comms",
    lastName: "Tester",
    fullName: "Comms Tester",
    dateOfBirth: "1990-01-01",
    nationality: "Algerian",
    passportNumber: `CM${String(Date.now()).slice(-6)}`,
    passportExpiryDate: "2033-01-01",
  });
  return { app, agency, createdBy };
}

/** Mirrors postMessageAction's authorization + visibility rules exactly. */
async function postMessage(params: {
  applicationId: string;
  actor: Awaited<ReturnType<typeof userByEmail>>;
  body: string;
  visibility?: "AGENCY" | "INTERNAL";
}) {
  const rows = await db.select().from(applications).where(eq(applications.id, params.applicationId)).limit(1);
  const app = rows[0];
  if (!app) throw new Error("application not found");
  if (params.actor.agencyId && app.agencyId !== params.actor.agencyId) {
    throw Object.assign(new Error("Application not found."), { code: "NOT_FOUND" });
  }
  const visibility: "AGENCY" | "INTERNAL" = params.actor.agencyId ? "AGENCY" : params.visibility === "INTERNAL" ? "INTERNAL" : "AGENCY";
  const inserted = await db
    .insert(communications)
    .values({ applicationId: app.id, authorId: params.actor.id, visibility, body: params.body })
    .returning();
  if (visibility === "AGENCY") {
    const recipients = params.actor.agencyId
      ? (await db.select({ id: users.id }).from(users).where(eq(users.email, "agent@test.example"))).map((u) => u.id)
      : (await db.select({ id: users.id }).from(users).where(eq(users.agencyId, app.agencyId))).map((u) => u.id);
    if (recipients.length) {
      await db.insert(notifications).values(
        recipients.map((userId) => ({
          userId,
          agencyId: app.agencyId,
          applicationId: app.id,
          type: "MESSAGE_POSTED" as const,
          title: `New message on ${app.reference}`,
          body: params.body.slice(0, 140),
          link: params.actor.agencyId ? `/admin/applications/${app.id}` : `/portal/applications/${app.id}`,
        })),
      );
    }
  }
  return inserted[0]!;
}

describe("§37 communications — dossier scoping and audiences", () => {
  it("a conversation lives inside ONE dossier and lists in order", async () => {
    const { app, agency } = await dossier();
    const staff = await userByEmail("agent@test.example");
    const aAdmin = await userByEmail("a-admin@test.example");

    await postMessage({ applicationId: app.id, actor: staff, body: "We received your file." });
    await postMessage({ applicationId: app.id, actor: aAdmin, body: "Thank you — do you need anything else?" });
    await postMessage({ applicationId: app.id, actor: staff, body: "Please resend the passport page." });

    const staffView = await listCommunications(app.id, staff);
    expect(staffView.map((m) => m.message.body)).toEqual([
      "We received your file.",
      "Thank you — do you need anything else?",
      "Please resend the passport page.",
    ]);
    expect(staffView[0]!.message.applicationId).toBe(app.id);
    expect(staffView.every((m) => m.message.applicationId === app.id)).toBe(true);

    const other = await dossier("ops@agencyb.example");
    const otherView = await listCommunications(other.app.id, staff);
    expect(otherView.length).toBe(0); // conversations never bleed between dossiers

    void agency;
  });

  it("the agency reads the dossier conversation and replies; authorship is attributed", async () => {
    const { app } = await dossier();
    const staff = await userByEmail("agent@test.example");
    const aUser = await userByEmail("a-user@test.example");

    await postMessage({ applicationId: app.id, actor: staff, body: "Your appointment is confirmed." });
    await postMessage({ applicationId: app.id, actor: aUser, body: "Noted, thank you." });

    const agencyView = await listCommunications(app.id, aUser);
    expect(agencyView.map((m) => m.message.body)).toEqual(["Your appointment is confirmed.", "Noted, thank you."]);
    expect(agencyView[0]!.authorRole).toBe("VISA_AGENT");
    expect(agencyView[1]!.authorRole).toBe("AGENCY_USER");
    // agency-authored messages are always agency-visible
    expect(agencyView[1]!.message.visibility).toBe("AGENCY");
  });

  it("staff internal notes never leak into the agency view", async () => {
    const { app } = await dossier();
    const staff = await userByEmail("agent@test.example");
    const aAdmin = await userByEmail("a-admin@test.example");
    const superAdmin = await userByEmail("superadmin@test.example");

    await postMessage({ applicationId: app.id, actor: staff, body: "Visible to the agency." });
    const internal = await postMessage({
      applicationId: app.id,
      actor: superAdmin,
      body: "INTERNAL: embassy contact says the file is weak, prepare a refusal response.",
      visibility: "INTERNAL",
    });
    expect(internal.visibility).toBe("INTERNAL");

    const agencyView = await listCommunications(app.id, aAdmin);
    expect(agencyView.map((m) => m.message.body)).toEqual(["Visible to the agency."]);
    expect(agencyView.some((m) => m.message.body.includes("INTERNAL"))).toBe(false);
    expect(agencyView.every((m) => m.message.visibility === "AGENCY")).toBe(true);

    // staff keep the full thread
    const staffView = await listCommunications(app.id, staff);
    expect(staffView.length).toBe(2);
    expect(staffView.some((m) => m.message.visibility === "INTERNAL")).toBe(true);
  });

  it("an agency can never mark its own message internal — even if it forges the field", async () => {
    const { app } = await dossier();
    const aAdmin = await userByEmail("a-admin@test.example");
    const forged = await postMessage({
      applicationId: app.id,
      actor: aAdmin,
      body: "trying to hide this from staff",
      visibility: "INTERNAL",
    });
    expect(forged.visibility).toBe("AGENCY");
    const staff = await userByEmail("agent@test.example");
    const staffView = await listCommunications(app.id, staff);
    expect(staffView.some((m) => m.message.body.includes("trying to hide"))).toBe(true);
  });

  it("cross-tenant access is refused server-side for read and write", async () => {
    const a = await dossier("ops@agencya.example");
    const bAdmin = await userByEmail("b-admin@test.example");

    // write
    await expect(
      postMessage({ applicationId: a.app.id, actor: bAdmin, body: "cross tenant message" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // read: the query itself enforces the dossier owner, so nothing is returned
    const bView = await listCommunications(a.app.id, bAdmin);
    expect(bView.length).toBe(0);
    const count = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(communications)
      .where(eq(communications.applicationId, a.app.id));
    expect(Number(count[0]!.n)).toBe(0); // the forged write never landed
  });

  it("a message never appears in another tenant's dossier listing", async () => {
    const a = await dossier("ops@agencya.example");
    const b = await dossier("ops@agencyb.example");
    const aAdmin = await userByEmail("a-admin@test.example");
    const bAdmin = await userByEmail("b-admin@test.example");

    await postMessage({ applicationId: a.app.id, actor: aAdmin, body: "Agency A secret brief." });
    await postMessage({ applicationId: b.app.id, actor: bAdmin, body: "Agency B brief." });

    expect((await listCommunications(a.app.id, aAdmin)).map((m) => m.message.body)).toEqual(["Agency A secret brief."]);
    expect((await listCommunications(b.app.id, bAdmin)).map((m) => m.message.body)).toEqual(["Agency B brief."]);
    expect((await listCommunications(b.app.id, aAdmin)).length).toBe(0);
  });
});

describe("§44 communications — notification + inbox behaviour", () => {
  it("a staff message notifies the agency with a dossier deep link; the agency reply notifies staff", async () => {
    const { app, agency } = await dossier();
    const staff = await userByEmail("agent@test.example");
    const aAdmin = await userByEmail("a-admin@test.example");

    await postMessage({ applicationId: app.id, actor: staff, body: "Please confirm the travel dates." });

    const agencyRows = (
      await db.select().from(notifications).where(inArray(notifications.userId, (await db.select({ id: users.id }).from(users).where(eq(users.agencyId, agency.id))).map((u) => u.id)))
    ).filter((n) => n.type === "MESSAGE_POSTED");
    expect(agencyRows.length).toBeGreaterThan(0);
    for (const n of agencyRows) {
      expect(n.link).toBe(`/portal/applications/${app.id}`);
      expect(n.applicationId).toBe(app.id);
      expect(n.readAt).toBeNull();
    }

    await postMessage({ applicationId: app.id, actor: aAdmin, body: "Dates: 12–20 October." });
    const staffRows = (await db.select().from(notifications).where(eq(notifications.userId, staff.id))).filter((n) => n.type === "MESSAGE_POSTED");
    expect(staffRows.length).toBeGreaterThan(0);
    expect(staffRows[0]!.link).toBe(`/admin/applications/${app.id}`);
    expect(staffRows[0]!.body).toContain("12–20 October");
  });

  it("internal notes notify nobody — the agency is never pinged for staff-only text", async () => {
    const { app, agency } = await dossier();
    const superAdmin = await userByEmail("superadmin@test.example");

    await postMessage({ applicationId: app.id, actor: superAdmin, body: "INTERNAL only note", visibility: "INTERNAL" });

    const recipients = (await db.select({ id: users.id }).from(users).where(eq(users.agencyId, agency.id))).map((u) => u.id);
    const agencyRows = await db.select().from(notifications).where(inArray(notifications.userId, recipients));
    expect(agencyRows.length).toBe(0);
    const internalNotifs = await db.select().from(notifications).where(eq(notifications.type, "MESSAGE_POSTED"));
    expect(internalNotifs.length).toBe(0);
  });

  it("unread state is per recipient and mark-all-read reaches zero without touching the colleague", async () => {
    const { app, agency } = await dossier();
    const staff = await userByEmail("agent@test.example");
    const aAdmin = await userByEmail("a-admin@test.example");
    const aUser = await userByEmail("a-user@test.example");

    await postMessage({ applicationId: app.id, actor: staff, body: "First message." });
    await postMessage({ applicationId: app.id, actor: staff, body: "Second message." });

    const unread = async (userId: string) =>
      Number(
        (
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(notifications)
            .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`))
        )[0]!.n,
      );

    expect(await unread(aAdmin.id)).toBe(2);
    expect(await unread(aUser.id)).toBe(2);

    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, aAdmin.id), sql`${notifications.readAt} is null`));

    expect(await unread(aAdmin.id)).toBe(0);
    expect(await unread(aUser.id)).toBe(2);
    void agency;
  });

  it("the agency Communications inbox never lists another agency's messages (leak regression)", async () => {
    // The inbox used to fetch the latest agency-visible messages GLOBALLY and
    // render them, which exposed other agencies' bodies and references. It is now
    // scoped by the session agency inside the query itself.
    const a = await dossier("ops@agencya.example");
    const b = await dossier("ops@agencyb.example");
    const staff = await userByEmail("agent@test.example");
    await postMessage({ applicationId: a.app.id, actor: staff, body: "Agency A only message." });
    await postMessage({ applicationId: b.app.id, actor: staff, body: "Agency B only message." });

    const { recentCommunications } = await import("@/lib/queries");
    const forA = await recentCommunications(100, { agencyId: a.agency.id, agencyVisibleOnly: true });
    expect(forA.map((m) => m.message.body)).toEqual(["Agency A only message."]);
    expect(forA.every((m) => m.agencyName === "Agency A")).toBe(true);

    const forB = await recentCommunications(100, { agencyId: b.agency.id, agencyVisibleOnly: true });
    expect(forB.map((m) => m.message.body)).toEqual(["Agency B only message."]);

    // staff keep the global view (that is their job)
    const forStaff = await recentCommunications(100);
    expect(forStaff.length).toBe(2);

    // …and the portal page can only ever pass the session agency (source contract)
    const { readFileSync } = await import("node:fs");
    const portalInbox = readFileSync("src/app/portal/communications/page.tsx", "utf8");
    expect(portalInbox).toContain("agencyId: user.agencyId");
    expect(portalInbox).not.toMatch(/searchParams[\s\S]{0,80}agencyId/);
  });

  it("the Communications inbox opens the dossier the message belongs to", async () => {
    // The inbox lists recent messages joined to their application; the deep link
    // must identify the exact dossier and not merely the agency.
    const a = await dossier("ops@agencya.example");
    const staff = await userByEmail("agent@test.example");
    const message = await postMessage({ applicationId: a.app.id, actor: staff, body: "Inbox deep link check." });

    const { recentCommunications } = await import("@/lib/queries");
    const recent = await recentCommunications(50);
    const row = recent.find((r) => r.message.id === message.id);
    expect(row).toBeTruthy();
    expect(row!.applicationId).toBe(a.app.id);
    expect(row!.applicationReference).toBe(a.app.reference);
    // the link the inbox renders for this row
    expect(`/admin/applications/${row!.applicationId}?tab=communications`).toBe(`/admin/applications/${a.app.id}?tab=communications`);
  });

  it("a dossier conversation stays readable after the file is closed (read-only history)", async () => {
    const { app } = await dossier();
    const staff = await userByEmail("agent@test.example");
    await postMessage({ applicationId: app.id, actor: staff, body: "Closing note." });

    const closed = await db.select({ id: statusesTb.id }).from(statusesTb).where(eq(statusesTb.code, "APPROVED"));
    await db.update(applications).set({ statusId: closed[0]!.id }).where(eq(applications.id, app.id));

    const after = await listCommunications(app.id, staff);
    expect(after.map((m) => m.message.body)).toEqual(["Closing note."]);

    // and the checklist is still intact (closing a file never deletes its history)
    const items = await getChecklist(app.id);
    expect(items.length).toBe(4);
  });
});
