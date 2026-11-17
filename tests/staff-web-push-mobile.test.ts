import { describe, expect, it } from "vitest";
import { isIOSLikeDevice, pushAvailability } from "../src/lib/push-capabilities";

describe("Web Push install guidance on phones", () => {
  it("recognizes iPhone and iPad with desktop-style user agent", () => {
    expect(isIOSLikeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isIOSLikeDevice("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)")).toBe(true);
    expect(isIOSLikeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5)).toBe(true);
    expect(isIOSLikeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 0)).toBe(false);
    expect(isIOSLikeDevice("Mozilla/5.0 (Linux; Android 16; Pixel)")).toBe(false);
  });
  it("shows iPhone installation instructions before unsupported browser label", () => {
    expect(pushAvailability(true, false, false)).toBe("install");
    expect(pushAvailability(true, false, true)).toBe("install");
    expect(pushAvailability(true, true, true)).toBe("ready");
    expect(pushAvailability(true, true, false)).toBe("unsupported");
    expect(pushAvailability(false, false, true)).toBe("ready");
    expect(pushAvailability(false, false, false)).toBe("unsupported");
  });
});
