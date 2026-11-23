import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const load = (p: string) => readFileSync(p, "utf8");

describe("VFS China integration — deployment safety contract", () => {
  const mail = load("src/app/api/integrations/vfs-china/mail/route.ts");
  const ocr = load("src/app/api/integrations/vfs-china/ocr/route.ts");
  const auth = load("src/lib/vfs-integration-auth.ts");
  const script = load("scripts/integrations/vfs-china-gmail-apps-script.js");
  const worker = load("scripts/workers/vfs_china_passport_ocr.py");
  const schema = load("src/db/schema.ts");

  it("never activates OCR/mail automatically without explicit feature flags", () => {
    expect(auth).toContain('process.env.VFS_CHINA_INTEGRATION_ENABLED === "true"');
    expect(auth).toContain('process.env.VFS_CHINA_OCR_ENABLED === "true"');
    expect(auth).toContain('process.env.VFS_CHINA_AUTO_DECISION_ENABLED === "true"');
    expect(mail).toContain("if (!vfsMailDecisionEnabled()) return outcome(\"MATCHED_DRY_RUN\")");
    expect(ocr).toContain("if (!vfsOcrWorkerEnabled())");
  });

  it("uses distinct keys so the OCR workstation cannot forge a Gmail approval", () => {
    expect(auth).toContain("VFS_CHINA_MAIL_HMAC_SECRET");
    expect(auth).toContain("VFS_CHINA_OCR_HMAC_SECRET");
    expect(mail).toContain('requireSignedVfsRequest(request, raw, "mail")');
    expect(ocr).toContain('requireSignedVfsRequest(request, raw, "ocr")');
  });

  it("requires evidence and exact linking before calling the existing canonical decision workflow", () => {
    expect(mail).toContain("candidateForVfsReference(certificate)");
    expect(mail).toContain("matchVfsChinaCertificate(source, certificate, candidates)");
    expect(mail).toContain("passportOcrVerified:");
    expect(mail).toContain("recordApplicationDecision({");
    expect(mail).toContain('outcome: "APPROVED"');
    expect(mail).toContain("claimMail({");
    expect(mail).toContain("vfsChinaMailEvents");
    expect(mail).not.toContain("await db.update(applications).set({ statusId:");
  });

  it("keeps offline requests out of VISA OS and never touches Gmail messages", () => {
    expect(mail).toContain('if (match.state === "IGNORED_OFFLINE") return outcome("IGNORED_OFFLINE")');
    expect(script).toContain("GmailApp.search(VFS_CHINA_QUERY");
    expect(script).not.toContain(".markRead(");
    expect(script).not.toContain(".moveToTrash(");
    expect(script).not.toContain(".setTrashed(");
  });

  it("uses only scoped OCR requests and no third-party paid OCR upload", () => {
    expect(ocr).toContain('eq(documentTypes.code, "COD-PASS")');
    expect(ocr).toContain("isNull(passportMrzEvidence.applicationId)");
    expect(ocr).toContain("assertStoredFileIntegrity({");
    expect(ocr).toContain("recordVerifiedPassportFromOcr({");
    expect(worker).toContain("tesseract");
    expect(worker).toContain("pdftoppm");
    expect(worker).not.toContain("cloud.google.com/vision");
    expect(worker).not.toContain("amazonaws.com/textract");
  });

  it("keeps all sensitive new tables private", () => {
    const refs = load("migrations/0036_vfs_china_reference_bindings.sql");
    const passport = load("migrations/0037_passport_mrz_evidence.sql");
    const inbox = load("migrations/0038_vfs_china_mail_events.sql");
    for (const content of [refs, passport, inbox]) {
      expect(content).toContain("enable row level security;");
      expect(content).toContain("revoke all privileges");
      expect(content).toContain("anon, authenticated");
    }
    expect(schema).toContain("export const vfsChinaBindings");
    expect(schema).toContain("export const passportMrzEvidence");
    expect(schema).toContain("export const vfsChinaMailEvents");
  });
});
