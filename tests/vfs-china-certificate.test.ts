import { describe, expect, it } from "vitest";
import {
  inspectVfsChinaMail, parseVfsCertificateText, matchVfsChinaCertificate,
  type VfsChinaMailMetadata, type ChinaApplicationCandidate,
} from "@/lib/vfs-china-certificate";

const reference = "ALG1234567AL8900700";
const passport = "B12345678";
const pdfText = `
签证申请凭证 Visa Application Certificate
凭证号码 Certificate No. ${reference}
申请表编号 Application Form No. 2026111775482696540
护照号码 Passport No. ${passport}
联系人姓名 Contact Name SOME STAFF CONTACT
`;
const mail: VfsChinaMailMetadata = {
  from: "VFS <service@visaforchina.org>",
  recipients: ["visa@essafariavoyages.com"],
  subject: "Online review completed / 线上审核完成",
  body: `Dear Applicant, Your Application ${reference} has completed the online review, please continue with the subsequent process.`,
  pdfFilename: `${reference}.pdf`,
  gmailDmarcVerified: true,
};
const dossier: ChinaApplicationCandidate = {
  applicationId: "app-1",
  agencyId: "owning-agency-1",
  destinationIso2: "CN",
  statusCode: "IN_PROCESS",
  vfsReference: reference,
  passportNumber: passport,
};

describe("VFS China certificate ingestion safety contract", () => {
  it("extracts a certificate, application form number and the passport; ignores the staff contact name", () => {
    expect(parseVfsCertificateText(pdfText)).toEqual({
      reference,
      applicationFormNumber: "2026111775482696540",
      passportNumber: passport,
    });
  });
  it("accepts the alias mailbox and exact authenticated source + template", () => {
    expect(inspectVfsChinaMail(mail)).toBe(reference);
    expect(matchVfsChinaCertificate(mail, parseVfsCertificateText(pdfText), [dossier]))
      .toEqual({ state: "MATCHED", applicationId: "app-1", agencyId: "owning-agency-1" });
  });
  it("ignores offline VFS requests instead of creating dossiers", () => {
    expect(matchVfsChinaCertificate(mail, parseVfsCertificateText(pdfText), []))
      .toEqual({ state: "IGNORED_OFFLINE" });
  });
  it("never approves using a duplicate or conflicting reference", () => {
    expect(matchVfsChinaCertificate(mail, parseVfsCertificateText(pdfText), [dossier, {...dossier, applicationId: "app-2"}]))
      .toEqual({ state: "REVIEW_REQUIRED", reason: "AMBIGUOUS_MATCH" });
    expect(matchVfsChinaCertificate(mail, parseVfsCertificateText(pdfText), [{...dossier, passportNumber: "X99887766"}]))
      .toEqual({ state: "REVIEW_REQUIRED", reason: "INCONSISTENT_CERTIFICATE" });
  });
  it("requires passport number to be structured, never guesses from the attached image or contact", () => {
    expect(matchVfsChinaCertificate(mail, parseVfsCertificateText(pdfText), [{...dossier, passportNumber: null}]))
      .toEqual({ state: "REVIEW_REQUIRED", reason: "MISSING_IDENTIFIER" });
    expect(matchVfsChinaCertificate(mail, null, [dossier]))
      .toEqual({ state: "REVIEW_REQUIRED", reason: "INCONSISTENT_CERTIFICATE" });
  });
  it("rejects unverified sources, wrong alias and forged attachment names", () => {
    for (const bad of [
      {...mail, gmailDmarcVerified: false},
      {...mail, from: "scam@visaforchina.org.attacker.net"},
      {...mail, recipients: ["someone@example.org"]},
      {...mail, pdfFilename: "random.pdf"},
    ]) {
      expect(matchVfsChinaCertificate(bad, parseVfsCertificateText(pdfText), [dossier]))
        .toEqual({ state: "REVIEW_REQUIRED", reason: "UNVERIFIED_MAIL" });
    }
  });
  it("will not decide files already closed or at an unauthorized step", () => {
    for (const statusCode of ["APPROVED", "REJECTED", "SUBMITTED", "CANCELLED"]) {
      expect(matchVfsChinaCertificate(mail, parseVfsCertificateText(pdfText), [{...dossier, statusCode}]))
        .toEqual({ state: "REVIEW_REQUIRED", reason: "NOT_ELIGIBLE" });
    }
  });
  it("prevents duplicate certificates from a different country from making a decision", () => {
    expect(matchVfsChinaCertificate(mail, parseVfsCertificateText(pdfText), [{...dossier, destinationIso2: "TR"}]))
      .toEqual({ state: "REVIEW_REQUIRED", reason: "NOT_ELIGIBLE" });
  });
  it("refuses inconsistent numbers or missing structured PDF text", () => {
    expect(parseVfsCertificateText("not a certificate")).toBeNull();
    expect(parseVfsCertificateText(pdfText.replace(passport, "xx"))).toBeNull();
    expect(parseVfsCertificateText(pdfText + "\nPassport No. OTHERPASS1")).toBeNull();
  });
});
