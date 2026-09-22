import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Phase 2.2 §5 — the 4-step request wizard: CHOOSE VISA → APPLICANT INFO →
 * UPLOAD DOCS → REVIEW & SUBMIT, reusing the existing single-page flows and
 * server actions (no duplicated logic, no config duplication).
 */
const NEW_PAGE = readFileSync(path.join(__dirname, "..", "src/app/portal/applications/new/page.tsx"), "utf8");
const DETAIL = readFileSync(path.join(__dirname, "..", "src/app/portal/applications/[id]/page.tsx"), "utf8");
const WIZARD = readFileSync(path.join(__dirname, "..", "src/components/wizard-steps.tsx"), "utf8");

describe("Phase 2.2 §5 — 4-step request wizard", () => {
  it("a single shared rail marks the four canonical steps", () => {
    expect(WIZARD).toContain("Application request wizard");
    expect(WIZARD).toContain('"step"'); // aria-current=step on current
    expect(NEW_PAGE).toContain("current={1}");
    expect(NEW_PAGE).toContain('label: ct("Choose visa")');
    expect(NEW_PAGE).toContain('label: ct("Applicant info")');
    expect(NEW_PAGE).toContain('label: ct("Upload documents")');
    expect(NEW_PAGE).toMatch(/label: ct\("Review (&amp;|&) submit"\)/);
  });

  it("step 1 keeps the existing createApplicationAction server path (create draft)", () => {
    expect(NEW_PAGE).toContain("createApplicationAction");
    expect(NEW_PAGE).not.toContain("use client"); // stays server-rendered
  });

  it("draft stage derives the current step from real workflow state (applicants → docs → review)", () => {
    expect(DETAIL).toContain("const wizardCurrent = !applicants.length ? 2 : !gate.ok ? 3 : 4;");
    expect(DETAIL).toContain("{isDraft ? <WizardSteps steps={wizardSteps} current={wizardCurrent} /> : null}");
    // links point at the existing tabs — no duplicated screens
    expect(DETAIL).toContain("`${back}?tab=applicants`");
    expect(DETAIL).toContain("`${back}?tab=checklist`");
    expect(DETAIL).toContain("`${back}?tab=overview`");
    // submit button unchanged on review tab
    expect(DETAIL).toContain("submitApplicationAction");
  });

  it("step rail never renders on submitted applications (post-submission = processing view)", () => {
    // rail is wrapped in {isDraft ? ... : null} — submitted apps keep the classic tabs only
    expect(DETAIL).toContain("isDraft ? <WizardSteps");
  });

  it("the review screen still exposes fee snapshot, gate blockers and the affordance (unchanged validation)", () => {
    for (const k of ['ct("Fee")', 'ct("Total charge")', 'ct("Wallet balance now")', 'ct("Balance after charge")', "Submission is blocked until all required documents are uploaded", "insufficient funds"]) {
      expect(DETAIL, k).toContain(k);
    }
    expect(DETAIL).toContain("SubmitButton");
  });
});
