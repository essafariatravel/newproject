import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { applicants, applications, notifications, statuses, visaTypes } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { createDraftApplication } from "@/lib/applications";
import { addApplicantAction, assignOfficerAction, historyFor, submissionGateFor } from "@/app/actions/applications";

suiteSetup();
afterEach(() => { request.cookie = ""; });

async function makeAgencyAApplication() {
  const agency = await agencyByEmail("ops@agencya.example");
  const actor = await userByEmail("a-admin@test.example");
  const visa = (await db.select().from(visaTypes).limit(1))[0]!;
  return createDraftApplication({ agencyId: agency.id, visaTypeId: visa.id, createdBy: actor });
}

describe("exported Server Action authorization", () => {
  it("does not expose submission-gate or status-history data cross-tenant", async () => {
    const app = await makeAgencyAApplication();
    const foreign = await userByEmail("b-admin@test.example");
    const session = await createSession(foreign.id);
    request.cookie = session.token;

    await expect(submissionGateFor(app.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(historyFor(app.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows the owning tenant and staff to read the same helper data", async () => {
    const app = await makeAgencyAApplication();
    for (const actor of [await userByEmail("a-user@test.example"), await userByEmail("agent@test.example")]) {
      const session = await createSession(actor.id);
      request.cookie = session.token;
      await expect(submissionGateFor(app.id)).resolves.toHaveProperty("ok");
      await expect(historyFor(app.id)).resolves.toBeInstanceOf(Array);
    }
  });

  it("rejects unauthenticated direct invocation", async () => {
    const app = await makeAgencyAApplication();
    request.cookie = "";
    await expect(submissionGateFor(app.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(historyFor(app.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });


  it("cannot mutate traveller data through a direct Server Action after submission", async () => {
    const app = await makeAgencyAApplication();
    const owner = await userByEmail("a-admin@test.example");
    const [submitted] = await db.select({ id: statuses.id }).from(statuses).where(eq(statuses.code, "SUBMITTED")).limit(1);
    expect(submitted).toBeDefined();
    await db.update(applications).set({ statusId: submitted!.id, submittedAt: new Date() }).where(eq(applications.id, app.id));
    request.cookie = (await createSession(owner.id)).token;

    const before = await db.select().from(applicants).where(eq(applicants.applicationId, app.id));
    const form = new FormData();
    form.set("applicationId", app.id);
    form.set("firstName", "Injected");
    form.set("lastName", "Traveller");
    form.set("dateOfBirth", "1990-01-01");
    form.set("nationality", "DZ");
    form.set("passportNumber", "AA123456");
    form.set("passportExpiryDate", "2032-01-01");

    await expect(addApplicantAction(form)).rejects.toThrow(/NEXT_REDIRECT/);
    const after = await db.select().from(applicants).where(eq(applicants.applicationId, app.id));
    expect(after).toEqual(before);
  });

  it("cannot assign a dossier to an agency account by forging the assignee UUID", async () => {
    const app = await makeAgencyAApplication();
    const staff = await userByEmail("admin@test.example");
    const foreignAgencyUser = await userByEmail("b-user@test.example");
    request.cookie = (await createSession(staff.id)).token;

    const form = new FormData();
    form.set("applicationId", app.id);
    form.set("assignedTo", foreignAgencyUser.id);
    await expect(assignOfficerAction(form)).rejects.toThrow(/NEXT_REDIRECT/);

    const [current] = await db.select({ assignedTo: applications.assignedTo }).from(applications).where(eq(applications.id, app.id));
    expect(current?.assignedTo).toBeNull();
    const leaked = await db.select().from(notifications).where(eq(notifications.userId, foreignAgencyUser.id));
    expect(leaked.some((n) => n.applicationId === app.id && n.type === "APPLICATION_ASSIGNED")).toBe(false);
  });

  it("never treats a crafted application id as an authorization shortcut", async () => {
    const foreign = await userByEmail("b-admin@test.example");
    request.cookie = (await createSession(foreign.id)).token;
    await expect(submissionGateFor("11111111-1111-4111-8111-111111111111")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
