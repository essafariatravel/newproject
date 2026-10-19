import path from "node:path";
import {expect,it} from "vitest";
import {testDbReady,testConnectionString} from "./helpers/pg";
import {Pool} from "pg";
import {applyMigrations} from "../scripts/lib/migrations";
it("installs the embassy applicability constraint in a second isolated schema even when its name already exists",async()=>{
  await testDbReady();
  const pool=new Pool({connectionString:testConnectionString()}),schema="hardening_scope_check";
  await applyMigrations(pool,path.join(process.cwd(),"migrations"),schema);
  try{
    const result=await pool.query("select count(*) n from pg_constraint where conrelid=$1::regclass and conname='visa_types_embassy_applicability_check'",[`${schema}.visa_types`]);
    expect(Number(result.rows[0].n)).toBe(1);
    const rls=await pool.query("select bool_and(rowsecurity) ok from pg_tables where schemaname=$1",[schema]);
    expect(rls.rows[0].ok).toBe(true);
    const publicFunctionExecute=await pool.query(
      "select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where n.nspname=$1 and acl.grantee=0 and acl.privilege_type='EXECUTE') exposed",
      [schema],
    );
    expect(publicFunctionExecute.rows[0].exposed).toBe(false);
    const unsafeSearchPath=await pool.query(
      "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and not coalesce(array_to_string(p.proconfig,','),'') like ('%search_path=pg_catalog, ' || $1 || '%')",
      [schema],
    );
    expect(Number(unsafeSearchPath.rows[0].n)).toBe(0);
  }finally{await pool.query('drop schema "hardening_scope_check" cascade');await pool.end();}
});
