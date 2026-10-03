import { describe, expect, it } from "vitest";
import {
  AUTOMATIC_DATABASE_CHANGE_PROTECTED_BRANCHES,
  AUTOMATIC_DATABASE_CHANGE_PROTECTED_BRANCH_PREFIXES,
  automaticDatabaseChangesForbidden,
} from "../scripts/lib/build-policy";

describe("Preview build database-change guard", () => {
  it("forbids automatic writes on the preproduction hardening branch before identity and backup verification", () => {
    expect(automaticDatabaseChangesForbidden("preprod/essafaria-final-hardening")).toBe(true);
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

  it("forbids automatic database changes on SEO safety branches", () => {
    expect(AUTOMATIC_DATABASE_CHANGE_PROTECTED_BRANCH_PREFIXES).toContain("seo/");
    expect(automaticDatabaseChangesForbidden("seo/indexation-safety-gate-2026-10-03")).toBe(true);
    expect(automaticDatabaseChangesForbidden("seo/future-safe-audit")).toBe(true);
  });

  it("leaves normal Arena Preview branch behavior unchanged", () => {
    expect(automaticDatabaseChangesForbidden("arena/01a0ce58-newproject")).toBe(false);
    expect(automaticDatabaseChangesForbidden("arena/01a0c3b8-newproject")).toBe(false);
    expect(automaticDatabaseChangesForbidden(undefined)).toBe(false);
  });
});
