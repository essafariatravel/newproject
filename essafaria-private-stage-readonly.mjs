import assert from "node:assert/strict";
import {Pool} from "pg";
import {exactWebPushLedger, assertExactWebPushLedger} from "./scripts/lib/staff-web-push-production-ledger.mjs";
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
 gateStage="EXACT_LEDGER39";
 const ledger=(await client.query("select name from visa_os.schema_migrations order by name")).rows.map(r=>r.name);
 // Retain the original strict 37-migration attestation and explicitly
 // authorize only the independently verified, non-destructive email guard.
 const approvedLedger37=exactWebPushLedger(APPROVED_BASELINE.ledger, QUALIFIED_RELEASE_SCOPE, QUALIFIED_BATCH_B_SCOPE);
 assertExactWebPushLedger(ledger, [...approvedLedger37, "0040_agency_registration_email_once.sql", "0041_application_cancellation_requests.sql"]);
 gateStage="REGISTRATION_EMAIL_UNIQUENESS_GUARD";
 const registrationGuard=(await client.query(`
   select t.tgenabled as enabled, pg_get_triggerdef(t.oid) definition,
     pg_get_functiondef(t.tgfoid) handler
   from pg_trigger t join pg_class c on c.oid=t.tgrelid
   join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='visa_os' and c.relname='agency_registrations'
     and t.tgname='agency_registration_email_once' and not t.tgisinternal
 `)).rows;
 assert.equal(registrationGuard.length,1);
 assert.equal(registrationGuard[0].enabled,"O");
 assert.match(registrationGuard[0].definition,/BEFORE INSERT OR UPDATE OF email ON visa_os\.agency_registrations/);
 assert.match(registrationGuard[0].handler,/pg_advisory_xact_lock/);
 assert.match(registrationGuard[0].handler,/agency_registration_email_once/);
 gateStage="CANCELLATION_PRIVATE_TABLE_AND_GUARD";
 const cancellation=(await client.query(`
  select c.relrowsecurity as rls,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_access,
    has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as authenticated_access,
    exists(select 1 from pg_index i join pg_class ic on ic.oid=i.indexrelid where i.indrelid=c.oid and ic.relname='application_cancellation_one_active' and i.indisunique and i.indisvalid) as unique_guard,
    exists(select 1 from pg_trigger t where t.tgrelid='visa_os.applications'::regclass and t.tgname='application_cancellation_workflow' and t.tgenabled='O') as status_guard
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='visa_os' and c.relname='application_cancellation_requests'
 `)).rows;
 assert.equal(cancellation.length,1);
 assert.equal(cancellation[0].rls,true);
 assert.equal(cancellation[0].anon_access,false);
 assert.equal(cancellation[0].authenticated_access,false);
 assert.equal(cancellation[0].unique_guard,true);
 assert.equal(cancellation[0].status_guard,true);
 gateStage="WEB_PUSH_PRIVATE_TABLE";
 const push=(await client.query(`
   select c.relrowsecurity as rls, c.relforcerowsecurity as forced_rls,
     has_table_privilege('anon', c.oid, 'SELECT') as anon_read,
     has_table_privilege('anon', c.oid, 'INSERT') as anon_write,
     has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_read,
     has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_write
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='visa_os' and c.relname='push_subscriptions' and c.relkind='r'
 `)).rows;
 assert.equal(push.length,1);
 assert.equal(push[0].rls,true);
 assert.equal(push[0].anon_read,false);
 assert.equal(push[0].anon_write,false);
 assert.equal(push[0].authenticated_read,false);
 assert.equal(push[0].authenticated_write,false);
 gateStage="OWNER_ACCOUNT";
 const owner=(await client.query("select count(*)::int n from visa_os.users where lower(btrim(email))=$1 and role='SUPER_ADMIN' and status='ACTIVE' and agency_id is null and must_change_password=false",["admin@essafariavoyages.com"])).rows[0];assert.equal(owner.n,1);
 gateStage="HISTORICAL_ADMINS";
 const historical=(await client.query("select count(*)::int n from visa_os.users where lower(btrim(email))<>$1 and role='SUPER_ADMIN' and status='ACTIVE' and agency_id is null",["admin@essafariavoyages.com"])).rows[0];assert.equal(historical.n,2);
 if(process.env.VERCEL_GIT_COMMIT_REF==="codex/phase2c-document-intelligence-20261126"){
 gateStage="GROUP_RELEASE_PRIVATE_TABLES";
 const tables=["traveller_profiles","traveller_profile_links","traveller_renewal_events","traveller_renewal_scan","traveller_vault_files","traveller_visa_dates","traveller_visa_renewal_events","visa_request_groups","visa_request_group_members","saved_traveller_groups"];
 const checks=(await client.query(`select c.relname,c.relrowsecurity rls,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon_access,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated_access,has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') service_access,has_table_privilege(current_user,c.oid,'SELECT') app_read from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='visa_os' and c.relname=any($1::text[])`,[tables])).rows;
 assert.equal(checks.length,tables.length);for(const row of checks){assert.equal(row.rls,true);assert.equal(row.anon_access,false);assert.equal(row.authenticated_access,false);assert.equal(row.service_access,false);assert.equal(row.app_read,true)}
 const groupScope=(await client.query(`select exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='visa_os' and c.relname='visa_request_groups_id_global_uq' and i.indisunique and i.indisvalid) ok`)).rows[0];assert.equal(groupScope.ok,true);
 console.log("GROUP_RELEASE_PRIVATE_SCHEMA_PASS (10 tables, RLS, public denial and global group identity)");
 gateStage="LIVE_CATALOGUE_PARITY";
 const {canonicalPersonalCode,personalCode,tripSpecificDocument}=await import("./src/lib/traveller-hub-policy.ts");
 const {sharedDocumentCode}=await import("./src/lib/group-policy.ts");
 const liveCodes=(await client.query("select code from visa_os.document_types where active and agency_uploadable")).rows.map(r=>r.code);
 assert.ok(liveCodes.some(code=>personalCode(code)&&canonicalPersonalCode(code)==="PASSPORT"));
 assert.ok(liveCodes.some(code=>personalCode(code)&&canonicalPersonalCode(code)==="PHOTO"));
 for(const code of liveCodes){if(sharedDocumentCode(code)){assert.equal(personalCode(code),false);assert.equal(tripSpecificDocument(code),true)}if(personalCode(code))assert.equal(sharedDocumentCode(code),false);}
 console.log("PRODUCTION_LIVE_CATALOGUE_PARITY_PASS (passport/photo available; personal and collective types separated)");

 }
 await client.query("rollback");
 console.log("ESSAFARIA_PRIVATE_STAGE_TLS_READONLY_LEDGER39_CANCELLATION_REGISTRATION_EMAIL_STAFF_PUSH_OWNER_GATE_PASS");
}catch {
 console.error("ESSAFARIA_PRIVATE_STAGE_READONLY_GATE_BLOCKED_NO_SECRETS stage="+gateStage);process.exitCode=1;
}finally {
 if(client){await client.query("rollback").catch(()=>{});client.release();}
 if(pool)await pool.end();
}
