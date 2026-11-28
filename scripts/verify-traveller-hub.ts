import assert from "node:assert/strict";
import {hubEnabled,HUB_BRANCH,CONSOLIDATED_BRANCH,uuid,passportKey,nameKey,civilDate,minimumExpiry,expiryState,maskPassport,normalizedQuery,pageNumber,identityMatches,reusablePassport,validApplicationPassport,safeLookupTerm,reusableDocument,tripSpecificDocument,sameDeclaredIdentity,renewalStage} from "../src/lib/traveller-hub-policy";
import {automaticDatabaseChangesForbidden} from "./lib/build-policy";
assert.equal(hubEnabled({VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:HUB_BRANCH}),false);
assert.equal(hubEnabled({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:HUB_BRANCH}),true);
assert.equal(hubEnabled({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"other"}),false);
assert.equal(automaticDatabaseChangesForbidden(HUB_BRANCH),true);
assert.equal(uuid("not-an-id"),false);
assert.equal(passportKey(" a1234567 "),"A1234567");
assert.equal(passportKey("00000000"),"");
assert.equal(passportKey("UNKNOWN"),"");
assert.equal(nameKey(" A  B "),"a b");
assert.equal(civilDate("2026-02-30"),null);
assert.equal(minimumExpiry("2026-11-28"),"2027-06-28");
assert.equal(minimumExpiry("2026-07-31"),"2027-02-28");
assert.equal(expiryState("2027-06-27","2026-11-28"),"renew");
assert.equal(expiryState("2027-06-28","2026-11-28"),"valid");
assert.equal(expiryState(null,"2026-11-28"),"unknown");
assert.equal(maskPassport("A1234567"),"•••• 4567");
assert.equal(normalizedQuery("x".repeat(200)).length,100);
assert.equal(pageNumber(-1),1);
assert.equal(pageNumber(Infinity),1);
const identity={name:"Synthetic Traveller",nationality:"DZA",passport:"A1234567",expiry:"2030-01-01"};
assert.equal(identityMatches(identity,identity),true);
assert.equal(identityMatches(identity,{...identity,passport:""}),false);
assert.equal(identityMatches(identity,{...identity,name:"Other"}),false);
assert.equal(identityMatches(identity,{...identity,nationality:"MAR"}),false);
assert.equal(identityMatches(identity,{...identity,expiry:"2031-01-01"}),false);
const file={code:"PASSPORT",status:"ACCEPTED",size:123,mime:"application/pdf",sha256:"a".repeat(64),expiry:"2030-01-01",today:"2026-11-28",latest:true,openRequest:false,attributable:true};
assert.equal(reusablePassport(file),true);
for(const patch of [{code:"BANK_STATEMENT"},{code:"DECISION_VISA_APPROVAL"},{status:"REJECTED"},{sha256:null},{size:3000000},{expiry:null},{expiry:"2027-01-01"},{latest:false},{openRequest:true},{attributable:false}])assert.equal(reusablePassport({...file,...patch}),false);
console.log("[traveller-hub] Policy, identity, expiry, reusable-document and isolated build checks PASS (35 assertions)");

assert.equal(validApplicationPassport("","2027-06-28","2026-11-28"),true);
assert.equal(validApplicationPassport("","2027-06-27","2026-11-28"),false);
assert.equal(validApplicationPassport("","", "2026-11-28"),false);
assert.equal(validApplicationPassport("00000000","2030-01-01","2026-11-28"),false);
console.log("[traveller-hub] Mandatory expiry policy PASS (4 assertions)");

assert.equal(safeLookupTerm("x"),"");assert.equal(safeLookupTerm(" AB "),"AB");assert.equal(safeLookupTerm({}),"");
console.log("[traveller-hub] Bounded lookup PASS (3 assertions)");

const current={...file,uploadedAt:"2026-11-01T00:00:00Z"};
assert.equal(reusableDocument({...current,code:"BANK_STATEMENT"}),true);
assert.equal(reusableDocument({...current,code:"BANK_STATEMENT",uploadedAt:"2026-10-01"}),false);
assert.equal(reusableDocument({...current,code:"PHOTO"}),true);
assert.equal(reusableDocument({...current,code:"MARRIAGE_CERT"}),true);
assert.equal(reusableDocument({...current,code:"DECISION_VISA_APPROVAL"}),false);
assert.equal(reusableDocument({...current,code:"UNKNOWN"}),false);
assert.equal(reusableDocument({...current,code:"BANK_STATEMENT",openRequest:true}),false);
assert.equal(tripSpecificDocument("HOTEL_RESERVATION"),true);
assert.equal(tripSpecificDocument("PHOTO"),false);
assert.equal(sameDeclaredIdentity({...identity,passport:""},{...identity,passport:""}),true);
assert.equal(sameDeclaredIdentity(identity,{...identity,expiry:"2031-01-01"}),false);
console.log("[traveller-hub] Expanded controlled reuse and profile identity PASS (11 assertions)");

assert.equal(renewalStage("2027-06-28","2026-11-28"),null);
assert.equal(renewalStage("2027-03-01","2026-11-28"),"RENEW");
assert.equal(renewalStage("2026-12-10","2026-11-28"),"URGENT");
assert.equal(renewalStage("2026-11-28","2026-11-28"),"EXPIRED");
assert.equal(renewalStage(null,"2026-11-28"),null);
console.log("[traveller-hub] Renewal stages PASS (5 assertions)");

assert.equal(hubEnabled({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:CONSOLIDATED_BRANCH}),true);
assert.equal(hubEnabled({VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:CONSOLIDATED_BRANCH}),false);
assert.equal(automaticDatabaseChangesForbidden(CONSOLIDATED_BRANCH),true);
console.log("[consolidation] Combined Preview scope PASS (3 assertions)");

import {vaultEnabled,autoEligible,autoPlan} from "../src/lib/traveller-hub-policy";
const automaticInput={...file,status:"UPLOADED",issuedAt:null,uploadedAt:"2026-11-01",vault:false};
assert.equal(autoEligible(automaticInput),true);
assert.equal(autoEligible({...automaticInput,status:"REJECTED"}),false);
assert.equal(autoEligible({...automaticInput,code:"BANK_STATEMENT"}),false);
assert.equal(autoEligible({...automaticInput,code:"BANK_STATEMENT",issuedAt:"2026-11-10",vault:true}),true);
assert.equal(autoEligible({...automaticInput,code:"BANK_STATEMENT",issuedAt:"2026-10-01",vault:true}),false);
assert.equal(autoEligible({...automaticInput,code:"HOTEL_RESERVATION",issuedAt:"2026-11-10"}),false);
assert.equal(vaultEnabled({VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:CONSOLIDATED_BRANCH}),false);
const opt={id:"one",typeId:"passport",code:"PASSPORT",name:"p.pdf",mime:"application/pdf",size:100,sourceReference:"case",createdAt:"2026-11-01",programmeId:"",tripSpecific:false,automatic:true};
assert.equal(autoPlan([opt,{...opt,id:"two",vault:true}],["passport"])[0]?.id,"two");
assert.equal(autoPlan([opt],["passport"],["passport"]).length,0);
assert.equal(autoPlan([{...opt,tripSpecific:true}],["passport"]).length,0);
console.log("[vault] Independent vault and automatic selection policy PASS (10 assertions)");

assert.equal(autoEligible({...automaticInput,code:"PHOTO",issuedAt:"2026-11-20",vault:true}),true);
assert.equal(autoEligible({...automaticInput,code:"PHOTO",issuedAt:"2026-12-20",vault:true}),false);
assert.equal(autoEligible({...automaticInput,latest:false}),false);
assert.equal(autoEligible({...automaticInput,openRequest:true}),false);
assert.equal(autoEligible({...automaticInput,attributable:false}),false);
assert.equal(autoPlan([opt,{...opt,id:"two",createdAt:"2026-11-02"}],["passport","passport"]).length,1);
console.log("[vault] Freshness, identity and single-selection regressions PASS (6 assertions)");

import {canConsolidate} from "../src/lib/traveller-hub-policy";
assert.equal(canConsolidate({...identity,dob:null},{...identity,dob:null}),true);
assert.equal(canConsolidate({...identity,dob:null,expiry:""},{...identity,dob:null,expiry:""}),false);
assert.equal(canConsolidate({...identity,dob:"1990-01-01"},{...identity,dob:"1991-01-01"}),false);
assert.equal(canConsolidate({...identity,dob:null},{...identity,dob:null,passport:""}),false);
console.log("[traveller-hub] Explicit corroborated merge policy PASS (4 assertions)");

import {directorySort} from "../src/lib/traveller-hub-policy";
assert.equal(directorySort("name"),"name");assert.equal(directorySort("expiry"),"expiry");assert.equal(directorySort("recent"),"recent");assert.equal(directorySort("expiry;drop table"),"recent");assert.equal(directorySort(undefined),"recent");console.log("[traveller-directory] Safe server-side sort PASS (5 assertions)");

assert.equal(hubEnabled({VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:CONSOLIDATED_BRANCH,DATABASE_SCHEMA:"visa_os"}),true);
assert.equal(vaultEnabled({VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:CONSOLIDATED_BRANCH,DATABASE_SCHEMA:"visa_os"}),true);
assert.equal(hubEnabled({VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:CONSOLIDATED_BRANCH,DATABASE_SCHEMA:"visa_os_preview"}),false);
console.log("[hub-release] Production exact schema boundary PASS (3 assertions)");


import {canonicalPersonalCode,personalCode} from "../src/lib/traveller-hub-policy";
const productionAliases=[["COD-PASS","PASSPORT"],["DOC-ID-PHOTO","PHOTO"],["DOC-UZB-ICAO-PHOTO","PHOTO"],["DOC-REL","BANK_STATEMENT"],["LEGACY-0987407aa51fe6db448d256a55321a9b","BANK_STATEMENT"],["DOC-EMPLOYMENT-OR-BUSINESS","EMPLOYMENT_CERT"],["LEGACY-455880d5b685eb5f7a3598ab704d90fc","EMPLOYMENT_CERT"]];
for(const [code,canonical] of productionAliases){assert.equal(canonicalPersonalCode(code!),canonical);assert.equal(personalCode(code!),true);}
for(const code of ["DOC-GROUP-PASSPORTS","DECISION_VISA_APPROVAL","DOC-SUPPORTING-VISA","EGY_STICKER_SHIPMENT_PROOF","LEGACY-4b8e7617dd7309fd040d63f2814f33fd","UNKNOWN"]){assert.equal(personalCode(code),false);}
assert.equal(reusablePassport({...file,code:"COD-PASS"}),true);
assert.equal(autoEligible({...automaticInput,code:"COD-PASS"}),true);
assert.equal(autoEligible({...automaticInput,code:"COD-PASS",expiry:"2027-01-01"}),false);
assert.equal(autoEligible({...automaticInput,code:"DOC-ID-PHOTO",issuedAt:null}),false);
assert.equal(autoEligible({...automaticInput,code:"DOC-ID-PHOTO",issuedAt:"2026-11-20"}),true);
assert.equal(autoEligible({...automaticInput,code:"DOC-REL",issuedAt:"2026-10-01"}),false);
assert.equal(autoEligible({...automaticInput,code:"DOC-REL",issuedAt:"2026-11-20"}),true);
assert.equal(autoPlan([{...opt,code:"DOC-UZB-ICAO-PHOTO",typeId:"icao"}],["standard-photo"]).length,0);
console.log("[vault-catalogue] Production aliases, freshness, forbidden types and exact type-ID reuse PASS (28 assertions)");


import {vaultStorageLimits,vaultStorageFits,profileIdentityComplete,parallelStagingEnabled} from "../src/lib/traveller-hub-policy";
import {sharedDocumentCode,groupDocumentConflict} from "../src/lib/group-policy";
const prodParity={VERCEL_ENV:"production",DATABASE_SCHEMA:"visa_os",VERCEL_GIT_COMMIT_REF:CONSOLIDATED_BRANCH};
const previewParity={...prodParity,VERCEL_ENV:"preview",DATABASE_SCHEMA:"visa_os_preview"};
const MiB=1024*1024;
assert.deepEqual(vaultStorageLimits(prodParity),{global:100*MiB,agency:25*MiB,database:400*MiB});
assert.deepEqual(vaultStorageLimits(previewParity),{global:20*MiB,agency:20*MiB,database:null});
assert.equal(vaultStorageFits({global:20*MiB,agency:0,database:282176659},2*MiB,prodParity),true);
assert.equal(vaultStorageFits({global:20*MiB,agency:0,database:282176659},2*MiB,previewParity),false);
assert.equal(vaultStorageFits({global:99*MiB,agency:0,database:282176659},2*MiB,prodParity),false);
assert.equal(vaultStorageFits({global:24*MiB,agency:24*MiB,database:282176659},2*MiB,prodParity),false);
assert.equal(vaultStorageFits({global:0,agency:0,database:399*MiB},2*MiB,prodParity),false);
assert.equal(vaultStorageFits({global:NaN,agency:0,database:0},1,prodParity),false);
assert.equal(profileIdentityComplete("", "2031-01-01"),false);
assert.equal(profileIdentityComplete("A1234567",null),false);
assert.equal(profileIdentityComplete("A1234567","2031-01-01"),true);
assert.equal(parallelStagingEnabled(prodParity),true);
assert.equal(parallelStagingEnabled({...prodParity,ESSAFARIA_PARALLEL_STAGING:"false"}),false);
assert.equal(parallelStagingEnabled({...prodParity,DATABASE_SCHEMA:"visa_os_preview"}),false);
for(const code of ["LEGACY-4b8e7617dd7309fd040d63f2814f33fd","LEGACY-8626bc732ffa233f4e105ee5e1002c16","LEGACY-d42cf2b07d29646d145578d1740bf6d3","LEGACY-ee25dc3ac5f96746f7a664765d716072"]){assert.equal(sharedDocumentCode(code),true);assert.equal(tripSpecificDocument(code),true);assert.equal(groupDocumentConflict([{member:1,code,sha256:"test"},{member:2,code,sha256:"test"}]),false);assert.equal(autoEligible({...automaticInput,code}),false)}
for(const code of ["COD-PASS","DOC-ID-PHOTO","DOC-REL","DOC-GROUP-PASSPORTS","DOC-SUPPORTING-VISA","UNKNOWN"]){assert.equal(sharedDocumentCode(code),false);assert.equal(groupDocumentConflict([{member:1,code,sha256:"test"},{member:2,code,sha256:"test"}]),true)}
console.log("[production-parity] Storage budgets, historic identity, bounded parallel uploads, real catalogue sharing and personal-file protection PASS (42 assertions)");
