export interface IdentityColumnRow {
  table_name: string;
  column_name: string;
}

export interface RuntimeIdentityPolicy {
  hasActivationPending: boolean;
  hasMustChangePassword: boolean;
  hasUserCredentialVersion: boolean;
  hasSessionLastActivityAt: boolean;
  hasSessionCredentialVersion: boolean;
  hasSessionIpAddress: boolean;
  hasSessionUserAgent: boolean;
  userCredentialSelect: string;
  activeIdentityClauses: string;
}

export function runtimeIdentityPolicy(rows: readonly IdentityColumnRow[]): RuntimeIdentityPolicy {
  const has = (table: "users" | "sessions", column: string) =>
    rows.some((row) => row.table_name === table && row.column_name === column);

  const hasActivationPending = has("users", "activation_pending");
  const hasMustChangePassword = has("users", "must_change_password");
  const hasUserCredentialVersion = has("users", "credential_version");

  return {
    hasActivationPending,
    hasMustChangePassword,
    hasUserCredentialVersion,
    hasSessionLastActivityAt: has("sessions", "last_activity_at"),
    hasSessionCredentialVersion: has("sessions", "credential_version"),
    hasSessionIpAddress: has("sessions", "ip_address"),
    hasSessionUserAgent: has("sessions", "user_agent"),
    userCredentialSelect: hasUserCredentialVersion
      ? "u.credential_version"
      : "0::int as credential_version",
    activeIdentityClauses: [
      hasActivationPending ? "not u.activation_pending" : null,
      hasMustChangePassword ? "not u.must_change_password" : null,
    ].filter(Boolean).map((condition) => `and ${condition}`).join("\n          "),
  };
}

export function recoverySessionInsertParts(
  policy: RuntimeIdentityPolicy,
  credentialVersion: number,
): {
  columns: string[];
  values: string[];
  extraParams: unknown[];
} {
  const columns = ["user_id", "token_hash", "expires_at"];
  const values = ["$1::uuid", "$2", "now()+interval '1 hour'"];
  const extraParams: unknown[] = [];

  if (policy.hasSessionLastActivityAt) {
    columns.push("last_activity_at");
    values.push("now()");
  }
  if (policy.hasSessionCredentialVersion) {
    extraParams.push(credentialVersion);
    columns.push("credential_version");
    values.push(`$${2 + extraParams.length}`);
  }
  if (policy.hasSessionIpAddress) {
    columns.push("ip_address");
    values.push("null");
  }
  if (policy.hasSessionUserAgent) {
    columns.push("user_agent");
    values.push("'ESSAFARIA DR recovery probe'");
  }

  return { columns, values, extraParams };
}
