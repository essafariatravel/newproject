import {afterEach,expect,it,vi} from "vitest";
import {POST} from "../src/app/api/internal/preview-admin-bootstrap/route";
import { spawnSync } from "node:child_process";
import path from "node:path";
afterEach(()=>vi.unstubAllEnvs());
it("refuses the retired administrator CLI without reading credentials or connecting",()=>{
  const result=spawnSync(process.execPath,[path.resolve("scripts/reset-preview-admin.ts")],{encoding:"utf8",env:{...process.env,
    DATABASE_URL:"postgresql://postgres:synthetic-cli-secret@127.0.0.1:1/offline_fixture",DATABASE_SCHEMA:"visa_os_preview",
    CONFIRM_PREVIEW_ADMIN_RESET:"yes",RESET_ADMIN_EMAIL:"synthetic@staff.test",RESET_ADMIN_PASSWORD:"Synthetic-Only-Temp-2026"}});
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("retired credential bootstrap");
  expect(result.stderr).not.toContain("synthetic-cli-secret");
  expect(result.stderr).not.toContain("Synthetic-Only-Temp-2026");
});
it("keeps retired bootstrap inert even with its former token on an unprotected Preview branch",async()=>{
  vi.stubEnv("VERCEL_ENV","preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF","feature/preview");
  vi.stubEnv("DATABASE_SCHEMA","visa_os_preview");
  vi.stubEnv("PREVIEW_ADMIN_BOOTSTRAP","synthetic-bootstrap-test-token");
  const request = new Request("http://localhost/api/internal/preview-admin-bootstrap",{method:"POST",headers:{"x-admin-bootstrap-token":"synthetic-bootstrap-test-token"},body:"{}"});
  expect((await POST(request)).status).toBe(404);
  expect(request.bodyUsed).toBe(false);
});
it("refuses legacy credential bootstrap on the protected hardening Preview before parsing a body",async()=>{
  vi.stubEnv("VERCEL_ENV","preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF","preprod/essafaria-final-hardening");
  vi.stubEnv("DATABASE_SCHEMA","visa_os_preview");
  vi.stubEnv("PREVIEW_ADMIN_BOOTSTRAP","synthetic-bootstrap-test-token");
  const result=await POST(new Request("http://localhost/api/internal/preview-admin-bootstrap",{method:"POST",headers:{"x-admin-bootstrap-token":"synthetic-bootstrap-test-token"},body:"{}"}));
  expect(result.status).toBe(404);
});
