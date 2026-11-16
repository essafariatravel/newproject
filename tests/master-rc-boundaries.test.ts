import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("master RC publication and authentication boundaries",()=>{
  it("blocks automatic deployment for engineering and future migration-sentinel refs",()=>{
    const config=JSON.parse(readFileSync('vercel.json','utf8'));
    for(const ref of ['codex/phase2a-release-qualification-2026-10-20','release/essafaria-prod-candidate-2026-10-20'])expect(config.git.deploymentEnabled[ref]).toBe(false);
  });
  it("can start on the exact authorized branch push without changing the default branch",()=>{
    const workflow=readFileSync('.github/workflows/master-rc-local-verification.yml','utf8');
    expect(workflow).toMatch(/  push:\r?\n    branches:\r?\n      - codex\/master-go-live-rc-2026-10-17\r?\n      - codex\/phase2a-release-qualification-2026-10-20\r?\n  workflow_dispatch:/);
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("github.ref == 'refs/heads/codex/master-go-live-rc-2026-10-17'");
  });
  it("keeps exact-ref CI without deployment or secrets",()=>{
    const workflow=readFileSync(".github/workflows/master-rc-local-verification.yml","utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("github.ref == 'refs/heads/codex/master-go-live-rc-2026-10-17'");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toMatch(/secrets\.|environment:|deployments:\s*write|vercel (deploy|promote)|PROD_GO|pull_request:/);
    for(const action of workflow.matchAll(/uses:\s*([^\s]+)/g))expect(action[1]).toMatch(/@[a-f0-9]{40}$/);
  });
  it("synthetic perf session creation never attests an unperformed MFA challenge",()=>{
    const source=readFileSync("scripts/perf-create-sessions.ts","utf8");
    expect(source).not.toContain("mfa_verified_at");
    expect(source).toContain("MFA is never fabricated");
  });
});
