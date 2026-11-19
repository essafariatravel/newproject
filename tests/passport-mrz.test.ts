import { describe, expect, it } from "vitest";
import { mrzCheckDigit, extractVerifiedPassportMrz, verifiedPassportNumberFromOcr } from "@/lib/passport-mrz";

// Public ICAO example: fictional passport, never a customer identity.
const upper = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
const lower = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";

describe("passport OCR MRZ — strict ICAO 9303 validation", () => {
  it("extracts passport number from verified two-line passport OCR text", () => {
    expect(upper).toHaveLength(44);
    expect(lower).toHaveLength(44);
    expect(extractVerifiedPassportMrz("blurred passport image\n" + upper + "\n" + lower))
      .toEqual({
        passportNumber: "L898902C3",
        issuingCountry: "UTO",
        nationality: "UTO",
        birthYYMMDD: "740812",
        expiryYYMMDD: "120415",
      });
    expect(verifiedPassportNumberFromOcr(upper + "\n" + lower)).toBe("L898902C3");
  });

  it("uses ICAO 7–3–1 checksums rather than confidence guesses", () => {
    expect(mrzCheckDigit("L898902C3")).toBe("6");
    expect(mrzCheckDigit("740812")).toBe("2");
    expect(mrzCheckDigit("120415")).toBe("9");
    expect(verifiedPassportNumberFromOcr(upper + "\n" + lower.replace("C3", "C8"))).toBeNull();
    expect(verifiedPassportNumberFromOcr(upper + "\n" + lower.replace("740812", "740813"))).toBeNull();
    expect(verifiedPassportNumberFromOcr(upper + "\n" + lower.replace("120415", "120416"))).toBeNull();
    expect(verifiedPassportNumberFromOcr(upper + "\n" + lower.replace(/0$/, "2"))).toBeNull();
  });

  it("does not infer a number from visual labels or OCR that lacks a complete passport MRZ", () => {
    expect(verifiedPassportNumberFromOcr("Passport No: B12345678")).toBeNull();
    expect(verifiedPassportNumberFromOcr(upper + "\nL898902C3")).toBeNull();
    expect(verifiedPassportNumberFromOcr("")).toBeNull();
  });

  it("refuses multiple distinct verified MRZ identities in one document", () => {
    // Independent valid passport numbers require Staff review.
    const second = "A12345678";
    const amended = second + mrzCheckDigit(second) + lower.slice(10);
    const composite = mrzCheckDigit(amended.slice(0, 10) + amended.slice(13, 20) + amended.slice(21, 43));
    const distinct = amended.slice(0, 43) + composite;
    expect(verifiedPassportNumberFromOcr([upper, lower, upper, distinct].join("\n"))).toBeNull();
  });
});
