import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AUTOMATIC_DATABASE_CHANGE_PROTECTED_BRANCHES,
  automaticDatabaseChangesForbidden,
} from "../scripts/lib/build-policy";

describe("Preview build database-change guard", () => {
  it("forbids automatic database writes on final consolidation candidates", () => {
    expect(automaticDatabaseChangesForbidden("codex/world-class-final-consolidation-2026-10-07")).toBe(true);
  });
  it("forbids automatic writes on the preproduction hardening branch before identity and backup verification", () => {
    expect(automaticDatabaseChangesForbidden("preprod/essafaria-final-hardening")).toBe(true);
    expect(automaticDatabaseChangesForbidden("security/pre-codex-gate-2026-10-03")).toBe(true);
  });
  it("forbids automatic database changes on the isolated pre-Codex security branch", () => {
    expect(automaticDatabaseChangesForbidden("security/pre-codex-gate-2026-10-03")).toBe(true);
  });

  it("forbids automatic database changes during North Star design Preview builds", () => {
    expect(automaticDatabaseChangesForbidden("design/essafaria-northstar")).toBe(true);
  });
  it("forbids automatic database changes on the authoritative RC branch", () => {
    expect(automaticDatabaseChangesForbidden("release/essafaria-rc-2026-09")).toBe(true);
  });

  it("keeps the existing protected redesign Preview branches protected", () => {
    for (const branch of [
      "codex/essafaria-premium-redesign",
      "codex/essafaria-product-excellence",
    ]) {
      expect(AUTOMATIC_DATABASE_CHANGE_PROTECTED_BRANCHES).toContain(branch);
      expect(automaticDatabaseChangesForbidden(branch)).toBe(true);
    }
  });

  it("protects the release-assembly session and intended release branch from automatic DB changes", () => {
    for (const branch of [
      "arena/01a107e1-newproject",
      "release/final-assembly-2026-10-04",
    ]) {
      expect(AUTOMATIC_DATABASE_CHANGE_PROTECTED_BRANCHES).toContain(branch);
      expect(automaticDatabaseChangesForbidden(branch)).toBe(true);
    }
  });

  it("leaves other Arena Preview branch behavior unchanged", () => {
    expect(automaticDatabaseChangesForbidden("arena/01a0ce58-newproject")).toBe(false);
    expect(automaticDatabaseChangesForbidden("arena/01a0c3b8-newproject")).toBe(false);
    expect(automaticDatabaseChangesForbidden(undefined)).toBe(false);
  });

  it("disables automatic Vercel deployments for the security audit branch", () => {
    const config = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
    expect(config.git?.deploymentEnabled?.["security/pre-codex-gate-2026-10-03"]).toBe(false);
  });
});
