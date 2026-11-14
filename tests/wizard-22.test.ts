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
    expect(NEW_PAGE).toContain('ct("Visa & Traveller")');
    expect(NEW_PAGE).toContain('ct("Documents")');
    expect(NEW_PAGE).toContain('ct("Review & Submit")');
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
    expect(WIZARD).toContain("disabled={pending || catalogueRecovery || sessionRecovery}");
    expect(WIZARD).toContain("missingAmount");
  });
  it("renders a single nationality dropdown with Algeria preselected and all country options", () => {
    const nationalityControl = WIZARD.match(/<label className="label" htmlFor="t0_nationality">[\s\S]*?<\/select>/)?.[0];
    expect(nationalityControl).toBeDefined();
    expect(nationalityControl).toContain('name="t0_nationality"');
    expect(nationalityControl).toContain('data-testid="wizard-nationality"');
    expect(nationalityControl).toContain("defaultValue={props.defaultNationality}");
    expect(nationalityControl).toContain("props.nationalities.map");
    expect(nationalityControl).not.toContain("<input");
    expect(WIZARD).not.toContain("natSearch");
    expect(NEW_PAGE).toContain("defaultNationality={DEFAULT_NATIONALITY}");
    const nationalities = readFileSync(path.join(__dirname, "..", "src/lib/nationalities.ts"), "utf8");
    expect(nationalities).toContain('DEFAULT_NATIONALITY = "DZ"');
    expect(nationalities).toContain('code: "DZ", en: "Algeria"');
    expect(WIZARD).toContain('nationality: String(fields.get("t0_nationality") ?? "")');
  });
  it("keeps the page compact and opens the complete visa list only when the country field is focused", () => {
    expect(WIZARD).toContain("const availableDestinations = useMemo");
    expect(WIZARD).toContain("c.visaTypes.length > 0");
    expect(WIZARD).toContain("if (!q) return availableDestinations;");
    expect(WIZARD).toContain("return availableDestinations.filter");
    expect(WIZARD).toContain("useState(false)");
    expect(WIZARD).toContain("onFocus={() => setDestinationOpen(true)}");
    expect(WIZARD).toContain("onClick={() => setDestinationOpen(true)}");
    expect(WIZARD).toContain("aria-expanded={destinationOpen}");
    expect(WIZARD).toContain("{destinationOpen ? (");
    expect(WIZARD).toContain('data-testid="wizard-destination-popover"');
    expect(WIZARD).toContain('data-testid="wizard-all-destinations"');
    expect(WIZARD).toContain("absolute inset-x-0 top-full");
    expect(WIZARD).toContain("max-h-52 overflow-y-auto");
    expect(WIZARD).toContain("suggestions.map((c, index)");
    expect(WIZARD).toContain("closeOutside");
    expect(WIZARD).toContain('event.key === "Escape"');
    expect(WIZARD).toContain("setDestinationOpen(false);");
    expect(WIZARD).toContain('data-testid="wizard-popular-destinations"');
    expect(WIZARD).toContain('data-testid="wizard-popular-destination"');
    expect(WIZARD).toContain("popularDestinations.map((c)");
    expect(WIZARD).toContain("min-h-9 items-center px-4 py-2");
    expect(WIZARD).toContain("shadow-sm");
    expect(WIZARD).toContain('className="input pe-12"');
    expect(WIZARD).not.toContain("max-h-64 overflow-y-auto");
    expect(WIZARD).not.toContain("MAX_SUGGESTIONS");
    expect(WIZARD).not.toContain("searchFocused");
    expect(WIZARD).toContain("country.visaTypes.map((v)");
  });
});
