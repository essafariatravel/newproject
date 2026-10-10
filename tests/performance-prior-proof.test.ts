import {describe,it,expect,afterEach} from "vitest";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function verify(kind="TIER",vus=50,overrides:Record<string,unknown>={},premature=false){
  const dir=mkdtempSync(join(tmpdir(),"essafaria-prior-proof-"));dirs.push(dir);
  const previous=kind==="TIER"?10:vus;
  const tier={sha:"a".repeat(40),baseUrl:"https://newproject-test-essafaria-travel-s-projects.vercel.app",schema:"visa_os_preview",kind:"TIER",vus:previous,holdMinutes:20,status:"PASS",k6StartedAt:"2026-10-07T10:00:00Z",k6FinishedAt:"2026-10-07T10:26:00Z",...overrides};
  writeFileSync(join(dir,"tier.json"),JSON.stringify(tier));
  for(const name of ["db-before.json","db-after.json","k6-summary.json"])writeFileSync(join(dir,name),'{}');
  writeFileSync(join(dir,"evaluation.json"),JSON.stringify({checks:[{pass:true}]}));
  writeFileSync(join(dir,"db-monitor.json"),JSON.stringify({intervalMs:1000,samplingFailed:false,samples:[{at:"2026-10-07T09:59:59Z"},{at:premature?"2026-10-07T10:22:00Z":"2026-10-07T10:25:59Z"}]}));
  return spawnSync(process.execPath,[resolve("scripts/verify-previous-performance.cjs"),dir],{env:{...process.env,PERF_RUN_KIND:kind,PERF_VUS:String(vus),GITHUB_SHA:"a".repeat(40),BASE_URL:tier.baseUrl},encoding:"utf8",shell:false});
}
describe("preceding capacity evidence",()=>{
  it("accepts a same-SHA stable tier with monitoring through the complete workload",()=>{expect(verify().status).toBe(0);});
  it("refuses an otherwise passing tier whose monitor missed the end of the hold",()=>{expect(verify("TIER",50,{},true).status).not.toBe(0);});
  it.each(["SOAK","SPIKE"])("requires a stable tier at the requested %s load, not another run type",kind=>{
    const vus=kind==="SOAK"?100:250;expect(verify(kind,vus).status).toBe(0);expect(verify(kind,vus,{kind,holdMinutes:120}).status).not.toBe(0);
  });
  it("rejects stale-SHA evidence and unrestricted soak loads",()=>{expect(verify("TIER",50,{sha:"b".repeat(40)}).status).not.toBe(0);expect(verify("SOAK",1000).status).not.toBe(0);});
});
