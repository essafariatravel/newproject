import "./lib/load-env";
import {randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {Pool} from "pg";
import {databasePoolConfig} from "../src/lib/database-config";
import {hashToken} from "../src/lib/crypto";
import {assertSafePerfTarget,perfTable} from "./perf-safety";

/** Controlled first-administrator bootstrap; never runs against Production. */
async function main(){
  assertSafePerfTarget();
  const userId=process.env.MFA_BOOTSTRAP_USER_ID;
  const output=process.env.MFA_BOOTSTRAP_CODE_FILE;
  if(!userId||!output||!process.env.MFA_ENCRYPTION_KEY)throw new Error("User, secure output file and MFA encryption key are required.");
  const pool=new Pool({...databasePoolConfig(process.env),max:1});
  const code=randomBytes(16).toString("hex");
  try{
    const client=await pool.connect();
    try{
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(1163087699)");
      const user=await client.query(`select id from ${perfTable("users")} where id=$1 and role='SUPER_ADMIN' and status='ACTIVE' and agency_id is null`,[userId]);
      const enrolled=await client.query(`select user_id from ${perfTable("mfa_credentials")} where confirmed_at is not null`);
      if(user.rowCount!==1||enrolled.rowCount)throw new Error("Bootstrap is only allowed before any Staff enrollment; use verified administrator authorization afterwards.");
      await writeFile(output,code,{mode:0o600,flag:"wx"});
      await client.query(`insert into ${perfTable("mfa_enrollment_authorizations")}(user_id,code_hash,expires_at) values($1,$2,now()+interval '30 minutes') on conflict(user_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at`,[userId,hashToken(code)]);
      await client.query(`insert into ${perfTable("audit_logs")}(action,entity,entity_id,metadata) values('MFA_BOOTSTRAP_AUTHORIZED','user',$1,'{"controlledNonProductionBootstrap":true}')`,[userId]);
      await client.query("commit");
      console.log("Non-Production enrollment authorized. Code written to the specified private file; expires in 30 minutes.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }finally{await pool.end();}
}
main().catch(()=>{console.error("MFA bootstrap refused; no enrollment authorization claimed.");process.exitCode=1;});
