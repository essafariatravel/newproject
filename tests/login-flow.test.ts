import { afterEach, describe, expect, it, vi } from "vitest";
import { suiteSetup } from "./helpers/global-state";

import { request } from "./helpers/request";

import { loginAction } from "../src/app/actions/auth";
import { getSessionUser } from "../src/lib/auth";
import { db, pool } from "../src/lib/db";
import { hashToken } from "../src/lib/crypto";

suiteSetup();
afterEach(() => {
  request.cookie = "";
  request.set.mockClear();
  vi.restoreAllMocks();
});

function loginForm() {
  const form = new FormData();
  form.set("email", "admin@test.example");
  form.set("password", "Test-Password-123");
  return form;
}

describe("staff login flow (isolated local database, not live verification)", () => {
  it("authenticates, creates and resolves a session, updates last login and audits", async () => {
    await expect(loginAction({}, loginForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(request.set).toHaveBeenCalledWith("evos_session", expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }));
    const user = await getSessionUser();
    expect(user?.email).toBe("admin@test.example");
    const saved = await pool.query("select token_hash from sessions where user_id = $1", [user!.id]);
    expect(saved.rows.some((row) => row.token_hash === hashToken(request.cookie))).toBe(true);
    const login = await pool.query("select last_login_at from users where id = $1", [user!.id]);
    expect(login.rows[0].last_login_at).toBeInstanceOf(Date);
    const audit = await pool.query("select action from audit_logs where actor_id = $1 and action = 'USER_LOGIN'", [user!.id]);
    expect(audit.rowCount).toBe(1);
  });

  it("does not return SQL errors to the login form", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "select").mockImplementation(() => { throw new Error("Failed query: select secret from users"); });
    const result = await loginAction({}, loginForm());
    expect(result).toEqual({ error: "Service temporarily unavailable. Please try again." });
    expect(request.set).not.toHaveBeenCalled();
  });
});
