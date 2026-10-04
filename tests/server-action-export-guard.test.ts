import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const PUBLIC_EXPORTS = new Set([
  "activateAccountAction",       // bearer activation token
  "loginAction",                 // credential entry point
  "logoutAction",                // only destroys the caller's cookie/session
  "touchSessionAction",          // service resolves the current session; no target id input
  "requestRecoveryAction",       // generic, rate-limited recovery intake
  "resetAccessAction",           // single-use bearer reset token
  "submitRegistrationAction",    // public partnership application
  "setUiLocaleAction",           // cosmetic cookie + same-origin redirect only
  "currentBranding",             // public presentation settings
]);

const AUTH_MARKERS = [
  "requireUser(",
  "requireStaff(",
  "requireAgencyUser(",
  "requirePasswordChangeSession(",
  "requireDecisionMaker(",
  "getSessionUser(",
  "runConfigAction(",
  "refuseLegacyMutation(",
];

describe("Server Action export boundary", () => {
  it("requires explicit authentication in every non-public exported Server Action", () => {
    const dir = path.join(__dirname, "..", "src", "app", "actions");
    const failures: string[] = [];

    for (const name of readdirSync(dir).filter((file) => file.endsWith(".ts"))) {
      const source = readFileSync(path.join(dir, name), "utf8");
      if (!source.includes('"use server"')) continue;
      const matches = [...source.matchAll(/export\s+async\s+function\s+(\w+)/g)];
      for (let i = 0; i < matches.length; i += 1) {
        const match = matches[i]!;
        const exportName = match[1]!;
        if (PUBLIC_EXPORTS.has(exportName)) continue;
        const start = match.index ?? 0;
        const end = matches[i + 1]?.index ?? source.length;
        const body = source.slice(start, end);
        if (!AUTH_MARKERS.some((marker) => body.includes(marker))) {
          failures.push(`${name}:${exportName}`);
        }
      }
    }

    expect(
      failures,
      `Non-public Server Actions without an explicit auth guard: ${failures.join(", ")}`,
    ).toEqual([]);
  });
});
