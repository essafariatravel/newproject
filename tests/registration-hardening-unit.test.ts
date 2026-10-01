import { describe, expect, it } from "vitest";
import { registrationFormSchema } from "@/lib/registrations";
import { registrationCopy } from "@/lib/i18n";

describe("minimal partnership application", () => {
  const schema = registrationFormSchema(registrationCopy("en").errors);
  it("accepts first contact without KYC, address or a second mailbox", () => {
    const result = schema.safeParse({ legalName: "Atlas Voyages", contactFirstName: "Amine Benali", email: " OPS@ATLAS.EXAMPLE ", phone: "+213 550 000 000", terms: "true", privacy: "true", accuracy: "true" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.email).toBe("ops@atlas.example");
    expect(result.data.contactEmail).toBe(result.data.email);
    expect(result.data.contactPhone).toBe(result.data.phone);
    expect(result.data.addressLine).toBeNull();
    expect(result.data.commercialRegistrationNumber).toBeNull();
  });
  it("still rejects invalid shared contact details and missing consent", () => {
    const result = schema.safeParse({ legalName: "Atlas Voyages", contactFirstName: "Amine Benali", email: "invalid", phone: "1" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(["email", "phone", "terms", "privacy", "accuracy"]));
  });
});
