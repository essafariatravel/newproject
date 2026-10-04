import { describe, expect, it } from "vitest";
import { safeLocalRedirectPath } from "@/lib/navigation-security";

describe("same-origin redirect hardening", () => {
  it("accepts normal application-relative paths", () => {
    expect(safeLocalRedirectPath("/portal?tab=wallet#top")).toBe("/portal?tab=wallet#top");
    expect(safeLocalRedirectPath("/fr/visas")).toBe("/fr/visas");
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example/phish",
    "///evil.example/phish",
    "/\\\\evil.example/phish",
    "\\\\evil.example/phish",
    "javascript:alert(1)",
    "data:text/html,boom",
    "",
    null,
    undefined,
  ])("rejects external or non-path redirect target %p", (value) => {
    expect(safeLocalRedirectPath(value)).toBeNull();
  });
});
