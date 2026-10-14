import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { suiteSetup } from "./helpers/global-state";
import { request } from "./helpers/request";
import { userByEmail } from "./helpers/fixtures";
import { authenticate, createSession, getSessionUser, requireAgencyUser, requireStaff, requireUser } from "@/lib/auth";
import { loginAction } from "@/app/actions/auth";
import MfaPage from "@/app/(public)/mfa/page";
import { beginMfaEnrollment, authorizeMfaEnrollment, resetMfa } from "@/lib/mfa";
import { GET as notifications } from "@/app/api/notifications/route";
import { pool } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { automaticDatabaseChangesForbidden } from "../scripts/lib/build-policy";
import { createDraftApplication, getApplicationForUser } from "@/lib/applications";

suiteSetup();
beforeAll(async () => {
  await pool.query("create schema visa_os_preview; create table visa_os_preview.auth_rate_limits (like public.auth_rate_limits including all)");
  const tables = await pool.query("select tablename from pg_tables where schemaname='public' and tablename<>'auth_rate_limits'");
  for (const {tablename} of tables.rows) {
    if (!/^[a-z_]+$/.test(tablename)) throw new Error("Unexpected disposable fixture table");
    await pool.query(`create view visa_os_preview."${tablename}" as select * from public."${tablename}"`);
  }
});
afterAll(async () => { await pool.query("drop schema visa_os_preview cascade"); });

// Policy metadata is simulated; the already initialized pool remains the
// disposable localhost fixture. These values never connect to Supabase.
const preview = {
  MFA_ENFORCEMENT_ENABLED: "false",
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp",
  VERCEL_GIT_COMMIT_REF: "codex/preview-mfa-enforcement-2026-10-14",
  DATABASE_SCHEMA: "visa_os_preview",
  DATABASE_URL: "postgresql://postgres:synthetic@db.xgetzgixalrsmuvfthpf.supabase.co:5432/postgres",
} as const;
const roles = [
  ["SUPER_ADMIN", "superadmin@test.example", "/admin"],
  ["ADMIN", "admin@test.example", "/admin"],
  ["VISA_AGENT", "agent@test.example", "/admin"],
  ["ACCOUNTING", "accounting@test.example", "/admin"],
  ["AGENCY_ADMIN", "a-admin@test.example", "/portal"],
  ["AGENCY_USER", "a-user@test.example", "/portal"],
] as const;
function configure(overrides: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries({ ...preview, ...overrides })) vi.stubEnv(key, value);
}
async function passwordSession(email = "admin@test.example") {
  const user = await userByEmail(email);
  request.cookie = (await createSession(user.id)).token;
  return user;
}
beforeEach(async () => {
  await pool.query("truncate sessions,session_presence,auth_rate_limits");
  await pool.query("truncate visa_os_preview.auth_rate_limits");
  request.cookie = "";
  configure();
});
afterEach(() => { request.cookie = ""; request.set.mockClear(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("explicitly authorized Preview password login", () => {
  it.each(roles)("lets %s use its existing unique email without granting MFA verification", async (role, email, path) => {
    const user = await userByEmail(email);
    const before = (await pool.query("select password_hash,role,agency_id,credential_version from users where id=$1", [user.id])).rows[0];
    const form = new FormData(); form.set("identifier", email); form.set("password", "Test-Password-123");
    await expect(loginAction({}, form)).rejects.toMatchObject({ digest: expect.stringContaining(`;${path};`) });
    const actor = await getSessionUser();
    expect(actor).toMatchObject({ id: user.id, role, agencyId: user.agencyId, mfaPending: !user.agencyId });
    expect((await pool.query("select mfa_verified_at from sessions where token_hash=$1", [hashToken(request.cookie)])).rows[0].mfa_verified_at).toBeNull();
    expect((await pool.query("select password_hash,role,agency_id,credential_version from users where id=$1", [user.id])).rows[0]).toEqual(before);
    expect((await notifications()).status).toBe(200);
    if (user.agencyId) { await expect(requireStaff()).rejects.toMatchObject({ code: "FORBIDDEN" }); expect((await requireAgencyUser()).agencyId).toBe(user.agencyId); }
    else { expect((await requireStaff()).id).toBe(user.id); await expect(requireAgencyUser()).rejects.toMatchObject({ code: "FORBIDDEN" }); }
  });
  it("keeps the agency's unique username as a login identity", async () => {
    expect((await authenticate("a-user", "Test-Password-123")).role).toBe("AGENCY_USER");
  });
  it("rejects an ambiguous email even if one matching password is known", async () => {
    const a = await userByEmail("a-user@test.example"), b = await userByEmail("b-user@test.example");
    await pool.query("update users set email='shared@test.example' where id=any($1::uuid[])", [[a.id,b.id]]);
    try {
      await expect(authenticate("shared@test.example", "Test-Password-123")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", message: "Invalid username, email or password." });
      expect((await authenticate("a-user", "Test-Password-123")).id).toBe(a.id);
    } finally {
      await pool.query("update users set email=$2 where id=$1", [a.id, "a-user@test.example"]);
      await pool.query("update users set email=$2 where id=$1", [b.id, "b-user@test.example"]);
    }
  });
  it("rejects a staff/agency email collision without choosing the staff account", async () => {
    const agency = await userByEmail("a-user@test.example");
    await pool.query("update users set email='admin@test.example' where id=$1", [agency.id]);
    try { await expect(authenticate("admin@test.example", "Test-Password-123")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" }); }
    finally { await pool.query("update users set email='a-user@test.example' where id=$1", [agency.id]); }
  });
  it("never turns a suspended or activation-pending account into an active account", async () => {
    const user = await userByEmail("admin@test.example");
    for (const patch of ["status='SUSPENDED'", "activation_pending=true"]) {
      await pool.query(`update users set ${patch} where id=$1`, [user.id]);
      try { await expect(authenticate("admin@test.example", "Test-Password-123")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" }); }
      finally { await pool.query("update users set status='ACTIVE',activation_pending=false where id=$1", [user.id]); }
    }
  });
  it("keeps forced password changes ahead of workspace access", async () => {
    const user = await passwordSession();
    await pool.query("update users set must_change_password=true where id=$1", [user.id]);
    try {
      await expect(requireUser()).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
      expect((await notifications()).status).toBe(403);
      await expect(MfaPage()).rejects.toMatchObject({ digest: expect.stringContaining(";/change-password;") });
    } finally { await pool.query("update users set must_change_password=false where id=$1", [user.id]); }
  });
  it("redirects a direct MFA visit to the staff workspace while enforcement is paused", async () => {
    await passwordSession();
    await expect(MfaPage()).rejects.toMatchObject({ digest: expect.stringContaining(";/admin;") });
  });
  it("restores the pending challenge with one flag update, without minting a verified session", async () => {
    await passwordSession();
    expect(await getSessionUser()).not.toBeNull();
    vi.stubEnv("MFA_ENFORCEMENT_ENABLED", "true");
    expect(await getSessionUser()).toBeNull();
    expect((await getSessionUser({allowMfaPending:true}))?.mfaPending).toBe(true);
    expect((await notifications()).status).toBe(401);
  });
  it("keeps ordinary idle timeout, absolute expiry and credential-generation checks", async () => {
    const user = await passwordSession();
    expect(await getSessionUser()).not.toBeNull();
    for (const patch of ["last_activity_at=now()-interval '31 minutes'", "expires_at=now()-interval '1 second'", "credential_version=credential_version+1"]) {
      await pool.query(`update sessions set ${patch} where user_id=$1`, [user.id]);
      expect(await getSessionUser()).toBeNull();
      await pool.query("delete from sessions where user_id=$1", [user.id]);
      await passwordSession();
    }
  });
  it("accepts an ordinary staff session older than ten minutes only while enforcement is paused", async () => {
    const user = await passwordSession();
    await pool.query("update sessions set created_at=now()-interval '11 minutes' where user_id=$1", [user.id]);
    expect(await getSessionUser()).not.toBeNull();
    vi.stubEnv("MFA_ENFORCEMENT_ENABLED", "true");
    expect(await getSessionUser({allowMfaPending:true})).toBeNull();
  });
  it("freezes MFA enrollment and reset operations instead of assuming password-only sessions are verified", async () => {
    const user = await passwordSession("superadmin@test.example"), target = await userByEmail("admin@test.example");
    const actor = await getSessionUser();
    expect(actor?.mfaPending).toBe(true);
    const before = await pool.query("select count(*)::int n from mfa_credentials");
    await expect(beginMfaEnrollment("Test-Password-123", "a".repeat(32))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(authorizeMfaEnrollment(actor!, target.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resetMfa(actor!, target.id, "Test-Password-123", "synthetic isolated reason")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await pool.query("select count(*)::int n from mfa_credentials")).rows).toEqual(before.rows);
    expect((await pool.query("select mfa_verified_at from sessions where user_id=$1", [user.id])).rows[0].mfa_verified_at).toBeNull();
  });
  it("does not let the Preview build migrate or seed this branch", () => {
    expect(automaticDatabaseChangesForbidden("codex/preview-mfa-enforcement-2026-10-14")).toBe(true);
  });
  it("preserves existing encrypted credentials, recovery hashes, authorizations and MFA history", async () => {
    const user = await userByEmail("superadmin@test.example");
    await pool.query("insert into mfa_credentials(user_id,encrypted_secret,enrollment_expires_at,confirmed_at,recovery_hashes) values($1,'synthetic-preserved-ciphertext',now()+interval '10 minutes',now(),'[\"synthetic-preserved-digest\"]')",[user.id]);
    await pool.query("insert into mfa_enrollment_authorizations(user_id,code_hash,expires_at) values($1,'synthetic-expired-digest',now()-interval '1 minute')",[user.id]);
    const audit=(await pool.query("insert into audit_logs(actor_id,action,entity,entity_id) values($1,'MFA_ENROLLED','user',$2) returning *",[user.id,user.id])).rows;
    const factors=(await pool.query("select * from mfa_credentials where user_id=$1",[user.id])).rows;
    const auths=(await pool.query("select * from mfa_enrollment_authorizations where user_id=$1",[user.id])).rows;
    try {
      await passwordSession("superadmin@test.example");
      expect((await requireStaff()).id).toBe(user.id);
      expect((await pool.query("select * from mfa_credentials where user_id=$1",[user.id])).rows).toEqual(factors);
      expect((await pool.query("select * from mfa_enrollment_authorizations where user_id=$1",[user.id])).rows).toEqual(auths);
      expect((await pool.query("select * from audit_logs where id=$1",[audit[0].id])).rows).toEqual(audit);
    } finally { await pool.query("delete from mfa_credentials where user_id=$1;",[user.id]); await pool.query("delete from mfa_enrollment_authorizations where user_id=$1",[user.id]); }
  });
  it("keeps cross-tenant application access denied for a password-only agency session", async () => {
    const a=await passwordSession("a-user@test.example"), b=await userByEmail("b-user@test.example");
    const visa=(await pool.query("select id from visa_types order by code limit 1")).rows[0];
    const app=await createDraftApplication({agencyId:a.agencyId!,visaTypeId:visa.id,createdBy:a});
    await passwordSession("b-user@test.example");
    const actor=await requireAgencyUser();
    expect(actor.agencyId).toBe(b.agencyId);
    await expect(getApplicationForUser(app.id,actor)).rejects.toMatchObject({code:"NOT_FOUND"});
  });
  it("still applies the account login rate limit while MFA is paused", async () => {
    const form=new FormData();form.set("identifier","admin@test.example");form.set("password","Synthetic-Wrong-Password");
    for(let i=0;i<10;i++)expect((await loginAction({},form)).error).toBe("Invalid username, email or password.");
    expect((await loginAction({},form)).error).toBe("Sign-in is temporarily unavailable. Please try again later.");
  });
  it("accepts the authorized Supabase pooler metadata as well as the direct endpoint",async()=>{
    await passwordSession();
    vi.stubEnv("DATABASE_URL","postgresql://postgres.xgetzgixalrsmuvfthpf:synthetic@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=verify-full");
    expect(await getSessionUser()).not.toBeNull();
  });
});

describe("enforcement fails closed outside the exact Preview context", () => {
  it.each(roles.slice(0,4))("continues enforcing Production MFA for %s even with the flag set false",async(_role,email)=>{
    await passwordSession(email);
    configure({VERCEL_ENV:"production",DATABASE_SCHEMA:"visa_os"});
    expect(await getSessionUser()).toBeNull();
    expect((await notifications()).status).toBe(401);
  });
  it.each([
    {MFA_ENFORCEMENT_ENABLED:undefined}, {MFA_ENFORCEMENT_ENABLED:"true"}, {MFA_ENFORCEMENT_ENABLED:"False"}, {MFA_ENFORCEMENT_ENABLED:"0"},
    {VERCEL:undefined}, {VERCEL:"0"}, {VERCEL_ENV:"production",DATABASE_SCHEMA:"visa_os"}, {VERCEL_ENV:"development"}, {VERCEL_ENV:undefined},
    {VERCEL_TARGET_ENV:"production"},
    {VERCEL_PROJECT_ID:undefined}, {VERCEL_PROJECT_ID:"prj_other"}, {VERCEL_GIT_COMMIT_REF:"main"}, {VERCEL_GIT_COMMIT_REF:undefined},
    {DATABASE_SCHEMA:"visa_os"}, {DATABASE_SCHEMA:"public"}, {DATABASE_SCHEMA:undefined}, {DATABASE_URL:undefined}, {DATABASE_URL:"invalid"},
    {DATABASE_URL:"postgresql://postgres:synthetic@localhost:5434/essafaria_test"},
    {DATABASE_URL:"postgresql://postgres:synthetic@db.other.supabase.co:5432/postgres"},
    {DATABASE_URL:"https://db.xgetzgixalrsmuvfthpf.supabase.co/postgres"},
    {DATABASE_URL:"postgresql://postgres:synthetic@db.xgetzgixalrsmuvfthpf.supabase.co:5432/other"},
    {DATABASE_URL:preview.DATABASE_URL+"?host=localhost"}, {DATABASE_URL:preview.DATABASE_URL+"?options=-csearch_path%3Dvisa_os"},
    {DATABASE_URL:preview.DATABASE_URL+"?sslmode=disable"},
  ])("requires staff MFA for unsafe or incomplete metadata %j", async overrides => {
    await passwordSession(); configure(overrides);
    expect(await getSessionUser()).toBeNull();
    expect((await notifications()).status).toBe(401);
  });
  it("does not enable agency email login outside the approved Preview mode", async () => {
    vi.stubEnv("MFA_ENFORCEMENT_ENABLED", "true");
    await expect(authenticate("a-user@test.example", "Test-Password-123")).rejects.toMatchObject({ code:"INVALID_CREDENTIALS" });
    expect((await authenticate("a-user", "Test-Password-123")).role).toBe("AGENCY_USER");
  });
});
