/**
 * §18 / §42 — the embassy stage is a VISA-TYPE property, not a global step.
 *
 * Guards:
 *   - a programme declared NOT_APPLICABLE cannot be moved to the embassy stage
 *     (server-side, not only by hiding the option),
 *   - APPLICABLE keeps the stage available,
 *   - the agency progress strip only shows the embassy step when the programme
 *     declares it or the dossier has really been there — never a false step,
 *   - progress comes from the persisted history, with real timestamps.
 */
import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicants as applicantsTb, applications, checklistItems, statuses, visaTypes } from "@/db/schema";
import { changeApplicationStatus, createDraftApplication, submitApplication } from "@/lib/applications";
import { getEmbassyApplicability } from "@/lib/queries";
import { buildProgress } from "@/lib/progress";
import { AppError } from "@/lib/types";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { adjustWallet } from "@/lib/wallet";
import { uploadDocument } from "@/lib/documents";

suiteSetup();

async function context() {
  const staff = await userByEmail("admin@test.example");
  const superAdmin = await userByEmail("superadmin@test.example");
  const agency = await agencyByEmail("ops@agencya.example");
  const visa = (await db.select().from(visaTypes).where(eq(visaTypes.active, true)).limit(1))[0]!;
  return { staff, superAdmin, agency, visa };
}

async function setApplicability(visaTypeId: string, value: "NOT_APPLICABLE" | "OPTIONAL" | "APPLICABLE") {
  await db.update(visaTypes).set({ embassyApplicability: value }).where(eq(visaTypes.id, visaTypeId));
}

/** Draft → applicant + required docs → submitted → documents checking → in process. */
async function inProcessApplication(visaTypeId: string) {
  const { agency, superAdmin } = await context();
  await adjustWallet({ agencyId: agency.id, amount: 500000, reason: "embassy-applicability test funding", actor: superAdmin });
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId, createdBy: superAdmin });
  await db.insert(applicantsTb).values({
    applicationId: app.id,
    firstName: "Embassy",
    lastName: "Traveller",
    dateOfBirth: "1990-01-01",
    nationality: "Algeria",
    passportNumber: "DZ1234567",
    passportExpiryDate: "2032-01-01",
  });
  const required = await db
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.applicationId, app.id), eq(checklistItems.required, true)));
  for (const item of required) {
    await uploadDocument({
      applicationId: app.id,
      actor: superAdmin,
      file: { name: `${item.documentTypeCode}.pdf`, type: "application/pdf", size: 512, data: Buffer.from("d") },
      checklistItemId: item.id,
    });
  }
  await submitApplication({ applicationId: app.id, actor: superAdmin });
  const { staff } = await context();
  await changeApplicationStatus({ applicationId: app.id, toStatusCode: "DOCUMENTS_CHECKING", actor: staff });
  await changeApplicationStatus({ applicationId: app.id, toStatusCode: "IN_PROCESS", actor: staff });
  return app;
}

describe("§42 — embassy applicability is configured per visa type", () => {
  it("reads the configured value and fails safe to OPTIONAL", async () => {
    const { visa } = await context();
    await setApplicability(visa.id, "NOT_APPLICABLE");
    expect(await getEmbassyApplicability(visa.id)).toBe("NOT_APPLICABLE");
    await setApplicability(visa.id, "APPLICABLE");
    expect(await getEmbassyApplicability(visa.id)).toBe("APPLICABLE");
    expect(await getEmbassyApplicability(null)).toBe("OPTIONAL");
    expect(await getEmbassyApplicability("00000000-0000-0000-0000-000000000000")).toBe("OPTIONAL");
    await setApplicability(visa.id, "OPTIONAL");
  });
});

describe("§18 — the transition is enforced server-side", () => {
  it("refuses the embassy stage for a NOT_APPLICABLE programme", async () => {
    const { visa } = await context();
    await setApplicability(visa.id, "NOT_APPLICABLE");
    const app = await inProcessApplication(visa.id);

    const err = (await changeApplicationStatus({
      applicationId: app.id,
      toStatusCode: "EMBASSY_SENT",
      actor: await userByEmail("agent@test.example"),
    }).catch((e) => e)) as AppError;
    expect(err.code).toBe("INVALID_TRANSITION");
    expect(err.message).toContain("embassy");

    const rows = await db.select().from(applications).where(eq(applications.id, app.id));
    const embassyStatus = (await db.select().from(statuses).where(eq(statuses.code, "EMBASSY_SENT")))[0]!;
    expect(rows[0]!.statusId).not.toBe(embassyStatus.id);
  });

  it("allows the embassy stage when the programme declares it applicable", async () => {
    const { visa } = await context();
    await setApplicability(visa.id, "APPLICABLE");
    const app = await inProcessApplication(visa.id);

    const result = await changeApplicationStatus({
      applicationId: app.id,
      toStatusCode: "EMBASSY_SENT",
      actor: await userByEmail("agent@test.example"),
    });
    expect(result.to).toBe("EMBASSY_SENT");
    await setApplicability(visa.id, "OPTIONAL");
  });
});

describe("§17 — progress is derived from history, never invented", () => {
  const history = [
    { toStatusCode: "SUBMITTED", createdAt: new Date("2026-09-20T09:00:00Z") },
    { toStatusCode: "DOCUMENTS_CHECKING", createdAt: new Date("2026-09-20T12:00:00Z") },
    { toStatusCode: "IN_PROCESS", createdAt: new Date("2026-09-21T08:30:00Z") },
  ];

  it("hides the embassy step for a programme that never uses it", () => {
    const steps = buildProgress({ statusCode: "IN_PROCESS", history, embassyApplicability: "NOT_APPLICABLE" });
    expect(steps.map((s) => s.key)).not.toContain("embassy");
    expect(steps.map((s) => s.key)).toEqual(["submitted", "documents", "processing", "decision"]);
    expect(steps.find((s) => s.key === "processing")!.state).toBe("current");
    expect(steps.find((s) => s.key === "decision")!.state).toBe("pending");
  });

  it("shows the embassy step for an APPLICABLE programme", () => {
    const steps = buildProgress({ statusCode: "EMBASSY_SENT", history: [...history, { toStatusCode: "EMBASSY_SENT", createdAt: new Date("2026-09-22T07:00:00Z") }], embassyApplicability: "APPLICABLE" });
    const embassy = steps.find((s) => s.key === "embassy")!;
    expect(embassy.state).toBe("current");
    expect(embassy.at?.toISOString()).toBe("2026-09-22T07:00:00.000Z");
  });

  it("shows the embassy step once a dossier really went there, even if the flag was flipped later", () => {
    const steps = buildProgress({
      statusCode: "IN_PROCESS",
      history: [...history, { toStatusCode: "EMBASSY_SENT", createdAt: new Date("2026-09-22T07:00:00Z") }],
      embassyApplicability: "NOT_APPLICABLE",
    });
    expect(steps.map((s) => s.key)).toContain("embassy");
  });

  it("carries the real timestamp of every reached step and never fabricates one", () => {
    const steps = buildProgress({ statusCode: "IN_PROCESS", history, embassyApplicability: "OPTIONAL" });
    expect(steps.find((s) => s.key === "submitted")!.at?.toISOString()).toBe("2026-09-20T09:00:00.000Z");
    expect(steps.find((s) => s.key === "documents")!.at?.toISOString()).toBe("2026-09-20T12:00:00.000Z");
    expect(steps.find((s) => s.key === "decision")!.at).toBeNull();
    expect(steps.find((s) => s.key === "decision")!.state).toBe("pending");
  });

  it("ends on the decision step for a finished application", () => {
    const steps = buildProgress({
      statusCode: "APPROVED",
      history: [...history, { toStatusCode: "APPROVED", createdAt: new Date("2026-09-23T10:00:00Z") }],
      embassyApplicability: "NOT_APPLICABLE",
    });
    expect(steps.at(-1)!.key).toBe("decision");
    expect(steps.at(-1)!.state).toBe("done");
    expect(steps.at(-1)!.at?.toISOString()).toBe("2026-09-23T10:00:00.000Z");
  });
});

describe("§18 — the admin surface exposes the choice", () => {
  it("the visa-type editor offers the three documented values and explains the effect", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/admin/config/visa-types/[id]/page.tsx", "utf8");
    expect(src).toContain('name="embassyApplicability"');
    expect(src).toContain('value="NOT_APPLICABLE"');
    expect(src).toContain('value="OPTIONAL"');
    expect(src).toContain('value="APPLICABLE"');
    expect(src).toContain("never see an embassy step");

    const action = readFileSync("src/app/actions/config.ts", "utf8");
    expect(action).toContain('"NOT_APPLICABLE", "OPTIONAL", "APPLICABLE"');
    // The stamp is audited with the change.
    expect(action).toContain("embassyApplicability: data.embassyApplicability");
  });
});
