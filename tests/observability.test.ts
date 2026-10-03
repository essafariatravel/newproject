import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logErrorOnce,
  logEvent,
  pseudonymizeIdentifier,
  withObservabilityContext,
} from "../src/lib/observability";

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

  it("drops sensitive keys and redacts sensitive free text", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logEvent({
      eventName: "privacy.test",
      severity: "error",
      metadata: {
        password: "DontLogMe",
        authorization: "Bearer super-secret",
        email: "person@example.com",
        harmless: "failed for person@example.com token=abc123",
      },
    });

    const line = String(error.mock.calls[0]?.[0]);
    expect(line).not.toContain("DontLogMe");
    expect(line).not.toContain("super-secret");
    expect(line).not.toContain("person@example.com");
    expect(line).not.toContain("abc123");
    expect(line).toContain("harmless");
  });

  it("pseudonymizes identifiers only when a telemetry key exists", () => {
    expect(pseudonymizeIdentifier("agency-1")).toBeNull();

    process.env.TELEMETRY_PSEUDONYMIZATION_KEY = "test-only-key";
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
