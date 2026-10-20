import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {describe,it,expect} from "vitest";

function stage(policy:string,missing=false){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"essafaria-stage-policy-"));
 const approval=JSON.stringify({version:2,batch:"A",recoveryPolicy:{kind:policy}});
 const env:NodeJS.ProcessEnv={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>!!entry[1]&&/^(PATH|SystemRoot|WINDIR|TEMP|TMP)$/i.test(entry[0]))),NODE_ENV:"test",RUNNER_TEMP:dir,RELEASE_APPROVAL_JSON:approval,RELEASE_APPROVAL_SHA256:createHash("sha256").update(approval).digest("hex"),RELEASE_APPROVAL_FILE:path.join(dir,"release-approval.json"),RELEASE_MANAGED_BACKUP_EVIDENCE:path.join(dir,"release-managed-backup.json")};
 if(!missing)env.RELEASE_MANAGED_BACKUP_JSON=JSON.stringify({kind:"SYNTHETIC_STAGING_ONLY"});
 const r=spawnSync(process.execPath,["scripts/stage-release-approval.cjs"],{cwd:process.cwd(),env,shell:false,encoding:"utf8"});return {dir,r,files:fs.readdirSync(dir)};
}
describe("immutable selected-policy evidence staging",()=>{
 it("stages only the selected managed policy, without inventing independent DR inputs",()=>{const s=stage("SUPABASE_MANAGED_PHYSICAL_V1");try{expect(s.r.status).toBe(0);expect(s.files.sort()).toEqual(["release-approval.json","release-managed-backup.json"]);}finally{fs.rmSync(s.dir,{recursive:true,force:true});}});
 it.each([["SUPABASE_MANAGED_PHYSICAL_V1",true],["UNKNOWN",false]])("validates all inputs before writing any file: %s",(kind,missing)=>{const s=stage(kind as string,missing as boolean);try{expect(s.r.status).not.toBe(0);expect(s.files).toEqual([]);}finally{fs.rmSync(s.dir,{recursive:true,force:true});}});
});
