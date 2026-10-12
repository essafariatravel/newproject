import { describe, expect, it } from "vitest";
import { aliasNames, deploymentHasDomain, extractGitSha, newestDeployment } from "../scripts/lib/dr-vercel-release";

describe("DR Vercel production release helpers", () => {
  it("extracts a full Git SHA from gitSource", () => {
    expect(extractGitSha({gitSource:{sha:"831607a2ed0423d575d693b8f8f3a9dfc1e5d9d1"}}))
      .toBe("831607a2ed0423d575d693b8f8f3a9dfc1e5d9d1");
  });

  it("falls back to Vercel Git metadata and rejects short SHAs", () => {
    expect(extractGitSha({meta:{githubCommitSha:"65da322529edf7200f29b0d331d0b7be797c3d12"}}))
      .toBe("65da322529edf7200f29b0d331d0b7be797c3d12");
    expect(extractGitSha({gitSource:{sha:"831607a"}})).toBeNull();
  });

  it("normalizes aliases and detects the production domain", () => {
    const d={alias:["Foo.vercel.app"],aliases:[{alias:"visa.essafariavoyages.com"}]};
    expect(aliasNames(d)).toEqual(expect.arrayContaining(["foo.vercel.app","visa.essafariavoyages.com"]));
    expect(deploymentHasDomain(d,"VISA.ESSAFARIAVOYAGES.COM")).toBe(true);
  });

  it("selects the newest matching deployment", () => {
    expect(newestDeployment([
      {uid:"older",createdAt:"2026-09-29T10:00:00Z"},
      {uid:"newer",createdAt:"2026-09-30T10:00:00Z"},
    ])?.uid).toBe("newer");
  });
});
