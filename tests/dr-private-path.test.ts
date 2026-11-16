import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pathInsideRepository, privateArtifactPath } from "../scripts/lib/dr-private-path";

const cleanup: string[] = [];
afterEach(() => {
  for (const item of cleanup.splice(0)) rmSync(item, { recursive: true, force: true });
});

describe("private DR artifact path guard", () => {
  it("rejects existing and future files inside the repository", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "essafaria-dr-repo-"));
    cleanup.push(root);
    mkdirSync(path.join(root, "work"));
    writeFileSync(path.join(root, "work", "existing.json"), "{}");

    expect(pathInsideRepository(path.join(root, "work", "existing.json"), root)).toBe(true);
    expect(pathInsideRepository(path.join(root, "work", "future.json"), root)).toBe(true);
    expect(() => privateArtifactPath(path.join(root, "work", "existing.json"), "artifact", { repositoryRoot: root }))
      .toThrow("outside the public repository");
    expect(() => privateArtifactPath(path.join(root, "work", "future.json"), "artifact", { repositoryRoot: root }))
      .toThrow("outside the public repository");
  });

  it("allows a normal private path outside the repository", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "essafaria-dr-repo-"));
    const privateRoot = mkdtempSync(path.join(os.tmpdir(), "essafaria-dr-private-"));
    cleanup.push(root, privateRoot);
    const candidate = path.join(privateRoot, "backup.manifest.json");
    expect(pathInsideRepository(candidate, root)).toBe(false);
    expect(privateArtifactPath(candidate, "artifact", { repositoryRoot: root })).toBe(path.resolve(candidate));
  });

  it("rejects an external symlink whose physical destination is inside the repository", () => {
    if (process.platform === "win32") return;
    const root = mkdtempSync(path.join(os.tmpdir(), "essafaria-dr-repo-"));
    const external = mkdtempSync(path.join(os.tmpdir(), "essafaria-dr-link-"));
    cleanup.push(root, external);
    mkdirSync(path.join(root, "private"));
    const link = path.join(external, "looks-private");
    symlinkSync(path.join(root, "private"), link, "dir");
    const candidate = path.join(link, "evidence.json");

    expect(pathInsideRepository(candidate, root)).toBe(true);
    expect(() => privateArtifactPath(candidate, "evidence", { repositoryRoot: root }))
      .toThrow("outside the public repository");
  });

  it("can require an absolute operator path", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "essafaria-dr-repo-"));
    cleanup.push(root);
    expect(() => privateArtifactPath("../relative.json", "output", { requireAbsolute: true, repositoryRoot: root }))
      .toThrow("absolute private path");
  });
});
