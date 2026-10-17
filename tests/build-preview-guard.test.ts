import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AUTOMATIC_DATABASE_CHANGE_PROTECTED_BRANCHES,
  automaticDatabaseChangesForbidden,
} from "../scripts/lib/build-policy";

describe("Preview build database-change guard", () => {
  it("prevents automatic deployments and database writes for the local legal release candidate", () => {
    expect(automaticDatabaseChangesForbidden("codex/legal-readiness-rc-2026-10-15")).toBe(true);
    const config = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
    expect(config.git?.deploymentEnabled?.["codex/legal-readiness-rc-2026-10-15"]).toBe(false);
  });
  it.each([
    "codex/essafaria-autonomous-completion-2026-10-13",
    "codex/essafaria-autonomous-completion-2026-11-01",
  ])("forbids automatic database changes on engineering branch %s", (branch) => {
    expect(automaticDatabaseChangesForbidden(branch)).toBe(true);
  });
  it("disables automatic Vercel deployments for the autonomous engineering branch", () => {
    const config = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
    expect(config.git?.deploymentEnabled?.["codex/essafaria-autonomous-completion-2026-10-13"]).toBe(false);
  });
  it.each([
    "codex/essafaria-unrelated-engineering-2026-10-13",
    "codex/essafaria-autonomous-completions-2026-10-13",
  ])("leaves unrelated engineering branch %s unchanged", (branch) => {
    expect(automaticDatabaseChangesForbidden(branch)).toBe(false);
  });
  it("forbids automatic migrations and seeds on production release candidates", () => {
    for (const branch of [
      "release/essafaria-prod-candidate-2026-10-10",
      "release/essafaria-prod-candidate-2026-10-11",
    ]) {
      expect(automaticDatabaseChangesForbidden(branch)).toBe(true);
    }
  });
  it("disables automatic Vercel deployments for the frozen production candidate", () => {
    const config = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
    expect(config.git?.deploymentEnabled?.["release/essafaria-prod-candidate-2026-10-10"]).toBe(false);
  });
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
