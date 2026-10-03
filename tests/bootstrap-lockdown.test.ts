import {afterEach,expect,it,vi} from "vitest";
import {GET,POST} from "../src/app/api/internal/preview-admin-bootstrap/route";
afterEach(()=>vi.unstubAllEnvs());

it("keeps the historical remote bootstrap endpoint permanently dormant",async()=>{
  for (const env of [
    {VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"arena/legacy",DATABASE_SCHEMA:"visa_os_preview",PREVIEW_ADMIN_BOOTSTRAP:"synthetic-bootstrap-test-token"},
    {VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:"main",DATABASE_SCHEMA:"visa_os",PREVIEW_ADMIN_BOOTSTRAP:"synthetic-bootstrap-test-token"},
    {VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"security/pre-codex-gate-2026-10-03",DATABASE_SCHEMA:"visa_os_preview",PREVIEW_ADMIN_BOOTSTRAP:"synthetic-bootstrap-test-token"},
  ]) {
    for (const [key,value] of Object.entries(env)) vi.stubEnv(key,value);
    const result=await POST();
    expect(result.status).toBe(404);
    expect(GET().status).toBe(404);
    vi.unstubAllEnvs();
  }
});
