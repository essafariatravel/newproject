import {afterEach,expect,it,vi} from "vitest";
import {POST} from "../src/app/api/internal/preview-admin-bootstrap/route";
afterEach(()=>vi.unstubAllEnvs());
it("refuses legacy credential bootstrap on the protected hardening Preview before parsing a body",async()=>{
  vi.stubEnv("VERCEL_ENV","preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF","preprod/essafaria-final-hardening");
  vi.stubEnv("DATABASE_SCHEMA","visa_os_preview");
  vi.stubEnv("PREVIEW_ADMIN_BOOTSTRAP","synthetic-bootstrap-test-token");
  const result=await POST(new Request("http://localhost/api/internal/preview-admin-bootstrap",{method:"POST",headers:{"x-admin-bootstrap-token":"synthetic-bootstrap-test-token"},body:"{}"}));
  expect(result.status).toBe(404);
});
