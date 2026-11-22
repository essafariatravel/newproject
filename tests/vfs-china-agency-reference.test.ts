import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("VFS China reference — agency visibility and isolation", () => {
  const bindings = readFileSync("src/lib/vfs-china-bindings.ts", "utf8");
  const portal = readFileSync("src/app/portal/applications/[id]/page.tsx", "utf8");

  it("requires agency role, feature flag and an owning agency", () => {
    expect(bindings).toContain("export async function readAgencyVfsChinaReference");
    expect(bindings).toContain("!isAgencyRole(user.role) || !user.agencyId");
    expect(bindings).toContain('eq(applications.agencyId, user.agencyId)');
    expect(bindings).toContain('eq(countries.iso2, "CN")');
  });

  it("checks dossier tenancy first and never exposes a reference editing form", () => {
    expect(portal.indexOf("const detail = await getApplicationDetail(id, user);"))
      .toBeLessThan(portal.indexOf("readAgencyVfsChinaReference(id, user)"));
    expect(portal).toContain("{vfsChinaReference ? (");
    expect(portal).toContain('data-testid="agency-vfs-china-reference"');
    expect(portal).not.toContain("saveVfsChinaReferenceAction");
  });

  it("does not change the staff-only creation and immutable binding workflow", () => {
    expect(bindings).toContain("export async function saveVfsChinaReference(");
    expect(bindings).toContain('if (old) throw new AppError("REFERENCE_LOCKED"');
  });
});
