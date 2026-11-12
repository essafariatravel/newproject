import { afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { loginAction } from "@/app/actions/auth";
import { db } from "@/lib/db";
import { passwordLoginKey } from "@/lib/login-lockout";

suiteSetup();
afterEach(async()=>{
  request.cookie=""; request.set.mockClear(); vi.restoreAllMocks();
  await db.execute(sql`drop trigger if exists login_audit_failure on audit_logs`);
  await db.execute(sql`drop function if exists login_audit_failure()`);
});
const form=(identifier:string,password="Incorrect-Synthetic-123")=>{
  const value=new FormData(); value.set("identifier",identifier); value.set("password",password); return value;
};
describe("release login integrity",()=>{
  it("shares neutral rejection counters without locking compatibility-equivalent invalid identities", async () => {
    for (const identifier of ["a-admin", "ａ－ａｄｍｉｎ", "A-ADMIN", "a-admin"]) {
      expect(await loginAction({}, form(identifier))).toEqual({ error: "Invalid email or password." });
    }
    const bucket = (await db.execute(sql`select attempts from auth_rate_limits where key=${passwordLoginKey("a-admin") + ":unverified"}`)).rows;
    expect(bucket[0]?.attempts).toBe(3);
    expect((await db.execute(sql`select key from auth_rate_limits where key=${passwordLoginKey("a-admin")}`)).rows).toEqual([]);
    expect(request.set).not.toHaveBeenCalled();
  });
  it("does not issue a usable login session or cookie when its mandatory audit fails",async()=>{
    await db.execute(sql`create function login_audit_failure() returns trigger language plpgsql as $$ begin if new.action='USER_LOGIN' then raise exception 'Synthetic audit failure'; end if; return new; end $$`);
    await db.execute(sql`create trigger login_audit_failure before insert on audit_logs for each row execute function login_audit_failure()`);
    const before=(await db.execute(sql`select count(*)::int n from sessions`)).rows[0]?.n;
    request.set.mockClear(); vi.spyOn(console,"error").mockImplementation(()=>undefined);
    const result=await loginAction({},form("b-admin@test.example","Test-Password-123"));
    expect(result.error).toContain("Service temporarily unavailable");
    expect((await db.execute(sql`select count(*)::int n from sessions`)).rows[0]?.n).toBe(before);
    expect(request.set).not.toHaveBeenCalled();
  });
});
