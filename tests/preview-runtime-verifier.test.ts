import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as targetRules from "../scripts/lib/preview-verifier-target";

const sha = "1f4a8144cecc2579664bf1b74b04bcab3bcf6b80";
const source = readFileSync(new URL("../scripts/verify-preview-deployment.ts", import.meta.url), "utf8");
const executable = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("main().catch(", "return main().catch(");

async function runVerifier(options: {
  token?: boolean;
  publicExtra?: Record<string, unknown>;
  publicStatus?: number;
  deepSha?: string;
  deepStatus?: number;
  protections?: string;
} = {}) {
  let stdout = "";
  let stderr = "";
  const requests: string[] = [];
  const processDouble = {
    env: {
      PREVIEW_BASE_URL: "https://newproject-7cwhq9p7q-essafaria-travel-s-projects.vercel.app",
      TARGET_ENVIRONMENT: "preview",
      EXPECTED_RELEASE_SHA: sha,
      ...(options.token === false ? {} : { HEALTHCHECK_TOKEN: "test-only-operator-token-32-bytes-long" }),
    },
    stdout: { write: (value: string) => { stdout += value; } },
    stderr: { write: (value: string) => { stderr += value; } },
    exitCode: 0,
  };
  // Only HTTP is replaced: execute the actual CLI and real target safety rules.
  const fetchDouble = async (url: URL, init: RequestInit) => {
    const path = url.pathname;
    requests.push(path);
    if (!path.startsWith("/api/internal/")) {
      return new Response(JSON.stringify({ status: "healthy", service: "essafaria-visa-os", ...options.publicExtra }), {
        status: options.publicStatus ?? 200,
        headers: { "cache-control": "no-store" },
      });
    }
    if (!new Headers(init.headers).has("authorization")) {
      return new Response("{}", { status: 401 });
    }
    const body = path.endsWith("/deep")
      ? { releaseSha: options.deepSha ?? sha, releaseProtections: { status: options.protections ?? "healthy" } }
      : path.endsWith("/integrity")
        ? { status: "healthy", cutoverAt: "2026-10-01T00:00:00.000Z" }
        : { status: "healthy" };
    return new Response(JSON.stringify(body), { status: path.endsWith("/deep") ? options.deepStatus ?? 200 : 200 });
  };
  await new Function("require", "exports", "process", "fetch", "URL", "Buffer", executable)(
    () => targetRules, {}, processDouble, fetchDouble, URL, Buffer,
  );
  return { stdout, stderr, requests, exitCode: processDouble.exitCode };
}

describe("Preview runtime verifier", () => {
  it("accepts all three minimal public payloads and verifies the protected release", async () => {
    const result = await runVerifier();
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "pass", releaseVerified: true, releaseSha: sha });
  });

  it("rejects public diagnostic metadata", async () => {
    const result = await runVerifier({ publicExtra: { deployment: { environment: "preview" } } });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("public health payload is no longer minimal");
  });

  it("blocks immediately after public checks when the operator token is unavailable", async () => {
    const result = await runVerifier({ token: false });
    expect(result.stderr).toContain("HEALTHCHECK_TOKEN is required");
    expect(result.stdout).toBe("");
    expect(result.requests).toEqual(["/api/health/live", "/api/health/ready", "/api/health"]);
  });

  it("reports Deployment Protection access without attempting internal checks", async () => {
    const result = await runVerifier({ publicStatus: 403 });
    expect(result.stderr).toContain("VERCEL_AUTOMATION_BYPASS_SECRET");
    expect(result.requests).toEqual(["/api/health/live"]);
  });

  it("rejects a protected release SHA mismatch", async () => {
    const result = await runVerifier({ deepSha: "different-release" });
    expect(result.stderr).toContain("release SHA does not match");
    expect(result.exitCode).toBe(1);
  });

  it("rejects unhealthy release protections", async () => {
    const result = await runVerifier({ protections: "degraded" });
    expect(result.stderr).toContain("release protections are not healthy");
    expect(result.exitCode).toBe(1);
  });

  it("does not claim release verification when deep health is degraded", async () => {
    const result = await runVerifier({ deepStatus: 503 });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("HTTP 503");
  });
});
