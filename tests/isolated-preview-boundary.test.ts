import {afterEach,describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {databasePoolConfig,databaseUrl} from "../src/lib/database-config";
import {mfaEnforcementEnabled} from "../src/lib/mfa-policy";
import {automaticDatabaseChangesForbidden} from "../scripts/lib/build-policy";

const branch="codex/isolated-clean-preview-2026-10-15";
const ref="nqudhszgodmzckautrby";
const url=`postgresql://postgres.${ref}:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
const source="postgresql://postgres.xgetzgixalrsmuvfthpf:synthetic@aws-1-us-east-1.pooler.supabase.com:5432/postgres";
const preview={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_PROJECT_ID:"prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp",VERCEL_GIT_COMMIT_REF:branch,DATABASE_SCHEMA:"visa_os_preview",DATABASE_URL:url,MFA_ENFORCEMENT_ENABLED:"false"};
afterEach(()=>vi.unstubAllEnvs());

describe("independent clean Preview boundary",()=>{
  it("uses the independently approved project with verified TLS and the Preview search path",()=>{
    expect(databaseUrl(preview)).toBe(url);
    expect(databasePoolConfig(preview)).toMatchObject({options:"-c search_path=pg_catalog,visa_os_preview",ssl:{rejectUnauthorized:true}});
    expect(mfaEnforcementEnabled(preview)).toBe(false);
  });
  it("keeps the same database when MFA is eventually enabled through the controlled flag",()=>{
    const env={...preview,MFA_ENFORCEMENT_ENABLED:"true"};expect(databaseUrl(env)).toBe(url);expect(mfaEnforcementEnabled(env)).toBe(true);
  });
  it.each([source,...["ridoyedqgiavgcwnpubq","vwixmkzgpmzgwbshzxji","other"].map(r=>`postgresql://postgres.${r}:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres`)])("rejects every source, DR and unapproved project on the isolated branch",bad=>{
    const env={...preview,DATABASE_URL:bad};expect(()=>databaseUrl(env)).toThrow(/boundary mismatch/i);expect(mfaEnforcementEnabled(env)).toBe(true);
  });
  it.each([
    {VERCEL:undefined},{VERCEL_PROJECT_ID:"other"},{DATABASE_SCHEMA:"visa_os"},{DATABASE_SCHEMA:undefined},{VERCEL_TARGET_ENV:"production"},
    {VERCEL_ENV:undefined},{VERCEL_ENV:""},{VERCEL_ENV:"development"},{VERCEL_ENV:"production"},
  ])("rejects an incomplete or conflicting isolated Preview scope %j",patch=>{
    const env={...preview,...patch};expect(()=>databaseUrl(env)).toThrow(/boundary mismatch/i);expect(mfaEnforcementEnabled(env)).toBe(true);
  });
  it.each(["codex/preview-mfa-enforcement-2026-10-14","main","other",undefined])("does not authorize the new database from branch %s",b=>{
    const env={...preview,VERCEL_GIT_COMMIT_REF:b};expect(()=>databaseUrl(env)).toThrow(/boundary mismatch/i);expect(mfaEnforcementEnabled(env)).toBe(true);
  });
  it("keeps Production pinned to its original database and MFA policy",()=>{
    for(const VERCEL_ENV of ["production"]){const env={...preview,VERCEL_ENV,VERCEL_GIT_COMMIT_REF:"main",DATABASE_SCHEMA:"visa_os"};expect(()=>databaseUrl(env)).toThrow(/boundary mismatch/i);expect(databaseUrl({...env,DATABASE_URL:source})).toBe(source);expect(mfaEnforcementEnabled({...env,DATABASE_URL:source})).toBe(true);}
  });
  it.each([undefined,"","development","production"])("rejects all database access by the isolated branch outside explicit Preview: %s",VERCEL_ENV=>{
    for(const DATABASE_URL of [source,url]){const env={...preview,VERCEL_ENV,DATABASE_URL};expect(()=>databaseUrl(env)).toThrow(/boundary mismatch/i);expect(mfaEnforcementEnabled(env)).toBe(true);}
  });
  it.each([undefined,"development"])("never uses the new project from an unapproved local or missing context: %s",VERCEL_ENV=>{
    for(const VERCEL_GIT_COMMIT_REF of [undefined,"main","other"]){expect(()=>databaseUrl({...preview,VERCEL_ENV,VERCEL_GIT_COMMIT_REF})).toThrow(/boundary mismatch/i);}
  });
  it.each([
    `postgresql://postgres.source:synthetic@aws-0-us-east-1.pooler.supabase.com/postgres?user=postgres.${ref}`,
    `postgresql://postgres:synthetic@localhost/postgres?host=db.${ref}.supabase.co`,
    `postgresql://postgres:synthetic@DB.${ref.toUpperCase()}.supabase.co/postgres`,
    `postgresql://postgres:synthetic@db%2E${ref}.supabase.co/postgres`,
    `postgresql://postgres:synthetic@db.${ref}.supabase.co./postgres`,
  ])("recognizes effective and noncanonical routing to the isolated project outside Preview",DATABASE_URL=>{
    expect(()=>databaseUrl({...preview,VERCEL_ENV:"development",VERCEL_GIT_COMMIT_REF:"main",DATABASE_URL})).toThrow(/boundary mismatch/i);
  });
  it.each(["?options=-c%20search_path%3Dvisa_os","?host=db.xgetzgixalrsmuvfthpf.supabase.co","?user=other","?sslmode=disable","?sslmode=no-verify","?uselibpqcompat=true"]) ("rejects routing and TLS overrides %s",suffix=>{
    const env={...preview,DATABASE_URL:url+suffix};expect(()=>databaseUrl(env)).toThrow(/boundary mismatch/i);expect(mfaEnforcementEnabled(env)).toBe(true);
  });
  it("blocks build migrations and seeds even without the MFA pause flag",()=>{
    vi.stubEnv("MFA_ENFORCEMENT_ENABLED",undefined);expect(automaticDatabaseChangesForbidden(branch)).toBe(true);
  });
  it("requires an explicit deployment rather than publishing automatically from Git",()=>{
    const config=JSON.parse(readFileSync("vercel.json","utf8"));expect(config.git.deploymentEnabled[branch]).toBe(false);
  });
});
