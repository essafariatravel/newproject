import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies } from "@/db/schema";
import { createSession } from "@/lib/auth";
import PortalProfilePage from "@/app/portal/profile/page";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";

suiteSetup();
afterEach(() => { request.cookie = ""; });
describe("profile financial visibility", () => {
  it("renders operational balance but excludes billing administration for Agency User", async () => {
    const member = await userByEmail("a-user@test.example");
    await db.update(agencies).set({ billingName: "PRIVATE-BILLING-NAME", billingEmail: "private-billing@example.test", billingTaxId: "PRIVATE-TAX-ID" }).where(eq(agencies.id, member.agencyId!));
    request.cookie = (await createSession(member.id)).token;
    const html = renderToStaticMarkup(await PortalProfilePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("DZD");
    expect(html).not.toContain("PRIVATE-BILLING-NAME");
    expect(html).not.toContain("private-billing@example.test");
    expect(html).not.toContain("PRIVATE-TAX-ID");
    expect(html).not.toContain("Add team member");
  });
  it("allows Agency Admin to inspect their own billing details and presents fixed member role", async () => {
    const admin = await userByEmail("a-admin@test.example");
    request.cookie = (await createSession(admin.id)).token;
    const html = renderToStaticMarkup(await PortalProfilePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("PRIVATE-BILLING-NAME");
    expect(html).toContain("Add team member");
    expect(html).toContain("p-role");
  });
  it("never renders another agency's billing profile", async () => {
    const admin = await userByEmail("b-admin@test.example");
    request.cookie = (await createSession(admin.id)).token;
    const html = renderToStaticMarkup(await PortalProfilePage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain("PRIVATE-BILLING-NAME");
    expect(html).not.toContain("private-billing@example.test");
  });
});
