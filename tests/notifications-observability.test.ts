import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyUsersBestEffort } from "../src/lib/notifications";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("best-effort notifications", () => {
  it("does not turn recipient lookup failure into a business-operation failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const recipientFailure = Promise.reject(new Error("recipient lookup failed"));

    await expect(
      notifyUsersBestEffort(
        recipientFailure,
        {
          type: "STATUS_CHANGED",
          title: "Sensitive business title",
          body: "Sensitive business body",
          agencyId: "agency-id",
          applicationId: "application-id",
        },
        {
          actorRole: "ADMIN",
          tenantRef: "tenant-ref",
          resourceType: "application",
          resourceRef: "resource-ref",
        },
      ),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0] ?? "");
    expect(line).toContain("notification.delivery.failed");
    expect(line).not.toContain("Sensitive business title");
    expect(line).not.toContain("Sensitive business body");
    expect(line).not.toContain("agency-id");
    expect(line).not.toContain("application-id");
  });
});
