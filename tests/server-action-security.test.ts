import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { db } from "@/lib/db";
import { applications, visaTypes } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { createDraftApplication } from "@/lib/applications";
import { historyFor, submissionGateFor } from "@/app/actions/applications";

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

  it("never treats a crafted application id as an authorization shortcut", async () => {
    const foreign = await userByEmail("b-admin@test.example");
    request.cookie = (await createSession(foreign.id)).token;
    const real = (await db.select({ id: applications.id }).where(eq(applications.agencyId, foreign.agencyId!)).limit(1))[0];
    expect(real).toBeDefined();
    await expect(submissionGateFor("11111111-1111-4111-8111-111111111111")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
