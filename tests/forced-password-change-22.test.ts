import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/db/schema";
import { createAgencyWithAdminAction } from "@/app/actions/admin";
import { requireUser, getSessionUser } from "@/lib/auth";
import { authenticate } from "@/lib/auth";
import { userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
import { vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const SUPER = () => userByEmail("superadmin@test.example");

async function adminForm(suffix: string) {
  const fd = new FormData();
  fd.set("legalName", `Onboard SARL ${suffix}`);
  fd.set("tradingName", `Onboard ${suffix}`);
  fd.set("email", `agency-${suffix}@test.example`);
  fd.set("phone", "+213550001122");
  fd.set("city", "Algiers");
  fd.set("country", "Algeria");
  fd.set("currency", "DZD");
  fd.set("adminName", "First Admin");
  fd.set("adminEmail", `admin-${suffix}@test.example`);
  fd.set("adminPassword", "TempOnboard42");
  return fd;
}

describe("Phase 2.2 §10 — SUPER_ADMIN agent + first admin onboarding", () => {
  it("creates agency + AGENCY_ADMIN, hashed temp password, mustChangePassword=true, audit without secrets", async () => {
    const suffix = Date.now().toString(36);
    const superA = await SUPER();
    const { createSession } = await import("@/lib/auth");
    const { token } = await createSession(superA.id);
    request.cookie = token;

    await expect(createAgencyWithAdminAction(await adminForm(suffix))).rejects.toMatchObject({ message: expect.stringContaining("NEXT_REDIRECT") });

    const admin = (await db.select().from(users).where(eq(users.email, `admin-${suffix}@test.example`)))[0]!;
    expect(admin.role).toBe("AGENCY_ADMIN");
    expect(admin.agencyId).not.toBeNull();
    expect(admin.mustChangePassword).toBe(true);
    expect(admin.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(admin.passwordHash).not.toContain("TempOnboard42");

    // correct temp password authenticates; wrong one doesn't
    const good = await authenticate(`admin-${suffix}@test.example`, "TempOnboard42");
    expect(good.email).toBe(`admin-${suffix}@test.example`);
    await expect(authenticate(`admin-${suffix}@test.example`, "WrongPass999")).rejects.toThrow();

    // audit records onboarding WITHOUT the password anywhere
    const audit = (await db.select().from(auditLogs).where(eq(auditLogs.action, "AGENCY_ONBOARDED"))).at(-1)!;
    expect(JSON.stringify(audit.metadata)).not.toContain("TempOnboard42");
    expect(JSON.stringify(audit.metadata)).toContain(`admin-${suffix}@test.example`);
  });

  it("rejects duplicate agency legal names and duplicate admin emails (no partial writes)", async () => {
    const suffix = "d" + Date.now().toString(36).slice(-6);
    const superA = await SUPER();
    const { createSession } = await import("@/lib/auth");
    const { token } = await createSession(superA.id);
    request.cookie = token;
    await expect(createAgencyWithAdminAction(await adminForm(suffix))).rejects.toBeDefined().catch(() => undefined);
    // second run, same legal name + different admin email → rejected, no orphan admin
    const fd2 = await adminForm(suffix);
    fd2.set("adminEmail", `other-${suffix}@test.example`);
    let threw = false;
    try { await createAgencyWithAdminAction(fd2); } catch { threw = true; }
    expect(threw).toBe(true);
    expect((await db.select().from(users).where(eq(users.email, `other-${suffix}@test.example`))).length).toBe(0);
  });

  it("non-SUPER_ADMIN staff cannot use the one-shot onboarding (forbidden)", async () => {
    const adminRole = await userByEmail("admin@test.example");
    const { createSession } = await import("@/lib/auth");
    const { token } = await createSession(adminRole.id);
    request.cookie = token;
    const suffix = "f" + Date.now().toString(36).slice(-6);
    await expect(createAgencyWithAdminAction(await adminForm(suffix))).rejects.toThrow();
    expect((await db.select().from(users).where(eq(users.email, `admin-${suffix}@test.example`))).length).toBe(0);
    request.cookie = "";
  });
});

describe("Phase 2.2 §11 — mandatory first password change (server-authoritative)", () => {
  async function flaggedUser(suffix: string) {
    const superA = await SUPER();
    const { token } = await (await import("@/lib/auth")).createSession(superA.id);
    request.cookie = token;
    const fd = await adminForm("pc" + suffix);
    await expect(createAgencyWithAdminAction(fd)).rejects.toBeDefined().catch(() => undefined);
    const admin = (await db.select().from(users).where(eq(users.email, `admin-pc${suffix}@test.example`)))[0]!;
    request.cookie = "";
    return admin;
  }

  it("requireUser() (every server-action guard) throws PASSWORD_CHANGE_REQUIRED while the flag is set", async () => {
    const admin = await flaggedUser("a" + Date.now().toString(36).slice(-4));
    // mint a session for the flagged admin
    const sessionRows = await db.execute(
      (await import("drizzle-orm")).sql`select id from sessions order by created_at desc limit 1`,
    );
    void sessionRows;
    const { token } = await (await import("@/lib/auth")).createSession(admin.id);
    request.cookie = token;
    const sessionUser = await getSessionUser();
    expect(sessionUser?.mustChangePassword).toBe(true);
    await expect(requireUser()).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    request.cookie = "";
  });

  it("reject paths: wrong current password, mismatched confirm, temp reused — flag stays on", async () => {
    const suffix = "b" + Date.now().toString(36).slice(-4);
    const admin = await flaggedUser(suffix);
    const { token } = await (await import("@/lib/auth")).createSession(admin.id);
    request.cookie = token;
    const { changePasswordAction } = await import("@/app/actions/auth");
    const mk = (current: string, password: string, confirm: string) => {
      const fd = new FormData();
      fd.set("current", current); fd.set("password", password); fd.set("confirm", confirm);
      return fd;
    };
    await expect(changePasswordAction(mk("WrongTemp99", "BrandNewPass1", "BrandNewPass1"))).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(changePasswordAction(mk("TempOnboard42", "BrandNewPass1", "BrandNewPass2"))).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(changePasswordAction(mk("TempOnboard42", "TempOnboard42", "TempOnboard42"))).rejects.toThrow(/NEXT_REDIRECT/);
    const after = (await db.select().from(users).where(eq(users.id, admin.id)))[0]!;
    expect(after.mustChangePassword).toBe(true); // still locked
    request.cookie = "";
  });

  it("successful change: unlocks, new password works, temp dead, audited without secrets", async () => {
    const suffix = "c" + Date.now().toString(36).slice(-4);
    const admin = await flaggedUser(suffix);
    const { token } = await (await import("@/lib/auth")).createSession(admin.id);
    request.cookie = token;
    const { changePasswordAction } = await import("@/app/actions/auth");
    const fd = new FormData();
    fd.set("current", "TempOnboard42"); fd.set("password", "ChosenPass77"); fd.set("confirm", "ChosenPass77");
    await expect(changePasswordAction(fd)).rejects.toThrow(/NEXT_REDIRECT/); // redirect == success signal
    const after = (await db.select().from(users).where(eq(users.id, admin.id)))[0]!;
    expect(after.mustChangePassword).toBe(false);
    // fresh session → requireUser no longer throws
    const { token: token2 } = await (await import("@/lib/auth")).createSession(admin.id);
    request.cookie = token2;
    await expect(requireUser()).resolves.toMatchObject({ email: `admin-pc${suffix}@test.example` });
    await expect(authenticate(`admin-pc${suffix}@test.example`, "ChosenPass77")).resolves.toBeTruthy();
    await expect(authenticate(`admin-pc${suffix}@test.example`, "TempOnboard42")).rejects.toThrow();
    const audit = (await db.select().from(auditLogs).where(eq(auditLogs.action, "PASSWORD_CHANGED"))).at(-1)!;
    expect(audit.entityId).toBe(admin.id);
    expect(JSON.stringify(audit.metadata ?? {})).not.toContain("ChosenPass77");
    expect(JSON.stringify(audit.metadata ?? {})).not.toContain("TempOnboard42");
    request.cookie = "";
  });

  it("the change-pass action refuses for users WITHOUT a pending change (manual URL/crafted calls)", async () => {
    const superA = await SUPER();
    const { token } = await (await import("@/lib/auth")).createSession(superA.id);
    request.cookie = token;
    const { changePasswordAction } = await import("@/app/actions/auth");
    const fd = new FormData();
    fd.set("current", "x234567890"); fd.set("password", "AnotherPass12"); fd.set("confirm", "AnotherPass12");
    await expect(changePasswordAction(fd)).rejects.toThrow(/NEXT_REDIRECT/); // error-redirect: BAD_STATE
    const after = (await db.select().from(users).where(eq(users.id, superA.id)))[0]!;
    expect(after.mustChangePassword).toBe(false);
    request.cookie = "";
  });
});
