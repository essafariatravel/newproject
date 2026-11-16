import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { db } from "@/lib/db";
import { changePasswordAction, loginAction } from "@/app/actions/auth";
import { activateAccountAction } from "@/app/actions/activation";
import { createSession } from "@/lib/auth";
import { userByEmail } from "./helpers/fixtures";
import { passwordLoginKey } from "@/lib/login-lockout";
import { requestRecoveryAction, resetAccessAction } from "@/app/actions/recovery";
import { submitRegistrationAction } from "@/app/actions/registrations";
import { assertPublicBotProtection, assertTurnstileResponse, publicClientIp, SITEVERIFY_URL } from "@/lib/bot-protection";
import { readTurnstileConfig } from "@/lib/turnstile-config";
import { hashToken } from "@/lib/crypto";
import { registrationCopy } from "@/lib/i18n";

suiteSetup();
const hostname = "preview.essafaria.example";
const valid = () => ({ success: true, hostname, action: "password_login", challenge_ts: new Date().toISOString() });
const form = (values: Record<string, string> = {}) => {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
};
beforeEach(async () => {
  await db.execute(sql`delete from auth_rate_limits`);
  request.cookie = ""; request.set.mockClear();
  vi.stubEnv("TURNSTILE_MODE", "managed");
  vi.stubEnv("TURNSTILE_SITE_KEY", "synthetic_public_site_key");
  vi.stubEnv("TURNSTILE_SECRET", "synthetic_private_test_secret");
  vi.stubEnv("TURNSTILE_HOSTNAMES", hostname);
  request.headers = new Headers({ origin: `https://${hostname}`, host: hostname, "x-forwarded-for": "192.0.2.4" });
});
afterEach(() => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  request.headers = new Headers({ "user-agent": "isolated-login-test" });
});

describe("direct public Server Actions cannot bypass verification", () => {
  it("rejects login before consuming an account attempt or issuing a session", async () => {
    const result = await loginAction({}, form({ identifier: "a-admin@test.example", password: "Test-Password-123" }));
    expect(result.error).toContain("Security verification");
    expect((await db.execute(sql`select count(*)::int n from auth_rate_limits where key not like ''`)).rows[0]?.n).toBe(0);
    expect(request.set).not.toHaveBeenCalled();
  });
  it("rejects recovery before enqueuing a request", async () => {
    const result = await requestRecoveryAction({}, form({ identifier: "a-admin@test.example" }));
    expect(result.error).toContain("Security verification");
    expect(result.message).toBeUndefined();
  });
  it("rejects reset even when called without the browser form", async () => {
    const result = await resetAccessAction({}, form({ token: "invalid", password: "Synthetic-Password-123", confirm: "Synthetic-Password-123" }));
    expect(result.error).toContain("Security verification");
  });
  it("rejects registration before other public validation or persistence", async () => {
    const result = await submitRegistrationAction({}, form({ locale: "en" }));
    expect(result.error).toContain("Security verification");
  });
  it("rejects direct activation without a challenge", async () => {
    const result = await activateAccountAction({}, form({
      token: "synthetic-activation-link", password: "Synthetic-Password-123", passwordConfirm: "Synthetic-Password-123",
    }));
    expect(result.error).toContain("Security verification");
  });
  it("rejects direct password definition even with a legitimate pending session", async () => {
    const user = await userByEmail("a-user@test.example");
    request.cookie = (await createSession(user.id)).token;
    await expect(changePasswordAction(form({
      current: "Test-Password-123", password: "Synthetic-Password-123", confirm: "Synthetic-Password-123",
    }))).rejects.toMatchObject({ digest: expect.stringContaining("Security") });
    expect(request.set).not.toHaveBeenCalled();
  });
  it.each(["invalid", "expired", "unavailable"])("does not count a %s challenge as a password failure", async kind => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (kind === "unavailable") return new Response("", { status: 503 });
      if (kind === "invalid") return Response.json({ success: false });
      return Response.json({ ...valid(), challenge_ts: new Date(Date.now() - 301_000).toISOString() });
    }));
    const email = "a-user@test.example";
    const result = await loginAction({}, form({ identifier: email, password: "wrong", "cf-turnstile-response": kind }));
    expect(result.error).toContain("Security verification");
    expect((await db.execute(sql`select key from auth_rate_limits where key=${passwordLoginKey(email)}`)).rows).toEqual([]);
  });
  it("preserves a legitimate login through the existing session path", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(valid())));
    await expect(loginAction({}, form({ identifier: "b-admin@test.example", password: "Test-Password-123", "cf-turnstile-response": "valid-synthetic-login" }))).rejects.toMatchObject({ digest: expect.stringContaining("/portal") });
    expect(request.set).toHaveBeenCalled();
  });
});

describe("Turnstile server boundary", () => {
  it.each([
    { success: false }, { action: "account_recovery" }, { hostname: "attacker.example" },
    { challenge_ts: new Date(Date.now() - 300_001).toISOString() },
    { challenge_ts: new Date(Date.now() + 60_000).toISOString() }, { challenge_ts: "bad" }, { success: "true" },
  ])("rejects a mismatched Siteverify assertion %j", override => {
    expect(() => assertTurnstileResponse({ ...valid(), ...override }, "password_login", [hostname])).toThrow();
  });
  it("accepts a fresh matching assertion", () => {
    expect(() => assertTurnstileResponse(valid(), "password_login", [hostname])).not.toThrow();
  });
  it("rejects a token reused concurrently across distributed application instances", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(valid())));
    const data = form({ "cf-turnstile-response": "synthetic-single-use-concurrent" });
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => assertPublicBotProtection(data, "password_login", request.headers)));
    expect(results.filter(value => value.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(value => value.status === "rejected")).toHaveLength(3);
  });
  it.each(["missing", "duplicate", "oversized", "file", "origin", "spoofed-host"])("rejects %s input before contacting Siteverify", async kind => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const data = form({ "cf-turnstile-response": "synthetic" });
    const hdrs = new Headers(request.headers);
    if (kind === "missing") data.delete("cf-turnstile-response");
    if (kind === "duplicate") data.append("cf-turnstile-response", "second");
    if (kind === "oversized") data.set("cf-turnstile-response", "x".repeat(2049));
    if (kind === "file") data.set("cf-turnstile-response", new Blob(["token"]), "token.txt");
    if (kind === "origin") hdrs.set("origin", "https://attacker.example");
    if (kind === "spoofed-host") hdrs.set("host", "attacker.example");
    await expect(assertPublicBotProtection(data, "password_login", hdrs)).rejects.toMatchObject({ code: "BOT_INVALID" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["http", "json", "timeout", "rejected-token"])("fails closed on %s without leaking a secret", async kind => {
    vi.stubGlobal("fetch", vi.fn(async (url, options) => {
      expect(url).toBe(SITEVERIFY_URL);
      expect(options.redirect).toBe("error");
      if (kind === "timeout") throw new Error("synthetic_private_test_secret");
      if (kind === "http") return new Response("unavailable", { status: 503 });
      if (kind === "json") return new Response("invalid-json");
      return Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] });
    }));
    await expect(assertPublicBotProtection(form({ "cf-turnstile-response": `failure-${kind}` }), "password_login", request.headers))
      .rejects.toMatchObject({ code: kind === "rejected-token" ? "BOT_INVALID" : "BOT_UNAVAILABLE" });
  });
  it("keeps IP throttles independent from spoofed Cloudflare headers", () => {
    const hdrs = new Headers({ "x-vercel-forwarded-for": "192.0.2.20", "cf-connecting-ip": "198.51.100.1", "x-forwarded-for": "198.51.100.2" });
    expect(publicClientIp(hdrs, { VERCEL: "1" })).toBe("192.0.2.20");
  });
  it("rejects database failures before verification or authentication", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("Synthetic DB unavailable"));
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(assertPublicBotProtection(form({ "cf-turnstile-response": "db-error-token" }), "password_login", request.headers)).rejects.toMatchObject({ code: "BOT_UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("shares the IP limit atomically and permits attempts after the temporary window", async () => {
    const key = hashToken("bot-password_login-ip:192.0.2.4");
    await db.execute(sql`insert into auth_rate_limits(key,attempts,window_start) values(${key},119,now())`);
    const fetchMock = vi.fn(async () => Response.json(valid())); vi.stubGlobal("fetch", fetchMock);
    const results = await Promise.allSettled(["one", "two"].map(token => assertPublicBotProtection(form({ "cf-turnstile-response": token }), "password_login", request.headers)));
    expect(results.filter(value => value.status === "fulfilled")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await db.execute(sql`update auth_rate_limits set window_start=now()-interval '61 seconds' where key=${key}`);
    await expect(assertPublicBotProtection(form({ "cf-turnstile-response": "after-window" }), "password_login", request.headers)).resolves.toBeUndefined();
  });
  it("rejects a challenge from another allowed environment hostname", async () => {
    vi.stubEnv("TURNSTILE_HOSTNAMES", `${hostname},other.essafaria.example`);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...valid(), hostname: "other.essafaria.example" })));
    await expect(assertPublicBotProtection(form({ "cf-turnstile-response": "cross-host" }), "password_login", request.headers)).rejects.toMatchObject({ code: "BOT_INVALID" });
  });
  it("shares the reset-link limit across IPs and reopens after its temporary window", async () => {
    const resetToken = "synthetic-reset-link-value-123456789";
    const key = hashToken(`reset-identity:${hashToken(resetToken)}`);
    await db.execute(sql`insert into auth_rate_limits(key,attempts,window_start) values(${key},4,now())`);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...valid(), action: "access_reset" })));
    const results = await Promise.allSettled(["192.0.2.10", "192.0.2.11"].map((ip, index) => {
      const hdrs = new Headers(request.headers); hdrs.set("x-forwarded-for", ip);
      return assertPublicBotProtection(form({ token: resetToken, "cf-turnstile-response": `reset-parallel-${index}` }), "access_reset", hdrs);
    }));
    expect(results.filter(value => value.status === "fulfilled")).toHaveLength(1);
    expect(results.find(value => value.status === "rejected")).toMatchObject({ reason: { code: "BOT_RATE_LIMITED" } });
    await db.execute(sql`update auth_rate_limits set window_start=now()-interval '16 minutes' where key=${key}`);
    await expect(assertPublicBotProtection(form({ token: resetToken, "cf-turnstile-response": "reset-reopened" }), "access_reset", request.headers)).resolves.toBeUndefined();
  });
  it("normalizes registration identities across different IPs without a permanent lockout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...valid(), action: "agency_registration" })));
    const values = { locale: "en", legalName: "Synthetic Partner", contactFirstName: "Lina", phone: "+213555123456", terms: "true", privacy: "true", accuracy: "true" };
    const limited = registrationCopy("en").errors.rateLimited;
    for (let index = 0; index < 6; index++) {
      request.headers.set("x-forwarded-for", `192.0.2.${30 + index}`);
      const result = await submitRegistrationAction({}, form({ ...values, email: index % 2 ? "PARTNER@EXAMPLE.TEST" : "partner@example.test", "cf-turnstile-response": `registration-${index}` }));
      if (index < 5) expect(result.error).not.toBe(limited);
      else expect(result.error).toBe(limited);
    }
    const key = hashToken("registration-identity:partner@example.test");
    expect((await db.execute(sql`select attempts from auth_rate_limits where key=${key}`)).rows[0]?.attempts).toBe(6);
    await db.execute(sql`update auth_rate_limits set window_start=now()-interval '61 minutes' where key=${key}`);
    const result = await submitRegistrationAction({}, form({ ...values, email: "partner@example.test", "cf-turnstile-response": "registration-reopened" }));
    expect(result.error).not.toBe(limited);
  });
  it("forbids hosted bypasses and dummy keys", () => {
    const env = { VERCEL: "1", TURNSTILE_MODE: "off", DATABASE_URL: "postgresql://localhost/test" };
    expect(() => readTurnstileConfig(env)).toThrow();
    expect(() => readTurnstileConfig({ ...env, VERCEL: undefined, NODE_ENV: "production" })).toThrow();
    expect(() => readTurnstileConfig({ ...env, TURNSTILE_MODE: "managed", TURNSTILE_SITE_KEY: "1x00000000000000000000AA", TURNSTILE_SECRET: "1x0000000000000000000000000000000AA", TURNSTILE_HOSTNAMES: hostname })).toThrow();
  });
  it("forbids a local bypass when a connection URI can override loopback routing", () => {
    for (const DATABASE_URL of [
      "postgresql://synthetic@localhost/test?host=db.remote.example",
      "postgresql://synthetic@127.0.0.1/test?options=-csearch_path%3Dvisa_os",
      "https://localhost/test",
    ]) expect(() => readTurnstileConfig({ TURNSTILE_MODE: "off", DATABASE_URL })).toThrow();
  });
});
