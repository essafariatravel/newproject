import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Phase 2 Final — 3-step request wizard: CHOOSE VISA → UPLOAD DOCS → PREVIEW & SUBMIT
 * One applicant (Full Name + Nationality Algeria default), DZD-only, no abandoned drafts.
 */
const NEW_PAGE = readFileSync(path.join(__dirname, "..", "src/app/portal/applications/new/page.tsx"), "utf8");
const DETAIL = readFileSync(path.join(__dirname, "..", "src/app/portal/applications/[id]/page.tsx"), "utf8");
const WIZARD = readFileSync(path.join(__dirname, "..", "src/app/portal/applications/new/request-wizard.tsx"), "utf8");

describe("Phase 2 Final — 3-step atomic request wizard + simplified dossier", () => {
  it("the new page is the 3-step atomic request wizard (DZD only, searchable countries)", () => {
    expect(NEW_PAGE).toContain("RequestWizard");
    // The three step labels must come from the content dictionary through ct():
    // they used to be pseudo-keys ("step.choose") that rendered literally.
    expect(NEW_PAGE).toContain('ct("Choose visa")');
    expect(NEW_PAGE).toContain('ct("Upload documents")');
    expect(NEW_PAGE).toContain('ct("Preview, confirm & submit")');
    expect(NEW_PAGE).not.toContain("use client");
    expect(NEW_PAGE).not.toContain("createApplicationAction");
  });

  it("wizard step 1: destination search (no country list), auto-select single visa, full name + nationality", () => {
    expect(WIZARD).toContain("countrySearch");
    expect(WIZARD).toContain('data-testid="wizard-destination-search"');
    // §13 — the giant visible country list is REMOVED: no accordion over all countries…
    expect(WIZARD).not.toContain("expandedCountries");
    // …suggestions only cover destinations that have a bookable programme.
    expect(WIZARD).toContain("c.visaTypes.length > 0");
    // …and a selection collapses into a compact summary with a Change action.
    expect(WIZARD).toContain('data-testid="wizard-destination-selected"');
    expect(WIZARD).toContain("visaTypes.length === 1");
    expect(WIZARD).toContain("t0_fullName");
    expect(WIZARD).toContain("t0_nationality");
    expect(WIZARD).toContain("DZD");
    expect(WIZARD).not.toContain("EUR");
    // §13 — priority is an internal staff concept: not in the agency submission flow.
    expect(WIZARD).not.toContain("priorityCode");
    // §13 — never render a nonsensical "0–0 days" estimate.
    expect(WIZARD).toContain("processingUnspecified");
  });

  it("portal detail: simplified tabs Overview/Documents/Messages/Activity, DZD, applicant summary, doc lock", () => {
    // New tabs
    expect(DETAIL).toContain("overview");
    expect(DETAIL).toContain("documents");
    expect(DETAIL).toContain("messages");
    expect(DETAIL).toContain("activity");
    // DZD only
    expect(DETAIL).toContain("DZD");
    expect(DETAIL).not.toContain("app.currency");
    // Applicant summary (fullName + nationality)
    expect(DETAIL).toContain("applicant");
    // Document lock messaging
    expect(DETAIL).toContain("Locked after submission");
    expect(DETAIL).toContain("Action required");
    // No legacy applicants tab as primary nav
    expect(DETAIL).not.toContain("Travellers");
  });

  it("review screen exposes DZD fee, wallet before/after, charge note, idempotent submit", () => {
    expect(WIZARD).toContain("walletBalance");
    expect(WIZARD).toContain("balanceAfter");
    expect(WIZARD).toContain("chargeNote");
    expect(WIZARD).toContain("idempotencyKey");
    expect(WIZARD).toContain("DZD");
    // §15 — the money action names the amount, and an unfunded wallet offers a top-up…
    expect(WIZARD).toContain("submitApplication");
    expect(WIZARD).toContain('data-testid="wizard-topup-cta"');
    // …while submission stays disabled and no negative balance is ever displayed.
    expect(WIZARD).toContain("insufficientTitle");
    expect(WIZARD).toContain("disabled={pending}");
    expect(WIZARD).toContain("missingAmount");
  });
});
