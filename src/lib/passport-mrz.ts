/**
 * ICAO 9303 TD3 passport MRZ parser for a trusted OCR engine's text output.
 * No cloud API and no passport images are sent to this module.
 *
 * We accept only a complete two-line 44-character MRZ with all three
 * independent check digits AND composite check digit intact.
 * Do NOT guess OCR-confused characters (O/0, I/1): uncertainty requires review.
 */
export interface VerifiedPassportMrz {
  passportNumber: string;
  issuingCountry: string;
  nationality: string;
  birthYYMMDD: string;
  expiryYYMMDD: string;
}

const WEIGHTS = [7, 3, 1] as const;
const MRZ_LINE = /^[A-Z0-9<]{44}$/;
const PASSPORT_UPPER = /^P[A-Z<][A-Z<]{3}/;

export function mrzCheckDigit(value: string): string {
  let result = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    const n = c === "<" ? 0 : c >= "0" && c <= "9" ? c.charCodeAt(0) - 48
      : c >= "A" && c <= "Z" ? c.charCodeAt(0) - 55 : -1;
    if (n < 0) throw new Error("Invalid MRZ character");
    result += n * WEIGHTS[i % 3]!;
  }
  return String(result % 10);
}

function parseTwoLines(upper: string, lower: string): VerifiedPassportMrz | null {
  if (!MRZ_LINE.test(upper) || !MRZ_LINE.test(lower) || !PASSPORT_UPPER.test(upper)) return null;
  const passport = lower.slice(0, 9);
  const passportDigit = lower[9]!;
  const birth = lower.slice(13, 19);
  const birthDigit = lower[19]!;
  const expiry = lower.slice(21, 27);
  const expiryDigit = lower[27]!;
  const composite = lower.slice(0, 10) + lower.slice(13, 20) + lower.slice(21, 43);
  // ICAO extended passport numbering uses additional optional-data characters;
  // require review rather than incorrectly trimming those to 9 positions.
  if (!passport.replaceAll("<", "") || passport.endsWith("<<") && passportDigit === "<") return null;
  if (!/^\d{6}$/.test(birth) || !/^\d{6}$/.test(expiry)) return null;
  if (mrzCheckDigit(passport) !== passportDigit ||
      mrzCheckDigit(birth) !== birthDigit ||
      mrzCheckDigit(expiry) !== expiryDigit ||
      mrzCheckDigit(composite) !== lower[43]) return null;
  const number = passport.replace(/<+$/, "");
  if (!/^[A-Z0-9]{5,9}$/.test(number)) return null;
  return {
    passportNumber: number,
    issuingCountry: upper.slice(2, 5),
    nationality: lower.slice(10, 13),
    birthYYMMDD: birth,
    expiryYYMMDD: expiry,
  };
}

/**
 * Accept OCR whitespace between characters but never perform guessed
 * character substitutions. Multiple valid distinct MRZs are ambiguous.
 */
export function extractVerifiedPassportMrz(ocrText: string): VerifiedPassportMrz | null {
  if (ocrText.length > 80_000) return null; // bounded to a document text extraction
  const lines = ocrText.toUpperCase().split(/\r?\n/)
    .map((line) => line.replace(/\s/g, ""))
    .filter((line) => line.length === 44 && MRZ_LINE.test(line));
  const found = new Map<string, VerifiedPassportMrz>();
  for (let i = 0; i + 1 < lines.length; i++) {
    const match = parseTwoLines(lines[i]!, lines[i + 1]!);
    if (match) found.set(match.passportNumber, match);
  }
  return found.size === 1 ? [...found.values()][0]! : null;
}

/** Automatic promotion requires the OCR-derived passport and VFS value to agree. */
export function verifiedPassportNumberFromOcr(ocrText: string): string | null {
  return extractVerifiedPassportMrz(ocrText)?.passportNumber ?? null;
}
