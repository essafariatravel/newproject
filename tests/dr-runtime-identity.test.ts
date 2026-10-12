import { describe, expect, it } from "vitest";
import {
  recoverySessionInsertParts,
  runtimeIdentityPolicy,
  type IdentityColumnRow,
} from "../scripts/lib/dr-runtime-identity";

function rows(table: "users" | "sessions", columns: string[]): IdentityColumnRow[] {
  return columns.map((column_name) => ({ table_name: table, column_name }));
}

describe("DR runtime identity compatibility", () => {
  it("supports the Production-era 0019 identity/session columns", () => {
    const policy = runtimeIdentityPolicy([
      ...rows("users", ["id","email","must_change_password","status","agency_id"]),
      ...rows("sessions", ["id","user_id","token_hash","expires_at","ip_address","user_agent","created_at"]),
    ]);

    expect(policy.hasActivationPending).toBe(false);
    expect(policy.hasUserCredentialVersion).toBe(false);
    expect(policy.hasSessionLastActivityAt).toBe(false);
    expect(policy.hasSessionCredentialVersion).toBe(false);
    expect(policy.userCredentialSelect).toBe("0::int as credential_version");
    expect(policy.activeIdentityClauses).toContain("not u.must_change_password");
    expect(policy.activeIdentityClauses).not.toContain("activation_pending");

    const insert = recoverySessionInsertParts(policy, 7);
    expect(insert.columns).toEqual([
      "user_id","token_hash","expires_at","ip_address","user_agent",
    ]);
    expect(insert.values).toEqual([
      "$1::uuid","$2","now()+interval '1 hour'","null","'ESSAFARIA DR recovery probe'",
    ]);
    expect(insert.extraParams).toEqual([]);
  });

  it("supports hardened 0020+ identity/session columns", () => {
    const policy = runtimeIdentityPolicy([
      ...rows("users", [
        "id","email","activation_pending","credential_version","must_change_password","status","agency_id",
      ]),
      ...rows("sessions", [
        "id","user_id","token_hash","expires_at","last_activity_at","credential_version","ip_address","user_agent","created_at",
      ]),
    ]);

    expect(policy.hasActivationPending).toBe(true);
    expect(policy.hasUserCredentialVersion).toBe(true);
    expect(policy.hasSessionLastActivityAt).toBe(true);
    expect(policy.hasSessionCredentialVersion).toBe(true);
    expect(policy.userCredentialSelect).toBe("u.credential_version");
    expect(policy.activeIdentityClauses).toContain("not u.activation_pending");
    expect(policy.activeIdentityClauses).toContain("not u.must_change_password");

    const insert = recoverySessionInsertParts(policy, 9);
    expect(insert.columns).toEqual([
      "user_id","token_hash","expires_at","last_activity_at","credential_version","ip_address","user_agent",
    ]);
    expect(insert.values).toEqual([
      "$1::uuid","$2","now()+interval '1 hour'","now()","$3","null","'ESSAFARIA DR recovery probe'",
    ]);
    expect(insert.extraParams).toEqual([9]);
  });
});
