import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logErrorOnce,
  logEvent,
  pseudonymizeIdentifier,
  withObservabilityContext,
} from "../src/lib/observability";
import { redactSensitiveText } from "../src/lib/safe-error";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TELEMETRY_PSEUDONYMIZATION_KEY;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
});

describe("privacy-first observability", () => {
  it("emits environment, release and correlation fields", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
    const info = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await withObservabilityContext(
      { requestId: "req-123", action: "test.action" },
      async () => {
        logEvent({ eventName: "test.succeeded", result: "ok" });
      },
    );

    expect(info).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(info.mock.calls[0]?.[0]).trim());
    expect(body.environment).toBe("preview");
    expect(body.release_sha).toBe("abc123");
    expect(body.request_id).toBe("req-123");
    expect(body.event_name).toBe("test.succeeded");
    expect(body.action).toBe("test.action");
  });

  it("keeps generated request correlation IDs opaque and correlatable", async () => {
    const info = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await withObservabilityContext({}, async () => {
      logEvent({ eventName: "test.generated-request-id" });
    });

    const body = JSON.parse(String(info.mock.calls[0]?.[0]).trim());
    expect(body.request_id).toMatch(/^req_[0-9a-f]{32}$/);
    expect(body.request_id).not.toBe("<redacted-id>");
  });

  it("drops sensitive keys and redacts sensitive free text", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const sensitivePasswordValue = ["runtime", "password", "fixture"].join("-");
    const authorizationValue = ["Bearer", ["runtime", "auth", "fixture"].join("-")].join(" ");
    const emailValue = ["person", "example.test"].join("@");
    const tokenValue = ["runtime", "token", "fixture"].join("-");

    logEvent({
      eventName: "privacy.test",
      severity: "error",
      metadata: {
        password: sensitivePasswordValue,
        authorization: authorizationValue,
        email: emailValue,
        harmless: `failed for ${emailValue} token=${tokenValue}`,
      },
    });

    const line = String(error.mock.calls[0]?.[0]);
    expect(line).not.toContain(sensitivePasswordValue);
    expect(line).not.toContain(authorizationValue);
    expect(line).not.toContain(emailValue);
    expect(line).not.toContain(tokenValue);
    expect(line).toContain("harmless");
  });

  it("drops raw business identifiers and file metadata keys", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logEvent({
      eventName: "privacy.business-identifiers",
      severity: "error",
      metadata: {
        agency_id: "agency-raw-id",
        application_id: "application-raw-id",
        document_id: "document-raw-id",
        wallet_transaction_id: "wallet-raw-id",
        reference: "APP-2026-000001",
        filename: "passport-person-name.pdf",
        storage_key: "tenant/private/document-key",
        harmless_count: 3,
      },
    });

    const line = String(error.mock.calls[0]?.[0]);
    expect(line).not.toContain("agency-raw-id");
    expect(line).not.toContain("application-raw-id");
    expect(line).not.toContain("document-raw-id");
    expect(line).not.toContain("wallet-raw-id");
    expect(line).not.toContain("APP-2026-000001");
    expect(line).not.toContain("passport-person-name.pdf");
    expect(line).not.toContain("tenant/private/document-key");
    expect(line).toContain("harmless_count");
  });

  it("redacts network addresses, UUIDs and managed database hosts", () => {
    const raw = [
      "connection failed",
      "10.20.30.40",
      "123e4567-e89b-42d3-a456-426614174000",
      "db.example.supabase.co",
    ].join(" ");
    const safe = redactSensitiveText(raw);
    expect(safe).not.toContain("10.20.30.40");
    expect(safe).not.toContain("123e4567-e89b-42d3-a456-426614174000");
    expect(safe).not.toContain("db.example.supabase.co");
    expect(safe).toContain("<redacted-ip>");
    expect(safe).toContain("<redacted-id>");
    expect(safe).toContain("<redacted-host>");
  });

  it("rejects a weak telemetry pseudonymization key", () => {
    process.env.TELEMETRY_PSEUDONYMIZATION_KEY = "weak-key";
    expect(pseudonymizeIdentifier("agency-1")).toBeNull();
  });

  it("redacts filesystem paths from free-form diagnostics", () => {
    const unixPath = "/tmp/private/client-passport.pdf";
    const windowsPath = "C:\\Users\\Private\\client-passport.pdf";
    const safe = redactSensitiveText(`failed reading ${unixPath} and ${windowsPath}`);
    expect(safe).not.toContain(unixPath);
    expect(safe).not.toContain(windowsPath);
    expect(safe).toContain("<redacted-path>");
  });

  it("pseudonymizes identifiers only when a telemetry key exists", () => {
    expect(pseudonymizeIdentifier("agency-1")).toBeNull();

    process.env.TELEMETRY_PSEUDONYMIZATION_KEY = "test-only-key-0123456789abcdef-XYZ";
    const first = pseudonymizeIdentifier("agency-1");
    const second = pseudonymizeIdentifier("agency-1");

    expect(first).toBe(second);
    expect(first).not.toContain("agency-1");
    expect(first).toHaveLength(24);
  });

  it("logs the same Error object only once", () => {
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const err = new Error("database failed token=top-secret");

    logErrorOnce("db.failed", err, { severity: "error" });
    logErrorOnce("action.failed", err, { severity: "error" });

    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(String(errorLog.mock.calls[0]?.[0])).not.toContain("top-secret");
  });
});
