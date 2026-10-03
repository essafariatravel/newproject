import { describe, expect, it } from "vitest";
import { trackedPrivateArtifactProblem } from "../scripts/dr-repo-safety";

describe("public repository DR artifact policy", () => {
  it("allows repository-safe examples and source files", () => {
    expect(trackedPrivateArtifactProblem(".env.example")).toBeNull();
    expect(trackedPrivateArtifactProblem("docs/operations/dr-backup-manifest.example.json")).toBeNull();
    expect(trackedPrivateArtifactProblem("scripts/dr-create-backup.ts")).toBeNull();
  });

  it.each([
    [".env", "environment"],
    [".env.production", "environment"],
    ["private/.pgpass", "password"],
    ["private/recovery.dr-key", "encryption key"],
    ["backup/prod.dump", "backup"],
    ["backup/prod.dump.enc", "backup"],
    ["backup/prod.backup", "backup"],
    ["work/foo.restore-evidence.json", "evidence"],
    ["work/foo.offsite-evidence.json", "evidence"],
    ["work/foo.application-evidence.json", "evidence"],
    ["work/foo.tenant-evidence.json", "evidence"],
    ["work/foo.verified.manifest.json", "evidence"],
    ["ESSAFARIA-PROD-20261003T180000Z-deadbeef.manifest.json", "manifest"],
  ])("rejects private tracked artifact %s", (file, expected) => {
    expect(trackedPrivateArtifactProblem(file)?.toLowerCase()).toContain(expected);
  });
});
