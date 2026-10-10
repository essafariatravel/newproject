import {readFileSync} from "node:fs";
import path from "node:path";
import ts from "typescript";
import {expect,it} from "vitest";

async function runner(env:Record<string,string> = {}) {
  const script=ts.transpileModule(readFileSync("scripts/dr-readonly-backup.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replace("main().catch(","return main().catch(");
  const writes=new Map<string,string>();const logs:string[]=[];let spawned=0;let exitCode=0;let childEnv:Record<string,string>={};
  const dependencies=(name:string)=>{
    if(name==="node:crypto")return {randomBytes:()=>Buffer.alloc(32,1),publicEncrypt:()=>Buffer.alloc(384),constants:{RSA_PKCS1_OAEP_PADDING:4}};
    if(name==="node:fs/promises")return {mkdtemp:async()=>"private-runner",readFile:async()=>"public-key",writeFile:async(file:string,data:string)=>writes.set(file,data)};
    if(name==="node:os")return {default:{tmpdir:()=>"private-temp"}};
    if(name==="node:path")return {default:path};
    if(name==="node:child_process")return {spawnSync:(_binary:string,_args:string[],options:{env:Record<string,string>})=>{spawned++;childEnv=options.env;return {status:1,stdout:"",stderr:"password authentication failed for user simulated-provider-diagnostic"};}};
    if(name==="./lib/dr-backup")return {encryptFileAes256Gcm:async()=>{}};
    throw Error("Unexpected dependency "+name);
  };
  await new Function("require","exports","process","console","Buffer",script)(dependencies,{}, {env,get exitCode(){return exitCode;},set exitCode(value:number){exitCode=value;}},{log:(v:string)=>logs.push(v),error:(v:string)=>logs.push(v)},Buffer);
  const evidence=JSON.parse(writes.get(path.join("private-runner","preflight.json"))??"{}");
  return {evidence,writes,logs,exitCode,spawned,childEnv};
}

it("preserves a safe preflight failure classification without exposing provider diagnostics", async()=>{
  const {evidence,writes,logs,exitCode,spawned}=await runner();
  expect(evidence.execution).toEqual({exitCode:1,errorCode:"DATABASE_AUTHENTICATION_FAILED"});
  expect(JSON.stringify([...writes.values()])).not.toContain("simulated-provider-diagnostic");
  expect(logs.join(" ")).not.toContain("simulated-provider-diagnostic");
  expect(exitCode).toBe(1);expect(spawned).toBe(1);
});

it("uses the approved shared connection through a read-only session pooler", async()=>{
  const {childEnv,spawned}=await runner({DR_USE_SESSION_POOLER:"YES",PRODUCTION_DATABASE_URL:"postgresql://postgres.xgetzgixalrsmuvfthpf@aws-1-us-east-1.pooler.supabase.com:6543/postgres"});
  expect(spawned).toBe(1);
  expect(new URL(childEnv.DATABASE_URL ?? "").port).toBe("5432");
  expect(childEnv.DATABASE_SCHEMA).toBe("visa_os");
  expect(childEnv.PGOPTIONS).toBe("-c default_transaction_read_only=on");
});

it("rejects a shared connection for another project before contacting a database", async()=>{
  const {spawned,exitCode}=await runner({DR_USE_SESSION_POOLER:"YES",PRODUCTION_DATABASE_URL:"postgresql://postgres.anotherproject@aws-1-us-east-1.pooler.supabase.com:6543/postgres"});
  expect(spawned).toBe(0);expect(exitCode).toBe(1);
});
