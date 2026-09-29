import { describe, expect, it } from "vitest";
import { actionFeedbackPath } from "../src/lib/action-feedback";

describe("action feedback navigation", () => {
  it("preserves the selected tab and anchor while replacing stale feedback", () => {
    const path = actionFeedbackPath("/portal/applications/example?tab=documents&error=old#request", "ok", "Document uploaded.");
    const url = new URL(path, "https://local.invalid");
    expect(url.searchParams.get("tab")).toBe("documents");
    expect(url.searchParams.get("ok")).toBe("Document uploaded.");
    expect(url.searchParams.has("error")).toBe(false);
    expect(url.hash).toBe("#request");
  });
  it("keeps user-controlled return paths on this application", () => {
    for (const path of ["https://outside.example", "//outside.example", "/\\outside.example", "javascript:alert(1)"]) {
      expect(actionFeedbackPath(path, "error", "Try again")).toBe("/?error=Try%20again");
    }
  });
});
