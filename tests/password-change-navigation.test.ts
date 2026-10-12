import { afterEach, describe, expect, it, vi } from "vitest";
import { changePasswordAction } from "@/app/actions/auth";
import * as auth from "@/lib/auth";
import * as security from "@/lib/account-security";
import type { AuthUser, Role } from "@/lib/types";

afterEach(() => vi.restoreAllMocks());

// Authentication and password persistence have separate database integration
// coverage. These tests exercise the real action's success/error navigation.
function prepare(role: Role, forced: boolean) {
  const actor = { id: crypto.randomUUID(), role, agencyId: role === "AGENCY_ADMIN" ? crypto.randomUUID() : null,
    name: "Synthetic actor", email: "synthetic@test.example", mustChangePassword: forced } as AuthUser;
  vi.spyOn(auth, "requirePasswordChangeSession").mockResolvedValue(actor);
  vi.spyOn(security, "changeAccountPassword").mockResolvedValue(2);
  vi.spyOn(auth, "createSession").mockResolvedValue({ token: "synthetic-not-a-session", expiresAt: new Date("2027-01-01") });
  vi.spyOn(auth, "setSessionCookie").mockResolvedValue();
  const form = new FormData();
  form.set("current", "Synthetic-Old-123"); form.set("password", "Synthetic-New-123"); form.set("confirm", "Synthetic-New-123");
  return form;
}

describe("password change action navigation", () => {
  it.each([["AGENCY_ADMIN", "/portal"], ["SUPER_ADMIN", "/mfa"]] as const)("takes a forced %s change into its authorized next step", async (role, path) => {
    const form = prepare(role, true);
    await expect(changePasswordAction(form)).rejects.toMatchObject({ digest: expect.stringContaining(`${path}?ok=`) });
  });
  it("keeps a voluntary password change on the account page", async () => {
    await expect(changePasswordAction(prepare("AGENCY_ADMIN", false))).rejects.toMatchObject({ digest: expect.stringContaining("/change-password?ok=") });
  });
  it("keeps an invalid forced change on the form with error feedback", async () => {
    const form = prepare("AGENCY_ADMIN", true); form.set("confirm", "Mismatch-123");
    await expect(changePasswordAction(form)).rejects.toMatchObject({ digest: expect.stringContaining("/change-password?error=") });
  });
});
