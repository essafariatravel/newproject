import {afterEach,describe,expect,it,vi} from "vitest";
import {mfaEnforcementEnabled} from "@/lib/mfa-policy";
import {automaticDatabaseChangesForbidden} from "../scripts/lib/build-policy";

afterEach(()=>vi.unstubAllEnvs());
describe("Preview MFA scope cannot weaken database identity or build safety",()=>{
  it("requires MFA when URI compatibility options disable certificate verification",()=>{
    expect(mfaEnforcementEnabled({
      MFA_ENFORCEMENT_ENABLED:"false",VERCEL:"1",VERCEL_ENV:"preview",
      VERCEL_PROJECT_ID:"prj_0WOxlorbYiljjjBvZ1Cm6M9JmPdp",
      VERCEL_GIT_COMMIT_REF:"codex/preview-mfa-enforcement-2026-10-14",DATABASE_SCHEMA:"visa_os_preview",
      DATABASE_URL:"postgresql://postgres:synthetic@db.xgetzgixalrsmuvfthpf.supabase.co/postgres?sslmode=require&uselibpqcompat=true",
    })).toBe(true);
  });
  it("forbids automatic database changes during the pause even if branch metadata is absent",()=>{
    vi.stubEnv("MFA_ENFORCEMENT_ENABLED","false");
    expect(automaticDatabaseChangesForbidden(undefined)).toBe(true);
    expect(automaticDatabaseChangesForbidden("unrecognized-preview-branch")).toBe(true);
  });
  it("keeps ordinary build policy unchanged when no pause is requested",()=>{
    vi.stubEnv("MFA_ENFORCEMENT_ENABLED",undefined);
    expect(automaticDatabaseChangesForbidden(undefined)).toBe(false);
  });
});
