import assert from "node:assert/strict";
import {Pool} from "pg";
let pool,client,gateStage="HOSTED_PRODUCTION";
try {
 assert.equal(process.env.VERCEL_ENV,"production");
 gateStage="SCHEMA";
 assert.equal(process.env.DATABASE_SCHEMA,"visa_os");
 gateStage="MFA_ENFORCEMENT";
 assert.equal(process.env.MFA_ENFORCEMENT_ENABLED,undefined);
 assert.equal(process.env.NEXT_PUBLIC_MFA_ENCRYPTION_KEY,undefined);
 gateStage="MFA_KEY_FORMAT";
 const key=process.env.MFA_ENCRYPTION_KEY??"";
 const bytes=Buffer.from(key,"base64");
 assert.equal(bytes.length,32);assert.equal(bytes.toString("base64"),key);bytes.fill(0);
 gateStage="LOAD_QUALIFIED_GUARDS";
 const {guardedProductionPoolConfig,APPROVED_BASELINE}=await import("./scripts/prod-release.ts");
 const {QUALIFIED_RELEASE_SCOPE,QUALIFIED_BATCH_B_SCOPE}=await import("./scripts/lib/release-safeguards.ts");
 const {databasePoolConfig}=await import("./src/lib/database-config.ts");
 // Reuse the strict identity/query-parameter guard, but do not substitute its
 // normalized TLS config for the application's actual effective configuration.
 gateStage="DATABASE_URI_IDENTITY_AND_PARAMETERS";
 guardedProductionPoolConfig({DATABASE_URL:process.env.DATABASE_URL,DATABASE_SCHEMA:process.env.DATABASE_SCHEMA});
 gateStage="EFFECTIVE_APPLICATION_POOL_CONFIG";
 pool=new Pool({...databasePoolConfig(process.env),max:1,application_name:"essafaria_private_stage_readonly_gate"});
 gateStage="TLS_CONNECTION";
 client=await pool.connect();assert.equal(client.connection.stream.authorized,true);
 gateStage="READONLY_TRANSACTION";
 await client.query("begin isolation level repeatable read read only");
 await client.query("set local statement_timeout='20s'");
 gateStage="DATABASE_READONLY_IDENTITY";
 const who=(await client.query("select current_database() db,current_setting('transaction_read_only') ro")).rows[0];
 assert.equal(who.db,"postgres");assert.equal(who.ro,"on");
 gateStage="EXACT_LEDGER35";
 const ledger=(await client.query("select name from visa_os.schema_migrations order by name")).rows.map(r=>r.name);
 assert.deepEqual(ledger,[...APPROVED_BASELINE.ledger,...QUALIFIED_RELEASE_SCOPE,...QUALIFIED_BATCH_B_SCOPE]);
 gateStage="OWNER_ACCOUNT";
 const owner=(await client.query("select count(*)::int n from visa_os.users where lower(btrim(email))=$1 and role='SUPER_ADMIN' and status='ACTIVE' and agency_id is null and must_change_password=false",["admin@essafariavoyages.com"])).rows[0];assert.equal(owner.n,1);
 gateStage="HISTORICAL_ADMINS";
 const historical=(await client.query("select count(*)::int n from visa_os.users where lower(btrim(email))<>$1 and role='SUPER_ADMIN' and status='ACTIVE' and agency_id is null",["admin@essafariavoyages.com"])).rows[0];assert.equal(historical.n,2);
 await client.query("rollback");
 console.log("ESSAFARIA_PRIVATE_STAGE_TLS_READONLY_LEDGER35_OWNER_GATE_PASS");
}catch {
 console.error("ESSAFARIA_PRIVATE_STAGE_READONLY_GATE_BLOCKED_NO_SECRETS stage="+gateStage);process.exitCode=1;
}finally {
 if(client){await client.query("rollback").catch(()=>{});client.release();}
 if(pool)await pool.end();
}
