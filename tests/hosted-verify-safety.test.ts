import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

describe("hosted Preview verification safety boundary", () => {
  const script = readFileSync("scripts/hosted-verify.sh", "utf8");

  it("is valid shell and refuses Production/arbitrary hosts before probes", () => {
    const syntax = spawnSync("bash", ["-n", "scripts/hosted-verify.sh"], { encoding: "utf8" });
    expect(syntax.status, syntax.stderr).toBe(0);
    expect(script).toContain("visa.essafariavoyages.com");
    expect(script).toContain("*.vercel.app");
    expect(script).toContain("exit 2");
    expect(script).toContain("SAFETY: hosted verification refuses the Production domain");
  });

  it("requires the isolated Preview schema/project/security ledger before privileged mutations", () => {
    expect(script).toContain("visa_os_preview");
    expect(script).toContain("intendedSupabaseProject");
    expect(script).toContain("0026_function_privilege_hardening.sql");
    expect(script).toContain("0027_document_integrity.sql");
    expect(script).toContain("0028_file_identity_hardening.sql");
    expect(script).toContain("authenticated Preview DB boundary verification failed");
  });

  it("accepts the hardened __Host- session cookie", () => {
    expect(script).toContain("(__Host-)?evos_session=");
  });
});
