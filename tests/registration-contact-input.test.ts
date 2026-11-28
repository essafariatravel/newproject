import { describe, expect, it } from "vitest";
import {
  assessRegistrationPhone, normalizeRegistrationName, registrationContactProblems,
  registrationPhoneEntry, registrationPhoneOptions,
} from "@/lib/registration-contact";

const draft = { contactFirstName: "Anne-Marie", contactLastName: "O’Neil", phoneCountry: "DZ", phone: "550123456" };

describe("public registration contact details", () => {
  it("accepts accented, compound and Arabic names and rejects digits or other symbols", () => {
    expect(registrationContactProblems(draft)).toEqual({});
    expect(registrationContactProblems({ ...draft, contactFirstName: "أمينة", contactLastName: "بن يحيى" })).toEqual({});
    expect(normalizeRegistrationName("  E\u0301lodie\u00a0 Anne ")).toBe("Élodie Anne");
    for (const name of ["123", "Amine2", "Benali!", "Anne--Marie", "👤"]) {
      expect(registrationContactProblems({ ...draft, contactFirstName: name, contactLastName: name })).toEqual({
        contactFirstName: "invalidName", contactLastName: "invalidName",
      });
    }
  });

  it("caps the entry without corrupting full pasted numbers", () => {
    expect(registrationPhoneEntry("5501234567", "DZ")).toBeUndefined();
    expect(registrationPhoneEntry("a550123456", "DZ")).toBeUndefined();
    expect(registrationPhoneEntry("٠٥٥٠ ١٢ ٣٤ ٥٦", "DZ")).toEqual({ country: "DZ", national: "550123456" });
    expect(registrationPhoneEntry("+33 6 12 34 56 78", "DZ")).toEqual({ country: "FR", national: "612345678" });
  });

  it("requires a complete number in the selected country and persists international format", () => {
    expect(assessRegistrationPhone("55012345", "DZ").status).toBe("length");
    expect(assessRegistrationPhone("550123456", "DZ")).toMatchObject({ status: "valid", e164: "+213550123456" });
    expect(registrationContactProblems({ ...draft, phone: "+33612345678" })).toEqual({ phoneCountry: "phoneCountry" });
    expect(registrationPhoneOptions("ar")[0]).toMatchObject({ country: "DZ", code: "+213" });
  });
});
