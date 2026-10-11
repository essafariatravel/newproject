import {describe,expect,it} from "vitest";
import {randomBytes} from "node:crypto";
import {Pool} from "pg";
import {suiteSetup} from "./helpers/global-state";
import {testConnectionString} from "./helpers/pg";
import {issueFirstMfaAuthorization,validateMfaActivationApproval} from "../scripts/lib/mfa-production-bootstrap";
suiteSetup();
describe("guarded first privileged MFA activation",()=>{
 it("requires exact owner, user, SHA and expiry authorization",()=>{
  const sha="a".repeat(40),userId="11111111-1111-4111-8111-111111111111";
  const a={kind:"ESSAFARIA_FIRST_MFA_ACTIVATION",status:"APPROVED",approvedBy:"Owner",candidateSha:sha,userId,recipientSha256:"c".repeat(64),projectRef:"xgetzgixalrsmuvfthpf",schema:"visa_os",expiresAt:new Date(Date.now()+600000).toISOString()};
  expect(validateMfaActivationApproval(a,sha).userId).toBe(userId);
  for(const bad of [{...a,status:"REVIEW_REQUIRED"},{...a,candidateSha:"b".repeat(40)},{...a,userId:null},{...a,recipientSha256:null},{...a,expiresAt:new Date(0).toISOString()}])expect(()=>validateMfaActivationApproval(bad,sha)).toThrow();
 });
 it("stores only a hashed 30-minute code and refuses replay or already-enrolled staff",async()=>{
  const pool=new Pool({connectionString:testConnectionString()});
  const code=randomBytes(16).toString("hex");
  try{
   const user=(await pool.query("select id from users where email='superadmin@test.example'")).rows[0].id;
   await issueFirstMfaAuthorization(pool,"public",user,code,"Owner",async()=>{});
   const row=(await pool.query("select code_hash,expires_at>now() valid from mfa_enrollment_authorizations where user_id=$1",[user])).rows[0];
   expect(row.code_hash).not.toBe(code);expect(row.valid).toBe(true);
   await expect(issueFirstMfaAuthorization(pool,"public",user,code,"Owner",async()=>{})).rejects.toThrow();
   expect((await pool.query("select count(*)::int n from audit_logs where action='MFA_BOOTSTRAP_AUTHORIZED'")).rows[0].n).toBe(1);
  }finally{await pool.end();}
 });
 it("rolls back authorization when sealed delivery fails",async()=>{
  const pool=new Pool({connectionString:testConnectionString()});
  try{
   await pool.query("delete from mfa_enrollment_authorizations");
   const user=(await pool.query("select id from users where email='superadmin@test.example'")).rows[0].id;
   await expect(issueFirstMfaAuthorization(pool,"public",user,randomBytes(16).toString("hex"),"Owner",async()=>{throw new Error("sealed delivery failed");})).rejects.toThrow("sealed delivery failed");
   expect((await pool.query("select count(*)::int n from mfa_enrollment_authorizations where user_id=$1",[user])).rows[0].n).toBe(0);
  }finally{await pool.end();}
 });
 it("can reissue only an expired authorization for the same approved user",async()=>{
  const pool=new Pool({connectionString:testConnectionString()});
  try{
   const user=(await pool.query("select id from users where email='superadmin@test.example'")).rows[0].id;
   await issueFirstMfaAuthorization(pool,"public",user,randomBytes(16).toString("hex"),"Owner",async()=>{});
   await pool.query("update mfa_enrollment_authorizations set expires_at=now()-interval '1 minute'");
   await issueFirstMfaAuthorization(pool,"public",user,randomBytes(16).toString("hex"),"Owner",async()=>{});
   expect((await pool.query("select count(*)::int n from mfa_enrollment_authorizations where expires_at>now()")).rows[0].n).toBe(1);
  }finally{await pool.end();}
 });
 it("rejects activation after any staff factor has been confirmed",async()=>{
  const pool=new Pool({connectionString:testConnectionString()});
  try{
   const user=(await pool.query("select id from users where email='superadmin@test.example'")).rows[0].id;
   await pool.query("insert into mfa_credentials(user_id,encrypted_secret,enrollment_expires_at,confirmed_at) values($1,'synthetic',now(),now())",[user]);
   await expect(issueFirstMfaAuthorization(pool,"public",user,randomBytes(16).toString("hex"),"Owner",async()=>{})).rejects.toThrow("First administrator conditions");
  }finally{await pool.end();}
 });
});
