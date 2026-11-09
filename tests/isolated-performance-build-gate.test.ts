import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { automaticDatabaseChangesForbidden } from "../scripts/lib/build-policy";

const TEST_BRANCH = "codex/isolated-capacity-test-20261109";

describe("isolated capacity test release gate", () => {
  it("forbids every automatic migration and seed from the TEST branch build", () => {
    expect(automaticDatabaseChangesForbidden(TEST_BRANCH)).toBe(true);
  });

  it("never automatically deploys the TEST branch from the shared Git connection", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      git?: { deploymentEnabled?: Record<string, boolean> };
    };
    expect(config.git?.deploymentEnabled?.[TEST_BRANCH]).toBe(false);
  });
});
