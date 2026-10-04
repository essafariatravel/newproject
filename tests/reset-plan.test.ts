import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { assertDryRunTarget, dependencyDeleteOrder, parseResetOptions } from "../scripts/lib/reset-plan";
import * as resetPolicy from "../scripts/lib/reset-plan";
import { resetCliNodePath, resetCliPath } from "./helpers/reset-cli";
import { parse as parsePgConnection } from "pg-connection-string";

function invokeReset(args: string[], overrides: Record<string, string> = {}) {
  // Port 1 cannot reach the managed test cluster. Even the unsafe baseline cannot delete data.
  return spawnSync(process.execPath, [resetCliPath, ...args], {
    cwd: process.cwd(), encoding: "utf8", timeout: 10_000,
    env: { ...process.env, NODE_PATH: resetCliNodePath, DATABASE_URL: "postgresql://reset:unconfigured@127.0.0.1:1/unreachable", DATABASE_SCHEMA: "public", ...overrides },
  });
}

describe("go-live reset fails closed", () => {
  it("refuses execution without a reviewed approval manifest before opening a connection", () => {
    const result = invokeReset(["--execute"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Execution is disabled");
    expect(result.stderr).not.toContain("unconfigured");
  });
  it("refuses Production schema before opening a connection", () => {
    const result = invokeReset(["--dry-run"], { DATABASE_SCHEMA: "visa_os" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Production reset planning is forbidden");
  });
  it("refuses Production environment before opening a connection", () => {
    const result = invokeReset(["--dry-run"], { VERCEL_ENV: "production" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Production reset planning is forbidden");
  });
});

describe("reset plan policy", () => {
  it("requires an explicit execution request plus the reviewed approval manifest, with dry-run remaining default", () => {
    expect(parseResetOptions(["--approval-manifest", "reviewed-local.json"])).toMatchObject({ execute: false, approvalManifest: "reviewed-local.json" });
    expect(parseResetOptions(["--execute", "--approval-manifest", "reviewed-local.json"])).toMatchObject({ execute: true, approvalManifest: "reviewed-local.json" });
    expect(() => parseResetOptions(["--execute", "--blueprint", "--approval-manifest", "reviewed-local.json"])).toThrow();
  });
  it("accepts only explicit local snapshots and never a remote target", () => {
    expect(assertDryRunTarget({ DATABASE_URL: "postgresql://reset:secret@localhost:5434/restore_check", DATABASE_SCHEMA: "visa_os_preview" })).toEqual({ schema: "visa_os_preview" });
    expect(() => assertDryRunTarget({ DATABASE_URL: "postgresql://reset:secret@preview.invalid/db", DATABASE_SCHEMA: "visa_os_preview" })).toThrow("Remote reset planning is disabled");
    expect(() => assertDryRunTarget({})).toThrow("DATABASE_URL must be supplied explicitly");
    expect(() => assertDryRunTarget({ DATABASE_URL: "postgresql://localhost/db", VERCEL: "1" })).toThrow("Production reset planning is forbidden");
  });
  it("orders child tables before parents and refuses dependency cycles", () => {
    expect(dependencyDeleteOrder(["users", "agencies", "sessions"], [{ child: "sessions", parent: "users" }, { child: "users", parent: "agencies" }])).toEqual(["sessions", "users", "agencies"]);
    expect(() => dependencyDeleteOrder(["a", "b"], [{ child: "a", parent: "b" }, { child: "b", parent: "a" }])).toThrow("manual review");
  });
  it("deduplicates preserved UUIDs and rejects malformed identities and execution aliases", () => {
    const id = "abcdefab-1234-1234-1234-123456789abc";
    expect(parseResetOptions(["--preserve-user", id.toUpperCase(), "--preserve-user", id]).preserveUsers).toEqual([id]);
    expect(() => parseResetOptions(["--preserve-user", "all"])).toThrow("Invalid preserved user");
    for (const flag of ["--force", "--yes", "--confirm"]) expect(() => parseResetOptions([flag])).toThrow("Execution is disabled");
  });
  it("produces an offline blueprint without connecting or exposing connection secrets", () => {
    const result = invokeReset(["--blueprint"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "OFFLINE_BLUEPRINT", executionAvailable: true, productionExecutionAvailable: false });
    expect(result.stdout).not.toContain("unconfigured");
  });
});

const previewIdentity = {
  projectRef: "xgetzgixalrsmuvfthpf", schema: "visa_os_preview", branch: "preprod/essafaria-final-hardening",
  sha: "53dc61de334c6412c1e5337b4f745c360f69facd", vercelProjectId: "prj_resetFixture",
  vercelTeamId: "team_resetFixture", deploymentId: "dpl_resetFixture",
};
const gitIdentity = { branch: previewIdentity.branch, sha: previewIdentity.sha, clean: true, repository: "essafariatravel/newproject" };
const previewEnvironment = { DATABASE_URL: "postgresql://postgres.xgetzgixalrsmuvfthpf:synthetic-placeholder@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=verify-full", DATABASE_SCHEMA: "visa_os_preview" };
const previewGuard = (env = previewEnvironment, identity = previewIdentity, git = gitIdentity) =>
  (assertDryRunTarget as unknown as (env: Record<string,string|undefined>, options: object) => object)(env, {isolatedPreview:true, previewIdentity:identity, gitIdentity:git});
const verifyPreview = (fetcher: typeof fetch, identity = previewIdentity, token = "synthetic-fixture-token") =>
  (resetPolicy as unknown as {verifyPreviewResetIdentity: (identity:object,token:string|undefined,fetcher:typeof fetch) => Promise<object>}).verifyPreviewResetIdentity(identity,token,fetcher);

describe("explicit isolated Preview cleanup guards without any hosted request", () => {
  it("requires explicit Preview mode and reviewed manifest while preserving default local dry-run", () => {
    expect(parseResetOptions(["--isolated-preview", "--approval-manifest", "owner-reviewed.json"])).toMatchObject({isolatedPreview:true, execute:false});
    expect(() => parseResetOptions(["--isolated-preview"])).toThrow();
    expect(() => parseResetOptions(["--isolated-preview", "--blueprint", "--approval-manifest", "owner-reviewed.json"])).toThrow();
  });
  it("accepts only the exact project/schema, verified TLS and actual clean candidate Git identity", () => {
    expect(previewGuard()).toMatchObject({schema:"visa_os_preview",isolatedPreview:true});
  });
  it("rejects a parsed database route override even though the URI authority identifies the approved project", () => {
    const value=`${previewEnvironment.DATABASE_URL}&user=postgres.otherproject`;
    expect(new URL(value).username).toBe("postgres.xgetzgixalrsmuvfthpf");
    expect(parsePgConnection(value).user).toBe("postgres.otherproject");
    expect(()=>previewGuard({...previewEnvironment,DATABASE_URL:value})).toThrow();
  });
  it.each((["local","preview"] as const).flatMap(mode => ["host","user","password","port","database","db","options","sslcert","sslkey","sslrootcert","ssl","uselibpqcompat"].map(parameter => [mode,parameter] as const)))("rejects %s query parameter %s before parsing credentials or opening a connection", (mode,parameter) => {
    const value=mode==="preview" ? `${previewEnvironment.DATABASE_URL}&${parameter}=synthetic-override` : `postgresql://fixture:synthetic-placeholder@localhost:5434/disposable?${parameter}=synthetic-override`;
    if(mode==="preview") expect(()=>previewGuard({...previewEnvironment,DATABASE_URL:value})).toThrow();
    else expect(()=>assertDryRunTarget({DATABASE_URL:value,DATABASE_SCHEMA:"reset_fixture_offline"})).toThrow();
  });
  it("retains explicit local TLS modes while refusing duplicate or insecure TLS mode aliases", () => {
    for(const mode of ["disable","require","verify-full"]) {
      expect(assertDryRunTarget({DATABASE_URL:`postgresql://fixture:synthetic-placeholder@localhost:5434/disposable?sslmode=${mode}`,DATABASE_SCHEMA:"reset_fixture_offline"})).toEqual({schema:"reset_fixture_offline"});
    }
    for(const suffix of ["sslmode=disable&sslmode=verify-full","sslmode=no-verify","sslmode=prefer"]) {
      expect(()=>assertDryRunTarget({DATABASE_URL:`postgresql://fixture:synthetic-placeholder@localhost:5434/disposable?${suffix}`,DATABASE_SCHEMA:"reset_fixture_offline"})).toThrow();
    }
  });
  it.each(["wrong-project", "wrong-schema", "wrong-branch", "wrong-sha", "dirty-tree", "wrong-repository", "insecure-tls", "duplicate-sslmode", "ssl-alias", "tls-disabled", "wrong-host", "production", "vercel-runtime", "wrong-manifest-project", "wrong-manifest-schema"])("rejects %s before opening a connection", scenario => {
    const env: Record<string,string|undefined> = {...previewEnvironment}, identity={...previewIdentity}, git={...gitIdentity};
    if(scenario==="wrong-project") env.DATABASE_URL=env.DATABASE_URL!.replace("postgres.xgetzgixalrsmuvfthpf", "postgres.other");
    if(scenario==="wrong-schema") env.DATABASE_SCHEMA="visa_os";
    if(scenario==="wrong-branch") git.branch="main";
    if(scenario==="wrong-sha") git.sha="0".repeat(40);
    if(scenario==="dirty-tree") git.clean=false;
    if(scenario==="wrong-repository") git.repository="another/project";
    if(scenario==="insecure-tls") env.DATABASE_URL=env.DATABASE_URL!.replace("verify-full", "require");
    if(scenario==="duplicate-sslmode") env.DATABASE_URL += "&sslmode=disable";
    if(scenario==="ssl-alias") env.DATABASE_URL += "&ssl=false";
    if(scenario==="tls-disabled") env.NODE_TLS_REJECT_UNAUTHORIZED="0";
    if(scenario==="wrong-host") env.DATABASE_URL=env.DATABASE_URL!.replace("pooler.supabase.com", "pooler.supabase.com.attacker.test");
    if(scenario==="production") env.NODE_ENV="production";
    if(scenario==="vercel-runtime") env.VERCEL="1";
    if(scenario==="wrong-manifest-project") identity.projectRef="other";
    if(scenario==="wrong-manifest-schema") identity.schema="public";
    expect(()=>previewGuard(env as typeof previewEnvironment,identity,git)).toThrow();
  });
  it.each(["valid", "wrong-team", "wrong-project", "wrong-repository", "production-deployment", "wrong-deployment-sha", "wrong-deployment-branch", "not-ready", "unsafe-deployment-url", "health-production", "missing-token"])("verifies %s metadata using mocked HTTPS only", async scenario => {
    const project={id:previewIdentity.vercelProjectId,name:"newproject",accountId:previewIdentity.vercelTeamId,link:{type:"github",org:"essafariatravel",repo:"newproject"}};
    const team={id:previewIdentity.vercelTeamId,slug:"essafaria-travel-s-projects"};
    const deployment={id:previewIdentity.deploymentId,projectId:previewIdentity.vercelProjectId,ownerId:previewIdentity.vercelTeamId,readyState:"READY",target:null as string|null,
      url:"newproject-resetfixture-essafaria-travel-s-projects.vercel.app",gitSource:{sha:previewIdentity.sha,ref:previewIdentity.branch},meta:{githubCommitSha:previewIdentity.sha,githubCommitRef:previewIdentity.branch}};
    const health={ok:true,service:"essafaria-visa-os",deployment:{environment:"preview"}};
    if(scenario==="wrong-team") team.slug="another-team";
    if(scenario==="wrong-project") project.name="another-project";
    if(scenario==="wrong-repository") project.link.repo="another-repository";
    if(scenario==="production-deployment") deployment.target="production";
    if(scenario==="wrong-deployment-sha") deployment.gitSource.sha="0".repeat(40);
    if(scenario==="wrong-deployment-branch") deployment.gitSource.ref="main";
    if(scenario==="not-ready") deployment.readyState="ERROR";
    if(scenario==="unsafe-deployment-url") deployment.url="localhost:5434";
    if(scenario==="health-production") health.deployment.environment="production";
    const fetcher=vi.fn(async (input: string|URL|Request, init?: RequestInit) => {
      const url=String(input);
      expect(init?.redirect).toBe("error");
      if(url.includes("/api/health")) {
        expect(new Headers(init?.headers).has("Authorization")).toBe(false);
        return Response.json(health);
      }
      expect(new URL(url).origin).toBe("https://api.vercel.com");
      if(url.includes("/deployments/")) expect(new URL(url).searchParams.get("withGitRepoInfo")).toBe("true");
      const body=url.includes("/projects/")?project:url.includes("/teams/")?team:deployment;
      return Response.json(body);
    }) as unknown as typeof fetch;
    if(scenario==="valid") expect(await verifyPreview(fetcher)).toMatchObject({environment:"preview",sha:previewIdentity.sha});
    else await expect(verifyPreview(fetcher,previewIdentity,scenario==="missing-token"?"":"synthetic-fixture-token")).rejects.toThrow();
  });
});
