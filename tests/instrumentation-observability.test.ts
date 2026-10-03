import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "../src/instrumentation";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Next.js request error instrumentation", () => {
  it("captures framework context without request URL, headers or query data", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secretQuery = "passport=AA1234567";
    const secretCookie = "session=private-session-token";

    await onRequestError(
      Object.assign(new Error("render failed"), { digest: "safe-digest" }),
      {
        path: `/portal/applications/secret-id?${secretQuery}`,
        method: "GET",
        headers: {
          cookie: secretCookie,
          authorization: "Bearer private-auth-token",
        },
      },
      {
        routerKind: "App Router",
        routePath: "/portal/applications/[id]",
        routeType: "render",
        renderSource: "server-rendering",
        revalidateReason: undefined,
      },
    );

    expect(errorLog).toHaveBeenCalledTimes(1);
    const line = String(errorLog.mock.calls[0]?.[0] ?? "");
    expect(line).toContain("next.request.unhandled_error");
    expect(line).toContain("/portal/applications/[id]");
    expect(line).toContain("safe-digest");
    expect(line).not.toContain("secret-id");
    expect(line).not.toContain(secretQuery);
    expect(line).not.toContain(secretCookie);
    expect(line).not.toContain("private-auth-token");
  });
});
