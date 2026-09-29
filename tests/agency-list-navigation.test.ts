import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgencyListIdentity } from "@/components/agency-list-identity";
import {
  agencyPrimaryLabel,
  normalizeOptionalAgencyName,
} from "@/lib/agency-display";
import {
  AGENCY_ROW_INTERACTIVE_SELECTOR,
  shouldIgnoreAgencyRowNavigation,
} from "@/components/agency-table-row";
import { hasPermission } from "@/lib/rbac";
import type { AuthUser } from "@/lib/types";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("staff agency list identity", () => {
  it("renders a staff-created agency name and email when trading_name is the historical empty string", () => {
    const id = "6b5b60ed-4f6d-4b7e-8d1d-36f4e9b3ae7a";
    const markup = renderToStaticMarkup(
      React.createElement(AgencyListIdentity, {
        id,
        legalName: "MARHABA VOYAGES",
        tradingName: "",
        email: "marhaba@example.test",
      }),
    );
    expect(markup).toContain("MARHABA VOYAGES");
    expect(markup).toContain("marhaba@example.test");
    expect(markup).toContain(`href="/admin/agencies/${id}"`);
  });

  it("renders a registration-approved agency name and email when trading_name is null", () => {
    const id = "8574a0d0-d70e-430e-9bb7-27c548beb96f";
    const markup = renderToStaticMarkup(
      React.createElement(AgencyListIdentity, {
        id,
        legalName: "TEST AGENCY2",
        tradingName: null,
        email: "approved@example.test",
      }),
    );
    expect(markup).toContain("TEST AGENCY2");
    expect(markup).toContain("approved@example.test");
    expect(markup).toContain(`href="/admin/agencies/${id}"`);
  });

  it("keeps a legacy nameless row accessible with a stable ID-derived fallback", () => {
    const id = "12345678-1234-1234-1234-123456789abc";
    expect(agencyPrimaryLabel({ id, legalName: "  ", tradingName: "" })).toBe("Agency 12345678");
    const markup = renderToStaticMarkup(
      React.createElement(AgencyListIdentity, {
        id,
        legalName: "",
        tradingName: "",
        email: "legacy@example.test",
      }),
    );
    expect(markup).toContain("Agency 12345678");
    expect(markup).toContain(`href="/admin/agencies/${id}"`);
    expect(markup).toContain("legacy@example.test");
  });

  it("uses the agency ID for detail navigation, never the email address as record identity", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const email = "identity-must-not-be-email@example.test";
    const markup = renderToStaticMarkup(
      React.createElement(AgencyListIdentity, {
        id,
        legalName: "Canonical Agency",
        tradingName: null,
        email,
      }),
    );
    expect(markup).toContain(`href="/admin/agencies/${id}"`);
    expect(markup).not.toContain(`href="/admin/agencies/${email}`);
  });
});

describe("agency-name canonicalization", () => {
  it("normalizes empty staff trading names to null while preserving real names", () => {
    expect(normalizeOptionalAgencyName("")).toBeNull();
    expect(normalizeOptionalAgencyName("   ")).toBeNull();
    expect(normalizeOptionalAgencyName(null)).toBeNull();
    expect(normalizeOptionalAgencyName("  Marhaba  ")).toBe("Marhaba");
  });

  it("the staff create/update schema uses the canonical normalizer", () => {
    const actions = read("src/app/actions/admin.ts");
    expect(actions).toContain("tradingName: z.string().trim().max(160).optional().nullable().transform(normalizeOptionalAgencyName)");
  });
});

describe("agency row navigation", () => {
  it("keeps semantic name links and adds double-click navigation to the existing ID route", () => {
    const page = read("src/app/admin/agencies/page.tsx");
    const row = read("src/components/agency-table-row.tsx");
    expect(page).toContain('<AgencyTableRow key={agency.id} href={`/admin/agencies/${agency.id}`}');
    expect(page).toContain("<AgencyListIdentity");
    expect(row).toContain("onDoubleClick={handleDoubleClick}");
    expect(row).toContain("router.push(props.href)");
  });

  it("does not hijack interactive controls inside a row", () => {
    expect(AGENCY_ROW_INTERACTIVE_SELECTOR).toContain("a,button,input,select,textarea");
    expect(shouldIgnoreAgencyRowNavigation({ closest: () => ({ tag: "button" }) })).toBe(true);
    expect(shouldIgnoreAgencyRowNavigation({ closest: () => null })).toBe(false);
  });
});

describe("agency back-office tenancy/RBAC boundary", () => {
  it("does not grant agency tenants access to the staff agency directory", () => {
    const agencyAdmin = { role: "AGENCY_ADMIN" } as AuthUser;
    const agencyUser = { role: "AGENCY_USER" } as AuthUser;
    expect(hasPermission(agencyAdmin, "agencies.view")).toBe(false);
    expect(hasPermission(agencyUser, "agencies.view")).toBe(false);

    const listPage = read("src/app/admin/agencies/page.tsx");
    const detailPage = read("src/app/admin/agencies/[id]/page.tsx");
    expect(listPage).toContain('if (!hasPermission(user, "agencies.view"))');
    expect(detailPage).toContain('if (!hasPermission(staff, "agencies.view")) notFound();');
  });
});
