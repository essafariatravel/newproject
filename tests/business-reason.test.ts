import { describe, expect, it } from "vitest";
import { businessReason } from "@/lib/business-labels";

describe("generated wallet charge descriptions", () => {
  it("localizes the generated application charge and preserves the reference", () => {
    const reference = "ESS-2026-123";
    const reason = `Visa application ${reference}`;
    expect(businessReason(reason, "APPLICATION_CHARGE", reference, "en")).toBe("Application fee · ESS-2026-123");
    expect(businessReason(reason, "APPLICATION_CHARGE", reference, "fr")).toBe("Frais de dossier · ESS-2026-123");
    expect(businessReason(reason, "APPLICATION_CHARGE", reference, "ar")).toBe("رسوم الطلب · ESS-2026-123");
  });

  it("never rewrites staff notes or guesses a missing or different application reference", () => {
    for (const reason of ["Visa application ESS-2026-123 — correction", "Visa application OTHER", "Reimbursement agreed with agency", "رسوم متفق عليها"]) {
      expect(businessReason(reason, "APPLICATION_CHARGE", "ESS-2026-123", "fr")).toBe(reason);
    }
    const reason = "Visa application ESS-2026-123";
    expect(businessReason(reason, "CREDIT", "ESS-2026-123", "ar")).toBe(reason);
    expect(businessReason(reason, "APPLICATION_CHARGE", null, "ar")).toBe(reason);
    expect(businessReason(reason, "APPLICATION_CHARGE", undefined, "ar")).toBe(reason);
  });
});
