import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {assertLocalMfaBootstrapTarget,assertConsolidationPreviewTarget} from "../scripts/lib/non-performance-targets";
const local={NODE_ENV:"test" as const,PERF_ACK_NONPROD:"YES",DATABASE_SCHEMA:"public",DATABASE_URL:"postgresql://u:synthetic@127.0.0.1:5434/test",MFA_ENCRYPTION_KEY:"synthetic-local-only"};
const preview={NODE_ENV:"test" as const,PERF_ACK_NONPROD:"YES",DATABASE_SCHEMA:"visa_os_preview",DATABASE_URL:"postgresql://postgres.xgetzgixalrsmuvfthpf:synthetic@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full",BASE_URL:"https://newproject-test-essafaria-travel-s-projects.vercel.app"};
describe("non-performance maintenance boundaries",()=>{
 it("allows the required local MFA key without making it a performance exception",()=>{expect(()=>assertLocalMfaBootstrapTarget(local)).not.toThrow();});
 it.each([{...local,DATABASE_SCHEMA:"visa_os"},{...local,DATABASE_URL:preview.DATABASE_URL},{...local,VERCEL_ENV:"preview"},{...local,HTTP_PROXY:"http://proxy.invalid"}])("rejects unsafe MFA target before I/O",env=>{expect(()=>assertLocalMfaBootstrapTarget(env)).toThrow();});
 it("preserves the acknowledged exact historical Preview maintenance scope",()=>{expect(assertConsolidationPreviewTarget(preview)).toMatchObject({remote:true,schema:"visa_os_preview"});});
 it.each([{...preview,DATABASE_SCHEMA:"visa_os"},{...preview,PERF_ACK_NONPROD:""},{...preview,VERCEL_ENV:"production"},{...preview,DATABASE_URL:local.DATABASE_URL},{...preview,DATABASE_URL:preview.DATABASE_URL.replaceAll("xgetzgixalrsmuvfthpf","otherproject") }])("rejects a different or unacknowledged shared target",env=>{expect(()=>assertConsolidationPreviewTarget(env)).toThrow();});
 it("decouples both consumers from performance authorization",()=>{for(const file of ["mfa-authorize-local.ts","consolidation-preview.ts"]){const source=readFileSync(`scripts/${file}`,"utf8");expect(source).not.toContain("assertSafePerfTarget");expect(source).toContain("./lib/non-performance-targets");}});
});
