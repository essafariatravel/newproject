import type {Pool} from "pg";
import {databaseSchema} from "../../src/lib/database-schema";
import {hashToken} from "../../src/lib/crypto";
import {APPROVED_BASELINE} from "../prod-release";
import {QUALIFIED_RELEASE_SCOPE} from "./release-safeguards";

export interface MfaActivationApproval {kind:"ESSAFARIA_FIRST_MFA_ACTIVATION";status:"APPROVED";approvedBy:string;candidateSha:string;userId:string;recipientSha256:string;projectRef:string;schema:string;expiresAt:string;}
export function validateMfaActivationApproval(value:unknown,sha:string):MfaActivationApproval {
 const a=value as MfaActivationApproval,now=Date.now(),expiry=Date.parse(a?.expiresAt);
 if(!/^[a-f0-9]{64}$/.test(a?.recipientSha256))throw new Error("Explicit MFA delivery recipient approval is required.");
 if(!a||a.kind!=="ESSAFARIA_FIRST_MFA_ACTIVATION"||a.status!=="APPROVED"||typeof a.approvedBy!=="string"||!a.approvedBy.trim()||!/^[a-f0-9]{40}$/.test(a.candidateSha)||a.candidateSha!==sha||!/^\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b$/.test(a.userId??"")||a.projectRef!=="xgetzgixalrsmuvfthpf"||a.schema!=="visa_os"||!Number.isFinite(expiry)||expiry<=now||expiry>now+24*3600000)throw new Error("Explicit exact-user MFA activation approval is required.");
 return a;
}
/** Caller supplies an already guarded pool. Sealed delivery must succeed before COMMIT. */
export async function issueFirstMfaAuthorization(pool:Pool,schema:string,userId:string,code:string,approvedBy:string,deliver:()=>Promise<void>):Promise<void> {
 databaseSchema({DATABASE_SCHEMA:schema});
 if(!/^[a-f0-9]{32}$/.test(code))throw new Error("Invalid enrollment authorization.");
 const client=await pool.connect(),table=(name:string)=>`"${schema}"."${name}"`;
 try{
  await client.query("begin");
  await client.query("set local lock_timeout='30s'");
  await client.query("set local statement_timeout='60s'");
  await client.query("select pg_advisory_xact_lock(1163087699)");
  const ledger=(await client.query(`select name from ${table("schema_migrations")} order by name`)).rows.map(r=>r.name);
  if(JSON.stringify(ledger)!==JSON.stringify([...APPROVED_BASELINE.ledger,...QUALIFIED_RELEASE_SCOPE]))throw new Error("Exact qualified 0033 ledger is required before activation.");
  const user=await client.query(`select id from ${table("users")} where id=$1 and role='SUPER_ADMIN' and status='ACTIVE' and agency_id is null and must_change_password=false for update`,[userId]);
  const enrolled=await client.query(`select 1 from ${table("mfa_credentials")} where confirmed_at is not null limit 1`);
  // An expired code for this exact approved user may be replaced. A live code
  // or any other user's authorization still blocks first-admin issuance.
  const authorized=await client.query(`select 1 from ${table("mfa_enrollment_authorizations")} where user_id<>$1 or expires_at>now() limit 1`,[userId]);
  if(user.rowCount!==1||enrolled.rowCount||authorized.rowCount)throw new Error("First administrator conditions are not met; use verified administrator authorization afterwards.");
  await client.query(`insert into ${table("mfa_enrollment_authorizations")}(user_id,code_hash,expires_at) values($1,$2,now()+interval '30 minutes') on conflict(user_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at where ${table("mfa_enrollment_authorizations")}.expires_at<=now()`,[userId,hashToken(code)]);
  await client.query(`insert into ${table("audit_logs")}(action,entity,entity_id,metadata) values('MFA_BOOTSTRAP_AUTHORIZED','user',$1,$2::jsonb)`,[userId,JSON.stringify({ownerApproved:true,approvedBy})]);
  await deliver();
  await client.query("commit");
 }catch(error){await client.query("rollback");throw error;}finally{client.release();}
}
