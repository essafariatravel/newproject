/**
 * VFS China mail-to-application matching rules.
 *
 * Pure, side-effect-free gate. A message is never itself proof of the final
 * visa sticker, but ESSAFARIA explicitly treats the official online-review
 * certificate as a completed B2B service. Only a unique, pre-linked VISA OS
 * application is eligible for the business decision workflow.
 *
 * This does not read Gmail, mutate statuses, or authorize an HTTP endpoint.
 */
export const VFS_CHINA_SENDER = "service@visaforchina.org";
export const VFS_CHINA_ALIAS = "visa@essafariavoyages.com";
export const VFS_CHINA_REFERENCE = /^ALG[A-Z0-9]{10,26}$/;
/** Staff may pre-enter the VFS numeric Application Form No. (available earlier). */
export const VFS_CHINA_BINDING_REFERENCE = /^(?:ALG[A-Z0-9]{10,26}|[0-9]{12,24})$/;

export interface VfsChinaMailMetadata {
  from: string;
  recipients: readonly string[];
  subject: string;
  body: string;
  pdfFilename: string;
  /** Must come from a verified server-side Gmail authentication result. */
  gmailDmarcVerified: boolean;
}

export interface VfsChinaCertificate {
  reference: string;
  applicationFormNumber: string;
  passportNumber: string;
}

export interface ChinaApplicationCandidate {
  applicationId: string;
  agencyId: string;
  destinationIso2: string;
  statusCode: string;
  /** Optional record created when the VFS application is submitted. */
  vfsReference: string | null;
  /** Sensitive passport number; use only for a transient server-side match. */
  passportNumber: string | null;
  /** True only when passport_mrz_evidence exists after successful ICAO checks. */
  passportOcrVerified: boolean;
}

export type VfsMatchResult =
  | { state: "MATCHED"; applicationId: string; agencyId: string }
  | { state: "IGNORED_OFFLINE" }
  | { state: "REVIEW_REQUIRED"; reason:
      "UNVERIFIED_MAIL" | "INCONSISTENT_CERTIFICATE" | "MISSING_IDENTIFIER" |
      "AMBIGUOUS_MATCH" | "NOT_ELIGIBLE" | "OCR_NOT_VERIFIED" };

function mailbox(raw: string): string {
  return (raw.match(/<([^<>]+)>/)?.[1] ?? raw).trim().toLowerCase();
}
function normalizedId(raw: string): string {
  return raw.replace(/\s+/g, "").trim().toUpperCase();
}
function uniqueCapture(source: string, re: RegExp): string | null {
  const matches = [...source.matchAll(re)].map((x) => normalizedId(x[1] ?? ""));
  if (matches.length === 0 || new Set(matches).size !== 1) return null;
  return matches[0] ?? null;
}

/** Extract from the PDF's text layer (never infer a passport from a contact name). */
export function parseVfsCertificateText(text: string): VfsChinaCertificate | null {
  const reference = uniqueCapture(text, /(?:Certificate\s*No\.|凭证号码)\s*[:：]?\s*(ALG[A-Z0-9]{10,26})/gi);
  const applicationFormNumber = uniqueCapture(text, /(?:Application\s*Form\s*No\.|申请表编号)\s*[:：]?\s*([0-9]{12,24})/gi);
  const passportNumber = uniqueCapture(text, /(?:Passport\s*No\.|护照号码)\s*[:：]?\s*([A-Z0-9]{5,16})/gi);
  if (!reference || !applicationFormNumber || !passportNumber || !VFS_CHINA_REFERENCE.test(reference)) return null;
  return { reference, applicationFormNumber, passportNumber };
}

/** Only match the known, authenticated VFS template; reject forwarded/spoofed messages. */
export function inspectVfsChinaMail(mail: VfsChinaMailMetadata): string | null {
  if (!mail.gmailDmarcVerified ||
      mailbox(mail.from) !== VFS_CHINA_SENDER ||
      !mail.recipients.map(mailbox).includes(VFS_CHINA_ALIAS) ||
      !/^online review completed\b/i.test(mail.subject.trim()) ||
      !/completed the online review/i.test(mail.body)) return null;
  const reference = uniqueCapture(mail.body, /\b(ALG[A-Z0-9]{10,26})\b/gi);
  const filenameReference = normalizedId(mail.pdfFilename).match(/^(ALG[A-Z0-9]{10,26})(?:\s*\(\d+\))?\.PDF$/)?.[1];
  if (!reference || !filenameReference || reference !== filenameReference || !VFS_CHINA_REFERENCE.test(reference)) return null;
  return reference;
}

/**
 * No text layer, missing passport or conflicting matches => no status change.
 * Multiple offline certificates are safe: a nonmatching message is ignored.
 */
export function matchVfsChinaCertificate(
  mail: VfsChinaMailMetadata,
  certificate: VfsChinaCertificate | null,
  candidates: readonly ChinaApplicationCandidate[],
): VfsMatchResult {
  const mailReference = inspectVfsChinaMail(mail);
  if (!mailReference) return { state: "REVIEW_REQUIRED", reason: "UNVERIFIED_MAIL" };
  if (!certificate || certificate.reference !== mailReference)
    return { state: "REVIEW_REQUIRED", reason: "INCONSISTENT_CERTIFICATE" };

  const linked = candidates.filter((c) => c.vfsReference &&
    (normalizedId(c.vfsReference) === certificate.reference ||
     normalizedId(c.vfsReference) === certificate.applicationFormNumber));
  if (!linked.length) return { state: "IGNORED_OFFLINE" };
  if (linked.length !== 1) return { state: "REVIEW_REQUIRED", reason: "AMBIGUOUS_MATCH" };

  const match = linked[0]!;
  if (!match.passportNumber) return { state: "REVIEW_REQUIRED", reason: "MISSING_IDENTIFIER" };
  if (!match.passportOcrVerified) return { state: "REVIEW_REQUIRED", reason: "OCR_NOT_VERIFIED" };
  if (normalizedId(match.passportNumber) !== normalizedId(certificate.passportNumber))
    return { state: "REVIEW_REQUIRED", reason: "INCONSISTENT_CERTIFICATE" };
  if (match.destinationIso2 !== "CN" || !["IN_PROCESS", "EMBASSY_SENT"].includes(match.statusCode))
    return { state: "REVIEW_REQUIRED", reason: "NOT_ELIGIBLE" };
  if (!match.applicationId || !match.agencyId)
    return { state: "REVIEW_REQUIRED", reason: "MISSING_IDENTIFIER" };
  return { state: "MATCHED", applicationId: match.applicationId, agencyId: match.agencyId };
}
