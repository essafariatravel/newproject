import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("master RC publication and authentication boundaries",()=>{
  it("prepares exact-ref manual CI without deployment or secrets",()=>{
    const workflow=readFileSync(".github/workflows/master-rc-local-verification.yml","utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("github.ref == 'refs/heads/codex/master-go-live-rc-2026-10-17'");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toMatch(/secrets\.|environment:|deployments:\s*write|vercel (deploy|promote)|PROD_GO|push:|pull_request:/);
    for(const action of workflow.matchAll(/uses:\s*([^\s]+)/g))expect(action[1]).toMatch(/@[a-f0-9]{40}$/);
  });
  it("synthetic perf session creation never attests an unperformed MFA challenge",()=>{
    const source=readFileSync("scripts/perf-create-sessions.ts","utf8");
    expect(source).not.toContain("mfa_verified_at");
    expect(source).toContain("MFA is never fabricated");
  });
});
