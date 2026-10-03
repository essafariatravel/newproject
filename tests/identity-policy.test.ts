import { describe, expect, it } from "vitest";
import { hasPermission, type Permission } from "@/lib/rbac";
import { STAFF_ROLES, type AuthUser } from "@/lib/types";

const actor = (role: AuthUser["role"]): AuthUser => ({
  id: "00000000-0000-0000-0000-000000000001", email: "staff@test.example",
  name: "Staff", role, agencyId: null, userStatus: "ACTIVE", agencyStatus: null, agencyName: null,
});

describe("V1 identity permission boundaries", () => {
  it("keeps all legacy operational staff roles equivalent", () => {
    const operations: Permission[] = ["agencies.manage", "registrations.manage", "config.manage", "wallet.adjust", "documents.review", "applications.status.change", "audit.view"];
    for (const role of STAFF_ROLES) for (const permission of operations) {
      expect(hasPermission(actor(role), permission), `${role}: ${permission}`).toBe(true);
    }
  });

  it("reserves staff account management for SUPER_ADMIN", () => {
    expect(hasPermission(actor("SUPER_ADMIN"), "users.manage")).toBe(true);
    for (const role of ["ADMIN", "VISA_AGENT", "ACCOUNTING"] as const) {
      expect(hasPermission(actor(role), "users.manage"), role).toBe(false);
    }
  });

  it("agency users cannot read unnecessary financial administration", () => {
    expect(hasPermission(actor("AGENCY_USER"), "transactions.view.own")).toBe(false);
    expect(hasPermission(actor("AGENCY_ADMIN"), "transactions.view.own")).toBe(true);
  });
});
