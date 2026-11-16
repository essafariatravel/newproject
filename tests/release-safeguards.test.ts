import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {validateReleaseApproval,QUALIFIED_RELEASE_SCOPE,createRestorePoints,discoverProtectedTables,assertCleanReleaseCheckout,validateIndependentCustodyReceipt} from "../scripts/lib/release-safeguards";
const sha="a".repeat(40), now=Date.now();
const hashes=Object.fromEntries(QUALIFIED_RELEASE_SCOPE.map(name=>[name,createHash("sha256").update(readFileSync(`migrations/${name}`)).digest("hex")]));
function approval(){return {version:1,status:"APPROVED",approvedBy:"Owner",reason:"Reviewed Production maintenance release",candidateSha:sha,releaseRef:"refs/heads/release/essafaria-prod-candidate-2026-10-10",sourceReleaseSha:"831607a2ed0423d575d693b8f8f3a9dfc1e5d9d1",projectRef:"xgetzgixalrsmuvfthpf",schema:"visa_os",expiresAt:new Date(now+3600000).toISOString(),trafficDrained:true,authorizationId:"d".repeat(32),authorizedDataChanges:["0020_LEGACY_SESSION_POLICY","0021_OBSOLETE_DOCUMENT_REQUEST_CANCELLATION"],migrations:hashes,verifiedManifestSha256:"b".repeat(64),evidenceBundleSha256:"c".repeat(64),custodyReceiptSha256:"f".repeat(64)};}
describe("explicit 0020–0033 release safeguards",()=>{
 it("requires an independent off-site custody recovery receipt",()=>{
  const receipt={version:1,kind:"ESSAFARIA_INDEPENDENT_CUSTODY_RECEIPT",status:"VERIFIED",custodian:"Designated owner custodian",checkedAt:new Date().toISOString(),backupRecipientSpkiSha256:"f82fa8d7fc09b01a2487a02a6d36d3937c3ade3d6ff0a84c205882bbdb526044",custodyRecipientSha256:"e".repeat(64),offsiteRetrieved:true,independentRecoveryVerified:true,recoveryEnvironment:"INDEPENDENT_OF_ORIGINAL_WINDOWS_ACCOUNT"};
  expect(()=>validateIndependentCustodyReceipt(receipt)).not.toThrow();
  for(const bad of [{...receipt,status:"PREPARED"},{...receipt,offsiteRetrieved:false},{...receipt,independentRecoveryVerified:false},{...receipt,recoveryEnvironment:"ORIGINAL_DPAPI_ACCOUNT"}])expect(()=>validateIndependentCustodyReceipt(bad)).toThrow();
 });
 it("covers every existing business table, including rule and identity history",async()=>{
  const tables=["visa_requirements","countries","priorities","application_price_adjustments","agency_registration_history","account_activation_tokens","session_presence"];
  const client={query:async()=>({rows:tables.map(tablename=>({tablename})),rowCount:tables.length})};
  expect(await discoverProtectedTables(client as never)).toEqual(tables);
 });
 it("rejects a mismatched or dirty checkout independent of caller SHA text",()=>{
  const run=(args:string[])=>args[0]==="rev-parse"?"b".repeat(40):"";
  expect(()=>assertCleanReleaseCheckout(sha,run)).toThrow("checkout");
  expect(()=>assertCleanReleaseCheckout(sha,args=>args[0]==="rev-parse"?sha:" M scripts/prod-release.ts")).toThrow("clean");
  expect(assertCleanReleaseCheckout(sha,args=>args[0]==="rev-parse"?sha:"")).toBeUndefined();
 });
 it("accepts only an explicit exact-file owner approval",()=>expect(validateReleaseApproval(approval(),{sha,ref:approval().releaseRef,now})).toEqual(approval()));
 it.each(["status","candidateSha","projectRef","schema","trafficDrained","approvedBy"])("refuses invalid %s",key=>{const a={...approval(),[key]:null};expect(()=>validateReleaseApproval(a,{sha,ref:approval().releaseRef,now})).toThrow();});
 it("rejects expiry, ref mismatch, missing or changed migration and extra future scope",()=>{
  for(const a of [{...approval(),expiresAt:new Date(now-1).toISOString()},{...approval(),releaseRef:"refs/heads/main"},{...approval(),migrations:{...hashes,"0032_privileged_mfa.sql":"0".repeat(64)}},{...approval(),migrations:{...hashes,"9999_extra.sql":"0".repeat(64)}}])expect(()=>validateReleaseApproval(a,{sha,ref:approval().releaseRef,now})).toThrow();
 });
 it("creates unique protected snapshots without destructive overwrite",async()=>{
  const queries:string[]=[];
  const client={query:async(sql:string)=>{queries.push(sql);return {rows:[{t:"users"}],rowCount:1};}};
  const first=await createRestorePoints(client as never,["users"]),second=await createRestorePoints(client as never,["users"]);
  expect(first[0]).not.toBe(second[0]);expect(queries.some(q=>/drop|truncate|delete/i.test(q))).toBe(false);
  expect(queries.some(q=>q.includes("enable row level security"))).toBe(true);
  expect(queries.some(q=>q.includes("revoke all"))).toBe(true);
 });
});
