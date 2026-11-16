import {readFileSync} from "node:fs";
import {createHash,randomBytes} from "node:crypto";
import {describe,it,expect} from "vitest";
import {pool} from "@/lib/db";
import {candidateSuiteSetup} from "./helpers/candidate-migrations";
import {APPROVED_BASELINE,type BatchPostflightReceipt} from "../scripts/prod-release";
import {QUALIFIED_RELEASE_SCOPE,QUALIFIED_BATCH_B_SCOPE} from "../scripts/lib/release-safeguards";
import {issueFirstMfaAuthorization} from "../scripts/lib/mfa-production-bootstrap";
candidateSuiteSetup();
describe("explicit owner first-MFA stage on exact 0035",()=>{
 it("requires a valid committed B receipt and the actual owner after mandatory password change; legacy 0033 remains exact",async()=>{
  const sha="a".repeat(40),code=randomBytes(16).toString("hex");
  const receipt:BatchPostflightReceipt={version:1,kind:"ESSAFARIA_MIGRATION_BATCH_POSTFLIGHT",status:"COMMITTED_POSTFLIGHT_PASS",batch:"B",candidateSha:sha,projectRef:"xgetzgixalrsmuvfthpf",schema:"visa_os",checkedAt:new Date().toISOString(),ledger:[...APPROVED_BASELINE.ledger,...QUALIFIED_RELEASE_SCOPE,...QUALIFIED_BATCH_B_SCOPE],migrations:Object.fromEntries(QUALIFIED_BATCH_B_SCOPE.map(n=>[n,createHash("sha256").update(readFileSync(`migrations/candidates/${n}`)).digest("hex")])),counts:{...APPROVED_BASELINE.counts},walletChecksum:APPROVED_BASELINE.walletChecksum,agencyWallets:APPROVED_BASELINE.agencyWalletsChecksum,originalContentVerified:true};
  const historical=(await pool.query("select id,password_hash,role,status from users where email='superadmin@test.example'")).rows[0];
  const owner=(await pool.query("insert into users(email,password_hash,name,role,must_change_password) values('admin@essafariavoyages.com','synthetic-hash','Synthetic owner','SUPER_ADMIN',true) returning id")).rows[0].id;
  await expect(issueFirstMfaAuthorization(pool,"public",owner,code,"Synthetic owner",async()=>{})).rejects.toThrow("0033");
  await expect(issueFirstMfaAuthorization(pool,"public",owner,code,"Synthetic owner",async()=>{},{candidateSha:sha,batchBPostflight:{...receipt,status:"PREPARED"} as never})).rejects.toThrow("postflight");
  const context={candidateSha:sha,batchBPostflight:receipt};
  await expect(issueFirstMfaAuthorization(pool,"public",historical.id,code,"Synthetic owner",async()=>{},context)).rejects.toThrow("First administrator conditions");
  await expect(issueFirstMfaAuthorization(pool,"public",owner,code,"Synthetic owner",async()=>{},context)).rejects.toThrow("First administrator conditions");
  await pool.query("update users set must_change_password=false where id=$1",[owner]);
  let delivered=false;await issueFirstMfaAuthorization(pool,"public",owner,code,"Synthetic owner",async()=>{delivered=true;},context);expect(delivered).toBe(true);
  expect((await pool.query("select id,password_hash,role,status from users where id=$1",[historical.id])).rows[0]).toEqual(historical);
  expect((await pool.query("select count(*)::int n from mfa_credentials where confirmed_at is not null")).rows[0].n).toBe(0);
  expect((await pool.query("select count(*)::int n from sessions where user_id=$1 and mfa_verified_at is not null",[owner])).rows[0].n).toBe(0);
  const authorization=(await pool.query("select code_hash from mfa_enrollment_authorizations where user_id=$1",[owner])).rows[0];expect(authorization.code_hash).not.toBe(code);
 });
});
