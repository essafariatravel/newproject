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
    expect(NEW_PAGE).toContain("step.choose");
    expect(NEW_PAGE).toContain("step.upload");
    expect(NEW_PAGE).toContain("step.preview");
    expect(NEW_PAGE).not.toContain("use client");
    expect(NEW_PAGE).not.toContain("createApplicationAction");
  });

  it("wizard step 1: searchable countries, collapsible, auto-select single visa, full name + nationality", () => {
    expect(WIZARD).toContain("countrySearch");
    expect(WIZARD).toContain("expandedCountries");
    expect(WIZARD).toContain("visaTypes.length === 1");
    expect(WIZARD).toContain("t0_fullName");
    expect(WIZARD).toContain("t0_nationality");
    expect(WIZARD).toContain("DZD");
    expect(WIZARD).not.toContain("EUR");
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
    expect(WIZARD).toContain("Balance after");
    expect(WIZARD).toContain("chargeNote");
    expect(WIZARD).toContain("idempotencyKey");
    expect(WIZARD).toContain("DZD");
  });
});
