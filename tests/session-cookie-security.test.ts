import { afterEach, describe, expect, it } from "vitest";
import { request } from "./helpers/request";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth";
import { PRODUCTION_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/types";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(async () => {
  process.env.NODE_ENV = originalNodeEnv;
  request.set.mockClear();
  request.cookie = "";
});

describe("session cookie hardening", () => {
  it("uses a __Host- cookie with Secure + root Path in Production", async () => {
    process.env.NODE_ENV = "production";
    request.set.mockClear();
    await setSessionCookie("opaque-session", new Date(Date.now() + 60_000));
    expect(PRODUCTION_SESSION_COOKIE).toBe("__Host-evos_session");
    expect(request.set).toHaveBeenCalledWith(
      PRODUCTION_SESSION_COOKIE,
      "opaque-session",
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", path: "/" }),
    );
    await clearSessionCookie();
  });

  it("keeps the legacy local/test cookie name outside Production", async () => {
    process.env.NODE_ENV = "test";
    request.set.mockClear();
    await setSessionCookie("opaque-session", new Date(Date.now() + 60_000));
    expect(request.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      "opaque-session",
      expect.objectContaining({ httpOnly: true, secure: false, sameSite: "lax", path: "/" }),
    );
  });
});
