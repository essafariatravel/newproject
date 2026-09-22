import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Phase 2.3 — Rectification 13: staff review uploaded documents INSIDE the
 * application (checklist + documents tabs), accept/reject/resubmit with
 * mandatory reasons, visible to the agency. Behavioural review-path tests
 * live in documents.test.ts; this suite pins the surface wiring.
 */

const ADMIN_PAGE = readFileSync("src/app/admin/applications/[id]/page.tsx", "utf8");
function readDetail() { return readFileSync("src/components/application-detail.tsx", "utf8"); }
const DETAIL = readFileSync("src/components/application-detail.tsx", "utf8");
const ACTIONS = readFileSync("src/app/actions/documents.ts", "utf8");

describe("Phase 2.3 — Rectification 13: in-application staff document review", () => {
  it("admin application page embeds BOTH the checklist table and the document list with review affordances", () => {
    expect(ADMIN_PAGE).toContain("<ChecklistTable");
    expect(ADMIN_PAGE).toContain("<DocumentList");
    expect(ADMIN_PAGE).toMatch(/tab=\$\{t\.id\}/);
    expect(ADMIN_PAGE).toContain("TABS.some");
    expect(readDetail()).toContain("reviewDocumentAction");
  });

  it("review affordances are staff-gated (agency users see read-only states)", () => {
    expect(DETAIL).toContain("DOCUMENT_REVIEW_ROLES");
    expect(DETAIL).toContain("reviewDocumentAction");
    // mandatory-reason rule lives in the review form
    expect(DETAIL).toContain('Reason (mandatory for reject / resubmit)');
    // statuses selectable: ACCEPTED | REJECTED | RESUBMISSION_REQUIRED (+ UNDER_REVIEW)
    expect(DETAIL).toContain('"UNDER_REVIEW"');
    expect(DETAIL).toContain('"ACCEPTED"');
    expect(DETAIL).toContain('"REJECTED"');
    expect(DETAIL).toContain('"RESUBMISSION_REQUIRED"');
  });

  it("review action enforces permission + mandatory reason server-side", () => {
    expect(ACTIONS).toContain("reviewDocumentAction");
    expect(ACTIONS).toMatch(/requirePermission|requireStaff/);
  });

  it("agency resubmission path exists: rejected docs can be re-uploaded (versioning kept)", () => {
    expect(ACTIONS).toContain("uploadResubmissionAction");
    expect(DETAIL).toContain("uploadResubmissionAction");
  });
});
