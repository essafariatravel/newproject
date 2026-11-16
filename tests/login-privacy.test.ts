import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginAction } from "@/app/actions/auth";
import { db, pool } from "@/lib/db";
import * as passwordCrypto from "@/lib/crypto";
import { passwordLoginKey } from "@/lib/login-lockout";
import { getSessionUser } from "@/lib/auth";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { managedLoginChallenge, managedLoginForm } from "./helpers/turnstile";
import { Client } from "pg";
import { loginLockoutCopy } from "@/lib/login-lockout-copy";

suiteSetup();
const invalid = { error: "Invalid email or password." };
const correct = "Test-Password-123";
const attempt = (email: string, password = "Wrong-Synthetic-Password") =>
  loginAction({}, managedLoginForm(email, password));

beforeEach(async () => {
  await pool.query("truncate auth_rate_limits");
  request.cookie = ""; request.set.mockClear();
  managedLoginChallenge();
});
afterEach(() => {
  request.cookie = ""; request.set.mockClear(); request.headers = new Headers();
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("public login privacy and original abuse protection", () => {
  it("keeps unknown, agency and Staff wrong-password responses identical after three failures", async () => {
    for (let index = 0; index < 4; index++) {
      for (const email of ["a-user@test.example", "missing@example.test", "admin@test.example"]) {
        expect(await attempt(email)).toEqual(invalid);
      }
    }
    expect(request.set).not.toHaveBeenCalled();
  });

  it("discloses an agency countdown only after its correct password, never to a wrong-password probe", async () => {
    for (let index = 0; index < 3; index++) expect(await attempt("a-user@test.example")).toEqual(invalid);
    expect(await attempt("a-user@test.example", correct)).toMatchObject({
      error: "Too many incorrect sign-in attempts. Access is temporarily locked.",
      retryAfterSeconds: expect.any(Number),
    });
    expect(await attempt("a-user@test.example")).toEqual(invalid);
    expect(request.set).not.toHaveBeenCalled();
  });

  it("performs one real password derivation and one failure transaction for unknown and already locked agency probes", async () => {
    for (let index = 0; index < 3; index++) await attempt("a-user@test.example");
    const verify = vi.spyOn(passwordCrypto, "verifyPassword");
    const transaction = vi.spyOn(db, "transaction");
    const queries = vi.spyOn(Client.prototype, "query");
    let work: number | undefined;
    for (const email of ["a-user@test.example", "missing@example.test", "admin@test.example"]) {
      verify.mockClear(); transaction.mockClear(); queries.mockClear();
      expect(await attempt(email)).toEqual(invalid);
      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith("Wrong-Synthetic-Password",
        expect.stringMatching(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/i));
      expect(transaction).toHaveBeenCalledTimes(1);
      work ??= queries.mock.calls.length;
      expect(queries.mock.calls.length).toBe(work);
    }
  });

  it("retains comparable local rejection latency without a locked-account fast path", async () => {
    for (let index = 0; index < 3; index++) await attempt("a-user@test.example");
    const identities = ["a-user@test.example", "missing@example.test", "admin@test.example"];
    const samples = identities.map(() => [] as number[]);
    for (let round = 0; round < 6; round++) {
      // Interleave the order rather than comparing a cold path to a warm path.
      for (let step = 0; step < identities.length; step++) {
        const index = (round + step) % identities.length;
        const started = performance.now();
        expect(await attempt(identities[index]!)).toEqual(invalid);
        samples[index]!.push(performance.now() - started);
      }
    }
    const medians = samples.map(values => values.sort((a, b) => a - b)[3]!);
    // Structural derivation/query-count assertions above are the primary oracle.
    // This broad local check catches the former near-zero locked-account path.
    expect(Math.max(...medians) / Math.min(...medians)).toBeLessThan(2.5);
    console.warn("[local login privacy probe]", JSON.stringify({ samplesPerIdentity: 6,
      medianMs: { lockedAgency: medians[0], unknown: medians[1], staff: medians[2] } }));
    expect(request.set).not.toHaveBeenCalled();
  });

  it("restores the 10-per-identity request budget across different IPs for Staff without an agency lock", async () => {
    for (let index = 0; index < 10; index++) {
      request.headers.set("x-forwarded-for", `192.0.2.${index + 1}`);
      request.headers.set("x-vercel-forwarded-for", `192.0.2.${index + 1}`);
      expect(await attempt("admin@test.example")).toEqual(invalid);
    }
    expect(await attempt("admin@test.example")).toEqual({
      error: "Sign-in is temporarily unavailable. Please try again later.",
    });
    expect((await pool.query("select attempts from auth_rate_limits where key=$1",
      [passwordLoginKey("admin@test.example")])).rows).toEqual([]);
  });

  it("restores the 40-per-IP request ceiling independently of account existence", async () => {
    for (let index = 0; index < 40; index++) expect(await attempt(`missing-${index}@example.test`)).toEqual(invalid);
    expect(await attempt("one-more@example.test")).toEqual({
      error: "Sign-in is temporarily unavailable. Please try again later.",
    });
  });

  it("keeps all Staff roles outside agency lockout even with a historical account counter", async () => {
    for (const email of ["superadmin@test.example", "admin@test.example", "agent@test.example", "accounting@test.example"]) {
      await pool.query("insert into auth_rate_limits(key,attempts,window_start) values($1,3,clock_timestamp())",
        [passwordLoginKey(email)]);
      expect(await attempt(email)).toEqual(invalid);
      await expect(attempt(email, correct)).rejects.toMatchObject({ digest: expect.stringContaining(";/mfa;") });
      expect(await getSessionUser()).toBeNull();
      expect((await getSessionUser({ allowMfaPending: true }))?.mfaPending).toBe(true);
      request.cookie = "";
    }
  });

  it.each(["en", "fr", "ar"] as const)("keeps %s rejection neutral until the agency password is verified", async (locale) => {
    request.headers.set("x-essafaria-public-locale", locale);
    const unknown = await attempt("missing@example.test");
    expect(unknown.error).toBeTruthy();
    expect(unknown.retryAfterSeconds).toBeUndefined();
    for (let index = 0; index < 3; index++) expect(await attempt("a-user@test.example")).toEqual(unknown);
    expect(await attempt("admin@test.example")).toEqual(unknown);
    expect(await attempt("a-user@test.example", correct)).toMatchObject({
      error: loginLockoutCopy(locale).locked, retryAfterSeconds: expect.any(Number),
    });
    expect(request.set).not.toHaveBeenCalled();
  });

  it("keeps unusable and pending agency credentials neutral without incrementing the enforced password counter", async () => {
    const { rows: [original] } = await pool.query("select password_hash, activation_pending from users where email=$1", ["a-user@test.example"]);
    const verify = vi.spyOn(passwordCrypto, "verifyPassword");
    try {
      for (const state of ["bad-hash", "uppercase-prefix", "pending"] as const) {
        await pool.query("update users set password_hash=$2,activation_pending=$3 where email=$1",
          ["a-user@test.example", state === "bad-hash" ? "unusable" : state === "uppercase-prefix" ? original.password_hash.replace("scrypt$", "SCRYPT$") : original.password_hash, state === "pending"]);
        verify.mockClear();
        expect(await attempt("a-user@test.example", correct)).toEqual(invalid);
        expect(verify).toHaveBeenCalledTimes(1);
        expect(verify.mock.calls[0]?.[1]).toMatch(/^scrypt\$[0-9a-fA-F]{32}\$[0-9a-fA-F]{128}$/);
        expect((await pool.query("select key from auth_rate_limits where key=$1", [passwordLoginKey("a-user@test.example")])).rows).toEqual([]);
        expect(request.set).not.toHaveBeenCalled();
      }
    } finally {
      await pool.query("update users set password_hash=$2,activation_pending=$3 where email=$1",
        ["a-user@test.example", original.password_hash, original.activation_pending]);
    }
  });
});
