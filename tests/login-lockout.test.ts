import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginAction } from "@/app/actions/auth";
import { db, pool } from "@/lib/db";
import { request } from "./helpers/request";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();
const email = "a-user@test.example";
const secret = Buffer.alloc(32, 21).toString("base64url");
const key = (email: string) => "login-failure-v1:" + createHmac("sha256", Buffer.from(secret, "base64url")).update(email).digest("hex");
const correct = "Test-Password-123";
const invalid = { error: "Invalid email or password." };
const lockedMessage = "Too many incorrect sign-in attempts. Access is temporarily locked.";
function expectLocked(result: { error?: string; retryAfterSeconds?: number }) {
  expect(result.error).toBe(lockedMessage);
  expect(result.retryAfterSeconds).toBeGreaterThan(0);
  expect(result.retryAfterSeconds).toBeLessThanOrEqual(600);
}

async function attempt(password: string, identifier = email) {
  const form = new FormData();
  form.set("identifier", identifier);
  form.set("password", password);
  return loginAction({}, form);
}
async function state(identifier = email) {
  return (await pool.query("select attempts, window_start from auth_rate_limits where key=$1", [key(identifier)])).rows[0];
}
async function age(minutes: number, suffix = "") {
  await pool.query("update auth_rate_limits set window_start=clock_timestamp()-$2::int*interval '1 minute' where key=$1", [key(email) + suffix, minutes]);
}

beforeEach(async () => {
  await pool.query("truncate auth_rate_limits");
  vi.stubEnv("AUTH_LOGIN_COUNTER_SECRET", secret);
  request.cookie = "";
  request.set.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  request.cookie = "";
});

describe("password lockout via the shared login Server Action", () => {
  it("locks on the third failure and blocks a correct password without extending the lock", async () => {
    expect(await attempt("wrong one", " A-USER@TEST.EXAMPLE ")).toEqual(invalid);
    expect((await state())?.attempts).toBe(1);
    expect(await attempt("wrong two")).toEqual(invalid);
    expect((await state())?.attempts).toBe(2);
    expect(await attempt("wrong three")).toEqual(invalid);
    const locked = await state();
    expect(locked.attempts).toBe(3);
    expectLocked(await attempt(correct));
    expect(await state()).toEqual(locked);
    expect(request.set).not.toHaveBeenCalled();
  });

  it("unlocks ten minutes after the third failure and starts a new count", async () => {
    for (let i = 0; i < 3; i++) await attempt("wrong");
    await age(10);
    expect(await attempt("wrong again")).toEqual(invalid);
    expect((await state()).attempts).toBe(1);
    await expect(attempt(correct)).rejects.toThrow("NEXT_REDIRECT");
    expect(await state()).toBeUndefined();
  });

  it("clears earlier failures only after a successful agency login", async () => {
    await attempt("wrong one");
    await attempt("wrong two");
    await expect(attempt(correct)).rejects.toThrow("NEXT_REDIRECT");
    expect(await state()).toBeUndefined();
    await attempt("wrong again");
    expect((await state()).attempts).toBe(1);
  });

  it("uses the latest two failures across the edge of a rolling window", async () => {
    await attempt("wrong one");
    await attempt("wrong two");
    await age(11, ":previous");
    await age(9);
    await attempt("wrong three");
    expect((await state()).attempts).toBe(2);
    await attempt("wrong four");
    expect((await state()).attempts).toBe(3);
  });

  it("serializes simultaneous failures and does not create a session during the lock", async () => {
    const attempts = await Promise.all([attempt("wrong"), attempt("wrong"), attempt("wrong"), attempt("wrong")]);
    expect(attempts).toHaveLength(4);
    // Every concurrent request lacks password proof, even after the lock commits.
    expect(attempts.every(result => result.error === invalid.error && result.retryAfterSeconds === undefined)).toBe(true);
    expect(attempts.some(result => result.retryAfterSeconds)).toBe(false);
    for (const result of attempts) {
      expect(result).toEqual(invalid);
      expect(result.retryAfterSeconds).toBeUndefined();
    }
    expect((await state()).attempts).toBe(3);
    expectLocked(await attempt(correct));
    expect(request.set).not.toHaveBeenCalled();
  });

  it("never applies the three-error lockout to internal Staff, who retain MFA", async () => {
    for (const staffEmail of [
      "superadmin@test.example", "admin@test.example",
      "agent@test.example", "accounting@test.example",
    ]) {
      for (let i = 0; i < 4; i++) {
        expect(await attempt("deliberately incorrect", staffEmail)).toEqual(invalid);
      }
      expect(await state(staffEmail)).toBeUndefined();
      await expect(attempt(correct, staffEmail)).rejects.toThrow("NEXT_REDIRECT");
    }
  });

  it("ignores pre-existing Staff counters and does not show a lockout countdown", async () => {
    const staffEmail = "admin@test.example";
    await pool.query(
      "insert into auth_rate_limits (key, attempts, window_start) values ($1, 3, clock_timestamp())",
      [key(staffEmail)],
    );
    expect(await attempt("wrong", staffEmail)).toEqual(invalid);
    expect(await state(staffEmail)).toMatchObject({ attempts: 3 });
    await expect(attempt(correct, staffEmail)).rejects.toThrow("NEXT_REDIRECT");
  });

  it("also protects agency administrators, not just agency members", async () => {
    const agencyAdmin = "a-admin@test.example";
    expect(await attempt("wrong", agencyAdmin)).toEqual(invalid);
    expect(await attempt("wrong", agencyAdmin)).toEqual(invalid);
    // A third wrong password locks the account without revealing its identity.
    expect(await attempt("wrong", agencyAdmin)).toEqual(invalid);
    expect((await state(agencyAdmin))?.attempts).toBe(3);
    expect(request.set).not.toHaveBeenCalled();
    // The existing countdown assertion remains mandatory after password proof.
    expectLocked(await attempt(correct, agencyAdmin));
    expect((await state(agencyAdmin))?.attempts).toBe(3);
  });

  it("keeps unknown identifiers generic and never creates agency counters", async () => {
    const missing = "missing@example.test";
    for (let i = 0; i < 4; i++) {
      expect(await attempt("wrong", missing)).toEqual(invalid);
    }
    expect(await state(missing)).toBeUndefined();
    expect(await state()).toBeUndefined();
  });

  it("does not count a database failure as a wrong password", async () => {
    await attempt("wrong one");
    const before = await state();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "select").mockImplementationOnce(() => { throw new Error("synthetic DB failure"); });
    expect(await attempt("wrong")).toEqual({ error: "Service temporarily unavailable. Please try again." });
    expect(await state()).toEqual(before);
  });
});
