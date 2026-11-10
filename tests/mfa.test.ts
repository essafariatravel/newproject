import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generate } from "otplib";
import { suiteSetup } from "./helpers/global-state";
import { userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
import { createSession, getSessionUser } from "@/lib/auth";
import { beginMfaEnrollment, completeMfa } from "@/lib/mfa";
import { db,pool } from "@/lib/db";
import { sql } from "drizzle-orm";
import { hashToken } from "@/lib/crypto";
import { loginAction } from "@/app/actions/auth";
import { passwordLoginKey } from "@/lib/login-lockout";

suiteSetup();
beforeEach(async()=>{await pool.query("truncate mfa_credentials,mfa_enrollment_authorizations,sessions,session_presence,auth_rate_limits");});
afterEach(() => { request.cookie=""; delete process.env.MFA_ENCRYPTION_KEY; });

describe("mandatory Staff MFA", () => {
  async function enrollmentFixture(){
    process.env.MFA_ENCRYPTION_KEY=Buffer.alloc(32,27).toString("base64");
    const user=await userByEmail("superadmin@test.example");
    request.cookie=(await createSession(user.id)).token;
    await db.execute(sql`insert into mfa_enrollment_authorizations(user_id,code_hash,expires_at) values(${user.id},${hashToken("c".repeat(32))},now()+interval '30 minutes')`);
    const enrollment=await beginMfaEnrollment("Test-Password-123","c".repeat(32));
    return {user,enrollment,code:await generate({secret:enrollment.secret})};
  }
  it.each(["superadmin","admin","agent","accounting"])("denies privileged access to a password-only %s session",async name=>{
    const user=await userByEmail(`${name}@test.example`);
    request.cookie=(await createSession(user.id)).token;
    expect(await getSessionUser()).toBeNull();
    expect((await getSessionUser({allowMfaPending:true}))?.mfaPending).toBe(true);
    const {requireStaff}=await import("@/lib/auth");
    await expect(requireStaff()).rejects.toThrow();
  });
  it("retains password failures until Staff MFA completes and blocks a pending login at the threshold", async () => {
    const { user, code } = await enrollmentFixture();
    await completeMfa(code, true);
    request.cookie = "";
    request.set.mockClear();
    const key = passwordLoginKey(user.email);
    const form = new FormData();
    form.set("identifier", user.email);
    form.set("password", "Wrong-Synthetic-Password");
    await loginAction({}, form);
    await loginAction({}, form);
    form.set("password", "Test-Password-123");
    await expect(loginAction({}, form)).rejects.toMatchObject({ digest: expect.stringContaining(";/mfa;") });
    expect((await pool.query("select attempts from auth_rate_limits where key=$1", [key])).rows[0]?.attempts).toBe(2);
    const recovery = (await pool.query("select recovery_hashes from mfa_credentials where user_id=$1", [user.id])).rows[0];
    expect(recovery.recovery_hashes).toHaveLength(10);
    // The earlier enrollment used the current TOTP step. Use a new test recovery
    // code to exercise the pending login without waiting for the next step.
    const recoveryCode = "a".repeat(32);
    await pool.query("update mfa_credentials set recovery_hashes=$2::jsonb where user_id=$1", [user.id, JSON.stringify([hashToken(recoveryCode)])]);
    form.set("password", "Wrong-Synthetic-Password");
    await loginAction({}, form);
    await expect(completeMfa(recoveryCode)).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect((await pool.query("select recovery_hashes from mfa_credentials where user_id=$1", [user.id])).rows[0].recovery_hashes).toEqual([hashToken(recoveryCode)]);
    await pool.query("update auth_rate_limits set window_start=now()-interval '10 minutes' where key=$1", [key]);
    const completed = await completeMfa(recoveryCode);
    request.cookie = completed.token;
    expect((await getSessionUser())?.id).toBe(user.id);
    expect((await pool.query("select key from auth_rate_limits where key=$1", [key])).rowCount).toBe(0);
  });
  it("rolls back factor consumption when session minting fails",async()=>{
    const {user,code}=await enrollmentFixture();
    await pool.query(`create function reject_mfa_session() returns trigger language plpgsql as $$ begin raise exception 'synthetic session failure'; end $$; create trigger reject_mfa_session before insert on sessions for each row execute function reject_mfa_session()`);
    try{await expect(completeMfa(code,true)).rejects.toThrow();}
    finally{await pool.query("drop trigger reject_mfa_session on sessions; drop function reject_mfa_session()");}
    const row=await pool.query("select confirmed_at,recovery_hashes from mfa_credentials where user_id=$1",[user.id]);
    expect(row.rows[0]).toMatchObject({confirmed_at:null,recovery_hashes:[]});
    expect((await completeMfa(code,true)).recoveryCodes).toHaveLength(10);
  });
  it("rejects expired pending sessions and expired enrollment",async()=>{
    const {user,code}=await enrollmentFixture();
    await pool.query("update mfa_credentials set enrollment_expires_at=now()-interval '1 minute' where user_id=$1",[user.id]);
    await expect(completeMfa(code,true)).rejects.toThrow();
    await pool.query("update sessions set created_at=now()-interval '11 minutes' where user_id=$1",[user.id]);
    expect(await getSessionUser({allowMfaPending:true})).toBeNull();
  });
  it("consumes a recovery code once under concurrent challenges",async()=>{
    const {user,code}=await enrollmentFixture();
    const enrolled=await completeMfa(code,true);
    request.cookie=(await createSession(user.id)).token;
    const results=await Promise.allSettled([completeMfa(enrolled.recoveryCodes[0]!),completeMfa(enrolled.recoveryCodes[0]!)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
  });
  it("refuses a challenge whose originating session is revoked while waiting for the identity lock",async()=>{
    const {user,code}=await enrollmentFixture();
    const blocker=await pool.connect();
    await blocker.query("select pg_advisory_lock(1163087699)");
    const challenge=completeMfa(code,true).then(()=>"accepted",()=>"denied");
    try{
      for(let i=0;i<100;i++){
        const result=await pool.query("select count(*)::int n from pg_stat_activity where wait_event='advisory' and pid<>pg_backend_pid()");
        if(result.rows[0].n>0)break;
        await new Promise(resolve=>setTimeout(resolve,10));
        if(i===99)throw new Error("Challenge never reached the transaction lock");
      }
      await blocker.query("delete from sessions where user_id=$1",[user.id]);
    }finally{await blocker.query("select pg_advisory_unlock(1163087699)");blocker.release();}
    expect(await challenge).toBe("denied");
    expect((await pool.query("select count(*)::int n from sessions where user_id=$1",[user.id])).rows[0].n).toBe(0);
  });
  it("blocks password-only Staff sessions, confirms enrollment, rejects OTP replay and consumes recovery once", async () => {
    process.env.MFA_ENCRYPTION_KEY=Buffer.alloc(32,27).toString("base64");
    const user=await userByEmail("superadmin@test.example");
    const pending=await createSession(user.id);
    request.cookie=pending.token;
    expect(await getSessionUser()).toBeNull();
    await expect(beginMfaEnrollment("Test-Password-123","a".repeat(32))).rejects.toThrow();
    await db.execute(sql`insert into mfa_enrollment_authorizations(user_id,code_hash,expires_at) values(${user.id},${hashToken("b".repeat(32))},now()+interval '30 minutes')`);
    const enrollment=await beginMfaEnrollment("Test-Password-123","b".repeat(32));
    const code=await generate({secret:enrollment.secret});
    const confirmed=await completeMfa(code,true);
    request.cookie=confirmed.token;
    expect((await getSessionUser())?.id).toBe(user.id);
    expect(confirmed.recoveryCodes).toHaveLength(10);
    const stored=await db.execute(sql`select encrypted_secret,recovery_hashes from mfa_credentials where user_id=${user.id}`);
    expect(JSON.stringify(stored.rows)).not.toContain(enrollment.secret);
    expect(JSON.stringify(stored.rows)).not.toContain(confirmed.recoveryCodes[0]!);
    request.cookie=(await createSession(user.id)).token;
    await expect(completeMfa(code)).rejects.toThrow("Verification failed");
    const recovery=await completeMfa(confirmed.recoveryCodes[0]!);
    request.cookie=recovery.token;
    expect((await getSessionUser())?.id).toBe(user.id);
    request.cookie=(await createSession(user.id)).token;
    await expect(completeMfa(confirmed.recoveryCodes[0]!)).rejects.toThrow("Verification failed");
  });
  it("keeps agency authentication unchanged and refuses agency enrollment", async () => {
    request.cookie=(await createSession((await userByEmail("a-admin@test.example")).id)).token;
    expect((await getSessionUser())?.agencyId).toBeTruthy();
    await expect(beginMfaEnrollment("Test-Password-123","b".repeat(32))).rejects.toThrow();
  });
});
