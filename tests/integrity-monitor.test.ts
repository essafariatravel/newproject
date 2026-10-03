import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { GET as integrityGET } from "../src/app/api/internal/health/integrity/route";
import { runIntegrityChecks } from "@/lib/integrity";

suiteSetup();

describe("protected integrity monitor", () => {
  it("is disabled when the operator token is not configured", async () => {
    const previous = process.env.HEALTHCHECK_TOKEN;
    delete process.env.HEALTHCHECK_TOKEN;
    try {
      const res = await integrityGET(
        new Request("http://localhost/api/internal/health/integrity"),
      );
      expect(res.status).toBe(404);
    } finally {
      if (previous === undefined) delete process.env.HEALTHCHECK_TOKEN;
      else process.env.HEALTHCHECK_TOKEN = previous;
    }
  });

  it("rejects an invalid bearer token", async () => {
    const previous = process.env.HEALTHCHECK_TOKEN;
    process.env.HEALTHCHECK_TOKEN = "test-integrity-token-0123456789abcdef-XYZ";
    try {
      const res = await integrityGET(
        new Request("http://localhost/api/internal/health/integrity", {
          headers: { authorization: "Bearer wrong-token" },
        }),
      );
      expect(res.status).toBe(401);
    } finally {
      if (previous === undefined) delete process.env.HEALTHCHECK_TOKEN;
      else process.env.HEALTHCHECK_TOKEN = previous;
    }
  });

  it("returns aggregate checks only to an authorized operator", async () => {
    const previous = process.env.HEALTHCHECK_TOKEN;
    process.env.HEALTHCHECK_TOKEN = "test-integrity-token-0123456789abcdef-XYZ";
    try {
      const res = await integrityGET(
        new Request("http://localhost/api/internal/health/integrity", {
          headers: { authorization: "Bearer test-integrity-token-0123456789abcdef-XYZ" },
        }),
      );
      expect([200, 503]).toContain(res.status);
      const body = await res.json();
      expect(["healthy", "degraded", "violation", "unavailable"]).toContain(body.status);
      expect(body.cutoverAt).toBe("2026-10-03T00:00:00.000Z");

      if (body.checks) {
        expect(Object.keys(body.checks).sort()).toEqual([
          "duplicateApplicationCharges",
          "finalDecisionMissingDocument",
          "legacyFinalDecisionMissingDocument",
          "legacyMissingDocumentBlobs",
          "postCutoverMissingDocumentBlobs",
          "negativeBalances",
          "legacyNonDzdAgencyWallets",
          "postCutoverNonDzdAgencyWallets",
          "legacyNonDzdWalletRows",
          "postCutoverNonDzdWalletRows",
          "processedTopupAnomalies",
          "walletArithmeticAnomalies",
          "walletBalanceMismatches",
          "walletLedgerContinuityAnomalies",
        ].sort());
        const serialized = JSON.stringify(body);
        expect(serialized).not.toMatch(/@/);
        expect(serialized).not.toMatch(/passport|filename|storage_key|agency_id|application_id/i);
      }
    } finally {
      if (previous === undefined) delete process.env.HEALTHCHECK_TOKEN;
      else process.env.HEALTHCHECK_TOKEN = previous;
    }
  });

  it("requires an explicit Production cutover before integrity classification", async () => {
    const previousEnv = process.env.VERCEL_ENV;
    const previousCutover = process.env.OBSERVABILITY_CUTOVER_AT;
    process.env.VERCEL_ENV = "production";
    delete process.env.OBSERVABILITY_CUTOVER_AT;
    try {
      const missing = await runIntegrityChecks();
      expect(missing.status).toBe("unavailable");
      expect(missing.checks).toBeNull();
      expect(missing.cutoverAt).toBeNull();

      process.env.OBSERVABILITY_CUTOVER_AT = "not-a-date";
      const invalid = await runIntegrityChecks();
      expect(invalid.status).toBe("unavailable");
      expect(invalid.checks).toBeNull();
      expect(invalid.cutoverAt).toBeNull();

      process.env.OBSERVABILITY_CUTOVER_AT = "2026-10-03T00:00:00.000Z";
      const configured = await runIntegrityChecks();
      expect(configured.status).not.toBe("unavailable");
      expect(configured.cutoverAt).toBe("2026-10-03T00:00:00.000Z");
    } finally {
      if (previousEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previousEnv;
      if (previousCutover === undefined) delete process.env.OBSERVABILITY_CUTOVER_AT;
      else process.env.OBSERVABILITY_CUTOVER_AT = previousCutover;
    }
  });
});
