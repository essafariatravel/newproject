import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createHash} from "node:crypto";
import {Pool} from "pg";
import {beforeAll,afterAll,describe,it,expect} from "vitest";
import {testDbReady,testConnectionString} from "./helpers/pg";
import {applyMigrations} from "../scripts/lib/migrations";
import {QUALIFIED_RELEASE_SCOPE,QUALIFIED_BATCH_B_SCOPE} from "../scripts/lib/release-safeguards";
import {collectReleaseSnapshot,runQualifiedReleaseTransaction,pendingMigrations,type ReleaseBaseline} from "../scripts/prod-release";

let pool:Pool,temporary:string;
const hashes=async(directory:string,names:readonly string[])=>Object.fromEntries(await Promise.all(names.map(async n=>[n,createHash("sha256").update(await fs.readFile(path.join(directory,n))).digest("hex")])));
async function requireLocal(){const row=(await pool.query("select current_database() db,host(inet_server_addr()) host,inet_server_port() port")).rows[0];if(row.db!=="essafaria_test"||row.port!==5434||!["127.0.0.1","::1"].includes(row.host))throw Error("LOCAL_DISPOSABLE_DATABASE_REQUIRED");}
async function snapshot(batch:"A"|"B"="A") {const c=await pool.connect();try{await c.query('begin read only');const result=await collectReleaseSnapshot(c,[],batch);await c.query('rollback');return result;}finally{c.release();}}
beforeAll(async()=>{await testDbReady();pool=new Pool({connectionString:testConnectionString(),max:2});await requireLocal();temporary=await fs.mkdtemp(path.join(os.tmpdir(),"essafaria-phase2-batches-"));});
afterAll(async()=>{if(pool){await requireLocal();await pool.query('drop schema if exists visa_os cascade');await pool.end();}if(temporary)await fs.rm(temporary,{recursive:true,force:true});});

describe("actual local Production-batch executor rehearsal",()=>{
 it("keeps 0019 baseline through A, rolls back a tampered B, then commits only 0034–0035",async()=>{
  const migrations=path.join(process.cwd(),"migrations"),initial=path.join(temporary,"initial"),tampered=path.join(temporary,"tampered");await fs.mkdir(initial);await fs.mkdir(tampered);
  for(const n of (await fs.readdir(migrations)).filter(n=>/^00(?:0[1-9]|1[0-9])_.*\.sql$/.test(n)))await fs.copyFile(path.join(migrations,n),path.join(initial,n));
  await applyMigrations(pool,initial,"visa_os");
  const agency=(await pool.query("insert into visa_os.agencies(legal_name,email,currency) values('Synthetic rehearsal','agency@example.test','DZD') returning id")).rows[0].id;
  const staff=(await pool.query("insert into visa_os.users(email,password_hash,name,role) values('historical@example.test','synthetic-hash','Synthetic historical','SUPER_ADMIN') returning id")).rows[0].id;
  const user=(await pool.query("insert into visa_os.users(email,password_hash,name,role,agency_id) values('agency@example.test','synthetic-hash','Synthetic agency','AGENCY_USER',$1) returning id",[agency])).rows[0].id;
  await pool.query("insert into visa_os.sessions(user_id,token_hash,created_at,expires_at) values($1,'synthetic-session',now()-interval '1 hour',now()+interval '7 days')",[staff]);
  await pool.query("update visa_os.agencies set balance=100 where id=$1",[agency]);
  await pool.query("insert into visa_os.wallet_transactions(agency_id,type,amount,currency,balance_before,balance_after,reason,actor_id) values($1,'CREDIT',100,'DZD',0,100,'Synthetic qualification',$2)",[agency,staff]);
  const country=(await pool.query("insert into visa_os.countries(name,iso2) values('Synthetic country','ZZ') returning id")).rows[0].id;
  const category=(await pool.query("insert into visa_os.visa_categories(name,code) values('Synthetic category','SYNTHETIC') returning id")).rows[0].id;
  const visa=(await pool.query("insert into visa_os.visa_types(country_id,category_id,name,code,currency) values($1,$2,'Synthetic visa','SYNTHETIC','DZD') returning id",[country,category])).rows[0].id;
  const priority=(await pool.query("insert into visa_os.priorities(name,code) values('Synthetic normal','SYNTHETIC') returning id")).rows[0].id;
  const documentType=(await pool.query("insert into visa_os.document_types(name,code) values('Synthetic document','SYNTHETIC') returning id")).rows[0].id;
  const statusDraft=(await pool.query("select id from visa_os.statuses where code='DRAFT'")).rows[0].id;
  const statusFinal=(await pool.query("select id from visa_os.statuses where code='APPROVED'")).rows[0].id;
  async function application(reference:string,status:string){return (await pool.query("insert into visa_os.applications(reference,agency_id,country_id,visa_type_id,status_id,priority_id,visa_type_name,visa_type_code,category_name,country_name,fee,currency,processing_min_days,processing_max_days,created_by) values($1,$2,$3,$4,$5,$6,'Synthetic visa','SYNTHETIC','Synthetic category','Synthetic country',0,'DZD',5,15,$7) returning id",[reference,agency,country,visa,status,priority,user])).rows[0].id;}
  const draftApp=await application('SYNTHETIC-DRAFT',statusDraft),finalApp=await application('SYNTHETIC-FINAL',statusFinal);
  const oldRequest=(await pool.query("insert into visa_os.document_requests(application_id,document_type_id,type,reason,created_at) values($1,$2,'ADDITIONAL','Synthetic old',now()-interval '2 minutes') returning id",[draftApp,documentType])).rows[0].id;
  const newRequest=(await pool.query("insert into visa_os.document_requests(application_id,document_type_id,type,reason,created_at) values($1,$2,'ADDITIONAL','Synthetic latest',now()-interval '1 minute') returning id",[draftApp,documentType])).rows[0].id;
  const terminalRequest=(await pool.query("insert into visa_os.document_requests(application_id,document_type_id,type,reason) values($1,$2,'ADDITIONAL','Synthetic terminal') returning id",[finalApp,documentType])).rows[0].id;
  const before=await snapshot();expect(before.ledger).toHaveLength(19);
  const baseline:ReleaseBaseline={ledger:before.ledger,counts:before.counts as Record<string,number>,walletChecksum:before.walletChecksum!,agencyWalletsChecksum:before.agencyWallets!};
  const aHashes=await hashes(migrations,QUALIFIED_RELEASE_SCOPE);
  const a=await runQualifiedReleaseTransaction(pool,aHashes,migrations,{batch:"A",baseline});
  expect(a.applied).toEqual(QUALIFIED_RELEASE_SCOPE);expect(a.after.columnsValid).toBe(true);expect(a.after.ledger).toHaveLength(33);
  expect((await pool.query("select username from visa_os.users where id=$1",[user])).rows[0].username).toBe('agency_'+user.replaceAll('-',''));
  expect((await pool.query("select expires_at=created_at+interval '12 hours' bounded from visa_os.sessions where user_id=$1",[staff])).rows[0].bounded).toBe(true);
  expect((await pool.query("select id,status from visa_os.document_requests order by id")).rows).toEqual([{id:oldRequest,status:'CANCELLED'},{id:newRequest,status:'OPEN'},{id:terminalRequest,status:'CANCELLED'}].sort((a,b)=>a.id.localeCompare(b.id)));
  expect((await pool.query("select to_regclass('visa_os.document_retention_policy') absent")).rows[0].absent).toBeNull();
  const bDirectory=path.join(migrations,"candidates"),bHashes=await hashes(bDirectory,QUALIFIED_BATCH_B_SCOPE),bBaseline={...baseline,ledger:a.after.ledger};
  for(const n of QUALIFIED_BATCH_B_SCOPE)await fs.copyFile(path.join(bDirectory,n),path.join(tampered,n));
  await fs.appendFile(path.join(tampered,QUALIFIED_BATCH_B_SCOPE[1]),"\nupdate users set name='tampered';\n");
  await expect(runQualifiedReleaseTransaction(pool,await hashes(tampered,QUALIFIED_BATCH_B_SCOPE),tampered,{batch:"B",baseline:bBaseline})).rejects.toThrow("Transactional postflight rejected");
  expect((await snapshot()).ledger).toHaveLength(33);expect((await pool.query("select name from visa_os.users where id=$1",[staff])).rows[0].name).toBe('Synthetic historical');
  expect((await pool.query("select to_regclass('visa_os.document_retention_policy') absent")).rows[0].absent).toBeNull();
  const b=await runQualifiedReleaseTransaction(pool,bHashes,bDirectory,{batch:"B",baseline:bBaseline});
  expect(b.applied).toEqual(QUALIFIED_BATCH_B_SCOPE);expect(b.after.columnsValid).toBe(true);expect(b.after.ledger).toHaveLength(35);expect(pendingMigrations(b.after.ledger,bDirectory)).toEqual([]);
  expect((await pool.query("select execution_enabled,retention_days from visa_os.document_retention_policy")).rows[0]).toEqual({execution_enabled:false,retention_days:120});
  expect((await pool.query("select to_regclass('visa_os.storage_operations') absent")).rows[0].absent).toBeNull();
  expect(b.after.counts).toEqual(a.after.counts);expect(b.after.walletChecksum).toBe(before.walletChecksum);expect(b.after.agencyWallets).toBe(before.agencyWallets);
 });
});
