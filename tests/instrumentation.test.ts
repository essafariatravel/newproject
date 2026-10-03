import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "../src/instrumentation";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NEXT_RUNTIME;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
});

describe("Next.js server error instrumentation", () => {
  it("captures structural context without request secrets or raw path/query data", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_SHA = "release-sha";
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const error = Object.assign(
      new Error("Failed with token=top-secret and person@example.com"),
      { digest: "digest-123" },
    );

    await onRequestError(
      error,
      {
        path: "/portal/applications/secret-id?token=raw-secret",
        method: "POST",
        headers: { authorization: "Bearer raw-secret" },
      },
      {
        routerKind: "App Router",
        routePath: "/portal/applications/[id]",
        routeType: "action",
        renderSource: "react-server-components",
        revalidateReason: undefined,
        renderType: "dynamic",
      },
    );

    const line = stderr.mock.calls.map((call) => String(call[0])).join("");
    expect(line).toContain("next.request.unhandled_error");
    expect(line).toContain("/portal/applications/[id]");
    expect(line).toContain("digest-123");
    expect(line).toContain("release-sha");
    expect(line).not.toContain("top-secret");
    expect(line).not.toContain("person@example.com");
    expect(line).not.toContain("raw-secret");
    expect(line).not.toContain("secret-id");
  });
});
