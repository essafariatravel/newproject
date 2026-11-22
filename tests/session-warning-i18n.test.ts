import { describe, expect, it } from "vitest";
import { SESSION_WARNING_COPY, sessionWarningCopy } from "@/lib/session-warning-copy";
import { SESSION_WARNING_MS } from "@/lib/identity-policy";

describe("session expiry warning — EN / FR / AR, RTL", () => {
  it("has complete, human-readable copy in each supported workspace language", () => {
    expect(Object.keys(SESSION_WARNING_COPY).sort()).toEqual(["ar", "en", "fr"]);
    const keys = Object.keys(SESSION_WARNING_COPY.en);
    for (const locale of ["fr", "en", "ar"] as const) {
      const copy = sessionWarningCopy(locale);
      expect(Object.keys(copy).sort()).toEqual([...keys].sort());
      for (const value of Object.values(copy)) {
        expect(value.trim().length).toBeGreaterThan(3);
      }
      expect(copy.stay).not.toEqual(copy.signOut);
      expect(copy.idleBody.length).toBeGreaterThan(40);
    }
  });
  it("uses a five-minute warning without changing the enforced expiry", () => {
    expect(SESSION_WARNING_MS).toBe(300_000);
    expect(sessionWarningCopy("fr").stay).toBe("Rester connecté");
    expect(sessionWarningCopy("en").stay).toBe("Stay signed in");
    expect(sessionWarningCopy("ar").stay).toBe("البقاء متصلاً");
  });
});
