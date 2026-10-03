import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { GET as integrityGET } from "../src/app/api/internal/health/integrity/route";

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
    process.env.HEALTHCHECK_TOKEN = "test-integrity-token";
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
    process.env.HEALTHCHECK_TOKEN = "test-integrity-token";
    try {
      const res = await integrityGET(
        new Request("http://localhost/api/internal/health/integrity", {
          headers: { authorization: "Bearer test-integrity-token" },
        }),
      );
      expect([200, 503]).toContain(res.status);
      const body = await res.json();
      expect(["healthy", "degraded", "violation", "unavailable"]).toContain(body.status);

      if (body.checks) {
        expect(Object.keys(body.checks).sort()).toEqual([
          "duplicateApplicationCharges",
          "finalDecisionMissingDocument",
          "legacyFinalDecisionMissingDocument",
          "missingDocumentBlobs",
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
});
