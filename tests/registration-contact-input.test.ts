import { describe, expect, it } from "vitest";
import {
  assessRegistrationPhone, isRegistrationEmail, registrationCallingCode, registrationProblems, suggestRegistrationEmail,
} from "@/lib/registration-contact";
import type { RegistrationDraft } from "@/lib/registration-draft";

const draft: RegistrationDraft = {
  legalName: "Agence de recette", city: "Alger", contactFirstName: "Amine", contactLastName: "Benali",
  email: "operations@agency.example", phoneCountry: "DZ", phone: "550123456",
};

describe("guided public registration validation", () => {
  it("checks email syntax and suggests a correction only for a known domain typo", () => {
    expect(isRegistrationEmail("  Contact+visa@agency.example ")).toBe(true);
    expect(isRegistrationEmail("ops@agency..example")).toBe(false);
    expect(isRegistrationEmail("ops@agency")).toBe(false);
    expect(suggestRegistrationEmail("ops@gmial.com")).toBe("ops@gmail.com");
    expect(suggestRegistrationEmail("ops@agency.example")).toBeUndefined();
  });

  it("normalizes a domestic trunk prefix, separators and Arabic digits", () => {
    expect(assessRegistrationPhone("٠٥٥٠ ١٢ ٣٤ ٥٦", "DZ")).toEqual({
      status: "valid", country: "DZ", national: "550123456", e164: "+213550123456",
    });
    expect(assessRegistrationPhone("0033 6 12 34 56 78", "DZ")).toEqual({
      status: "valid", country: "FR", national: "612345678", e164: "+33612345678",
    });
  });

  it("requires nine national digits from a matching numbering plan", () => {
    expect(assessRegistrationPhone("55012345", "DZ").status).toBe("length");
    expect(assessRegistrationPhone("5501234567", "DZ").status).toBe("length");
    expect(assessRegistrationPhone("111111111", "DZ").status).toBe("invalid");
    expect(assessRegistrationPhone("550123456 x8", "DZ").status).toBe("invalid");
    expect(registrationCallingCode("US")).toBeUndefined();
    expect(registrationProblems({ ...draft, phone: "+33612345678" }).phoneCountry).toBe("phoneCountry");
  });

  it("requires the two name fields separately and accepts a valid draft", () => {
    expect(registrationProblems(draft)).toEqual({});
    expect(registrationProblems({ ...draft, contactLastName: " " })).toEqual({ contactLastName: "required" });
  });
});
