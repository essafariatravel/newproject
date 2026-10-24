import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("validation dependency security boundary", () => {
  it("rejects an oversized collection before accumulating invalid element issues", () => {
    // Small reproduction of GHSA-mrhx-c7xc-m3w5; no load test or large allocation.
    const result = z.array(z.string()).max(2).safeParse([1, 2, 3]);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Oversized input was accepted");
    expect(result.error.issues).toEqual([
      expect.objectContaining({ code: "too_big", path: [], maximum: 2 }),
    ]);
  });
});
