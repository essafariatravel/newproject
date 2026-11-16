import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {describe,it,expect} from "vitest";
import {pool} from "@/lib/db";
import {suiteSetup} from "./helpers/global-state";

suiteSetup();
const dataset="rehearsal_500";
const syntheticPassword=`local-only-${randomUUID()}`;
function run(script:string,extra:Record<string,string>={}){
  // Start children with Windows runtime paths only; do not forward the parent
  // environment, .env files, sessions, cloud keys, proxies or preloads.
  const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SystemRoot|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key))),NODE_ENV:"test" as const};
  Object.assign(env,{NODE_ENV:"test",DATABASE_URL:"postgresql://postgres:postgres@127.0.0.1:5434/essafaria_test",DATABASE_SCHEMA:"public",PERF_ACK_NONPROD:"YES",PERF_SYNTHETIC_PASSWORD:syntheticPassword,PERF_DATASET_ID:dataset,PERF_AGENCIES:"500",PERF_APPLICATIONS:"1000",PERF_DOCS_PER_APP:"0",PERF_NOTIFICATIONS_PER_APP:"1",PERF_MESSAGES_PER_APP:"1",PERF_AUDITS_PER_APP:"1",PERF_LEDGER_ROWS:"100",PERF_BATCH_SIZE:"100",...extra});
  const result=spawnSync(process.execPath,["node_modules/tsx/dist/cli.mjs",`scripts/${script}.ts`],{env,shell:false,windowsHide:true,encoding:"utf8",timeout:60_000,maxBuffer:1024*1024});
  // Do not surface arbitrary child diagnostics, even for disposable credentials.
  return {status:result.status,output:result.stdout??""};
}
async function counts(){return (await pool.query(`select
  (select count(*)::int from users where email like '%@load.example') users,
  (select count(*)::int from agencies where notes=$1 or email='perf.agency@load.example') agencies,
  (select count(*)::int from applications where agency_notes=$1) applications,
  (select count(*)::int from wallet_transactions where reason=$2) ledger`,[`PERF_DATASET:${dataset}`,`PERF_DATASET:${dataset}:LEDGER`])).rows[0];}

describe("recovered generators on a disposable local PostgreSQL database",()=>{
  it("creates and safely reuses the six synthetic identities without creating sessions or MFA evidence",()=>{
    expect(run("perf-seed-identities").status).toBe(0);
    expect(run("perf-seed-identities").status).toBe(0);
  },60_000);
  it("materializes 500 agencies and 1000 governed drafts with a balanced synthetic credit ledger",async()=>{
    expect(run("perf-seed-scale").status).toBe(0);
    expect(await counts()).toEqual({users:6,agencies:500,applications:1000,ledger:100});
    const {rows:[row]}=await pool.query(`select
      count(*)::int total,
      count(*) filter(where s.is_draft and a.submitted_at is null and a.submitted_price is null)::int drafts,
      count(*) filter(where a.visa_rule_snapshot is not null)::int snapshots
      from applications a join statuses s on s.id=a.status_id where a.agency_notes=$1`,[`PERF_DATASET:${dataset}`]);
    expect(row).toEqual({total:1000,drafts:1000,snapshots:1000});
    expect((await pool.query("select count(*)::int n from documents where storage_key like 'perf-%'")).rows[0].n).toBe(0);
    const ledger=(await pool.query(`select count(*)::int n, sum(t.amount)::text amount,
      bool_and(t.balance_after=t.balance_before+t.amount and t.type='CREDIT' and t.application_id is null) valid,
      max(a.balance)::text balance from wallet_transactions t join agencies a on a.id=t.agency_id where t.reason=$1`,[`PERF_DATASET:${dataset}:LEDGER`])).rows[0];
    expect(ledger.n).toBe(100);expect(Number(ledger.amount)).toBe(100);expect(Number(ledger.balance)).toBe(100);expect(ledger.valid).toBe(true);
    const portal=(await pool.query("select balance from agencies where email='perf.agency@load.example'")).rows[0];expect(Number(portal.balance)).toBe(0);
    expect((await pool.query("select count(*)::int n from sessions s join users u on u.id=s.user_id where u.email like '%@load.example'")).rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int n from mfa_credentials m join users u on u.id=m.user_id where u.email like '%@load.example'")).rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int n from pg_constraint where contype='f' and not convalidated")).rows[0].n).toBe(0);
  },60_000);
  it("rejects duplicate datasets and incorrect fixture passwords without changing existing rows",async()=>{
    const before=await counts();
    expect(run("perf-seed-scale").status).toBe(1);
    expect(await counts()).toEqual(before);
    expect(run("perf-seed-identities",{PERF_SYNTHETIC_PASSWORD:`wrong-local-only-${randomUUID()}`}).status).toBe(1);
    expect(await counts()).toEqual(before);
  },60_000);
  it('adds explicitly requested independent agency identities without sessions or MFA evidence',async()=>{
    expect(run('perf-seed-scale',{PERF_DATASET_ID:'cohort_qualification',PERF_AGENCIES:'25',PERF_APPLICATIONS:'25',PERF_AGENCY_IDENTITIES:'20',PERF_LEDGER_ROWS:'0'}).status).toBe(0);
    const row=(await pool.query("select count(*)::int n,count(distinct agency_id)::int tenants,bool_and(role in ('AGENCY_ADMIN','AGENCY_USER') and status='ACTIVE' and not activation_pending and not must_change_password) valid from users where username like 'perf_cohort_qualification_%'")).rows[0];
    expect(row).toEqual({n:20,tenants:20,valid:true});
    expect((await pool.query("select count(*)::int n from sessions s join users u on u.id=s.user_id where u.username like 'perf_cohort_qualification_%'")).rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int n from mfa_credentials m join users u on u.id=m.user_id where u.username like 'perf_cohort_qualification_%'")).rows[0].n).toBe(0);
  },60_000);
  it('rejects more agency identities than dedicated synthetic tenants before changing rows',async()=>{
    const before=(await pool.query('select count(*)::int n from agencies')).rows[0].n;
    expect(run('perf-seed-scale',{PERF_DATASET_ID:'cohort_overflow',PERF_AGENCIES:'25',PERF_APPLICATIONS:'25',PERF_AGENCY_IDENTITIES:'26',PERF_LEDGER_ROWS:'0'}).status).toBe(1);
    expect((await pool.query('select count(*)::int n from agencies')).rows[0].n).toBe(before);
  },60_000);
});
