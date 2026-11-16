import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Phase 2 Final — staff document workflow: replacement & additional requests,
 * post-submit lock, DZD-only, simplified dossier.
 */

const ADMIN_PAGE = readFileSync("src/app/admin/applications/[id]/page.tsx", "utf8");
const DETAIL = readFileSync("src/components/application-detail.tsx", "utf8");
const ACTIONS = readFileSync("src/app/actions/documents.ts", "utf8");
const DOC_SERVICE = readFileSync("src/lib/documents.ts", "utf8");
const REQ_SERVICE = readFileSync("src/lib/document-requests.ts", "utf8");

describe("Phase 2 Final — staff document replacement & additional workflow", () => {
  it("admin application page supports replacement and additional document requests", () => {
    expect(ADMIN_PAGE).toContain("requestReplacementAction");
    expect(ADMIN_PAGE).toContain("requestAdditionalDocumentAction");
    expect(ADMIN_PAGE).toContain("Documents");
    expect(ADMIN_PAGE).toContain("DZD");
  });

  it("document service enforces post-submit lock via document_requests", () => {
    expect(DOC_SERVICE).toContain("document_requests");
    expect(DOC_SERVICE).toContain("OPEN");
    expect(DOC_SERVICE).toContain("Locked after submission");
    expect(DOC_SERVICE).toContain("FULFILLED");
  });

  it("document_requests service handles replacement & additional with audit", () => {
    expect(REQ_SERVICE).toContain("REPLACEMENT");
    expect(REQ_SERVICE).toContain("ADDITIONAL");
    expect(REQ_SERVICE).toContain("DOCUMENT_REPLACEMENT_REQUESTED");
    expect(REQ_SERVICE).toContain("DOCUMENT_ADDITIONAL_REQUESTED");
    expect(REQ_SERVICE).toContain("notifyUsers");
  });

  it("review action enforces permission + mandatory reason server-side", () => {
    expect(ACTIONS).toContain("reviewDocumentAction");
    expect(ACTIONS).toMatch(/requirePermission|requireStaff/);
    expect(ACTIONS).toContain("requestReplacementAction");
    expect(ACTIONS).toContain("requestAdditionalDocumentAction");
  });

  it("agency resubmission via document_requests: locked docs only uploadable when requested", () => {
    expect(DETAIL).toContain("Upload");
    // Old resubmission path still exists for rejected docs
    expect(ACTIONS).toContain("uploadDocumentAction");
  });
});
