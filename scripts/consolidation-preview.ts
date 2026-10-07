import "./lib/load-env";
import {Pool} from "pg";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {databasePoolConfig} from "../src/lib/database-config";
import {assertSafePerfTarget,perfTable} from "./perf-safety";
import {applyMigrations} from "./lib/migrations";
import {trustedPreviewOrigin} from "./lib/preview-host";

async function main(){
  const mode=process.argv[2];const target=assertSafePerfTarget();
  if(!target.remote||target.schema!=="visa_os_preview")throw new Error("This runner requires the recorded remote Preview schema.");
  await mkdir("tmp-final-verify",{recursive:true});
  if(mode==="prepare"){
    const pool=new Pool({...databasePoolConfig(process.env),max:1});
    try{
      const applied=await applyMigrations(pool,path.join(process.cwd(),"migrations"),"visa_os_preview");
      const ledger=await pool.query(`select name from ${perfTable("schema_migrations")} order by name`);
      await writeFile("tmp-final-verify/preview-preparation.json",JSON.stringify({sha:process.env.GITHUB_SHA,schema:"visa_os_preview",applied,ledger:ledger.rows,productionMutation:false},null,2));
      console.log("Preview-only migrations verified; Production was not targeted.");
    }finally{await pool.end();}
    return;
  }
  if(mode!=="runtime")throw new Error("Unknown mode.");
  const base=new URL(trustedPreviewOrigin(process.env.BASE_URL,process.env.CONSOLIDATION_PREVIEW_URL));
  const token=process.env.HEALTHCHECK_TOKEN;if(!token||token.length<32)throw new Error("Protected health token is missing.");
  const reports=[];
  for(const route of ["/api/health","/api/health/live","/api/health/ready","/api/internal/health/deep"]){
    const response=await fetch(new URL(route,base),{redirect:"error",headers:process.env.VERCEL_AUTOMATION_BYPASS_SECRET?{"x-vercel-protection-bypass":process.env.VERCEL_AUTOMATION_BYPASS_SECRET}:{},signal:AbortSignal.timeout(30_000)});
    const body=await response.text();
    if(route.includes("internal")){
      if(![401,404].includes(response.status))throw new Error("Protected diagnostics accepted an unauthenticated request.");
    }else{
      if(response.status!==200)throw new Error(`Public health gate failed with HTTP ${response.status}.`);
      const value=JSON.parse(body);if(value.status!=="healthy"||JSON.stringify(Object.keys(value).sort())!==JSON.stringify(["service","status"]))throw new Error("Public diagnostic contract leaked extra fields or is unhealthy.");
    }
    reports.push({route,status:response.status,publicContractSafe:true});
  }
  const response=await fetch(new URL("/api/internal/health/deep",base),{redirect:"error",headers:{authorization:`Bearer ${token}`,...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET?{"x-vercel-protection-bypass":process.env.VERCEL_AUTOMATION_BYPASS_SECRET}:{})},signal:AbortSignal.timeout(30_000)});
  const deep=await response.json();
  if(!response.ok||deep.status!=="healthy"||deep.environment!=="preview"||deep.releaseSha!==process.env.GITHUB_SHA)throw new Error("Exact-SHA protected Preview health failed.");
  await writeFile("tmp-final-verify/preview-runtime.json",JSON.stringify({sha:process.env.GITHUB_SHA,url:base.origin,schema:"visa_os_preview",reports,deep},null,2));
  console.log("PASS exact-SHA public and protected Preview health.");
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Preview verification failed.");process.exitCode=1;});
