import { describe, expect, it } from "vitest";
import { formatDZD } from "@/lib/format";

describe("consistent operational DZD display", () => {
  it.each(["en", "fr", "ar"])("uses space grouping and no redundant decimals in %s", (locale) => {
    expect(formatDZD("11000.00", locale)).toBe("11 000 DZD");
    expect(formatDZD(11000.5, locale)).toBe("11 000.5 DZD");
    expect(formatDZD(-1000, locale)).toBe("-1 000 DZD");
  });
  it("does not echo malformed input into a financial figure", () => {
    expect(formatDZD("Infinity")).toBe("—");
  });
});
