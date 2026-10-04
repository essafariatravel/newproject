import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { verifyHostedTarget } from "../scripts/lib/hosted-target";

const sha = "a".repeat(40);
const preview = "https://newproject-abc123def-essafaria-travel-s-projects.vercel.app";
const env = { GH_TOKEN: "synthetic-read-token", PREVIEW_DEPLOYED_SHA: sha };

describe("hosted Preview verification safety boundary", () => {
  const script = readFileSync("scripts/hosted-verify.sh", "utf8");
  const bash = spawnSync("bash", ["--version"], { encoding: "utf8" });
  it.skipIf(process.platform === "win32" && bash.error?.message.includes("ENOENT"))("is valid shell", () => {
    const syntax = spawnSync("bash", ["-n", "scripts/hosted-verify.sh"], { encoding: "utf8" });
    expect(syntax.status, syntax.stderr || syntax.error?.message).toBe(0);
  });
  it("validates the target before the first probe", () => {
    expect(script.indexOf("scripts/lib/hosted-target.ts")).toBeGreaterThan(0);
    expect(script.indexOf("scripts/lib/hosted-target.ts")).toBeLessThan(script.indexOf('CODE=$(status_of'));
    expect(script).toContain("exit 2");
  });
  it.each([
    "https://visa.essafariavoyages.com", "https://essafariavoyages.com", "https://newproject.vercel.app",
    "https://arbitrary.vercel.app", "https://newproject-git-main-essafaria-travel-s-projects.vercel.app",
    preview + ".evil.example", preview + "/redirect", preview + "?host=localhost", preview + "#fragment",
    preview.replace("https:", "http:"), preview.replace("https://", "https://user:pass@"),
    "http://localhost.evil.example", "http://127.0.0.2", "http://localhost/path",
  ])("refuses unsafe target %s before any network access", async target => {
    const fetcher = vi.fn();
    await expect(verifyHostedTarget(target, env, fetcher)).rejects.toThrow("not a verified non-Production deployment");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("accepts only canonical loopback origins without hosted credentials", async () => {
    const fetcher = vi.fn();
    await expect(verifyHostedTarget("http://127.0.0.1:3011", {}, fetcher)).resolves.toBe("http://127.0.0.1:3011");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["Production", "Preview"])("does not trust a hostname without matching %s deployment evidence", async environment => {
    const fetcher = vi.fn(async () => Response.json([{ id: 123, environment, sha, statuses_url: "https://evil.example" }]));
    await expect(verifyHostedTarget(preview, env, fetcher)).rejects.toThrow("not a verified non-Production deployment");
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(2);
  });
  it("requires an exact successful Preview URL for the expected commit in the pinned repository", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => String(input).endsWith("/123/statuses")
      ? Response.json([{ state: "success", environment_url: preview }])
      : Response.json([{ id: 123, environment: "Preview", sha }]));
    await expect(verifyHostedTarget(preview, env, fetcher)).resolves.toBe(preview);
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith("https://api.github.com/repos/essafariatravel/newproject/deployments"))).toBe(true);
    const mismatch = vi.fn(async () => Response.json([{ state: "success", environment_url: preview.replace("abc123def", "abc123deg") }]));
    await expect(verifyHostedTarget(preview, env, mismatch)).rejects.toThrow();
  });
  it("requires the isolated Preview schema/project/security ledger before privileged mutations", () => {
    for (const invariant of ["visa_os_preview", "intendedSupabaseProject", "0026_function_privilege_hardening.sql", "0027_document_integrity.sql", "0028_file_identity_hardening.sql", "authenticated Preview DB boundary verification failed"]) expect(script).toContain(invariant);
  });
  it("accepts the hardened __Host- session cookie", () => { expect(script).toContain("(__Host-)?evos_session="); });
});
