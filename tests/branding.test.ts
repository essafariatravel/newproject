import { describe, expect, it } from "vitest";
import { suiteSetup } from "./helpers/global-state";

suiteSetup();

import { db } from "@/lib/db";
import { agencies, documentBlobs, siteSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { userByEmail, agencyByEmail } from "./helpers/fixtures";
import { AppError } from "@/lib/types";
import {
  sanitizeHex,
  readBranding,
  brandingCssOverride,
  setBrandLogo,
  clearBrandLogo,
  setAgencyLogo,
  clearAgencyLogo,
  validateLogoUpload,
  agencyLogoUrl,
  BRANDING_DEFAULTS,
} from "@/lib/branding";
import { updateSetting } from "@/lib/settings";
import { storageProvider } from "@/lib/storage";

describe("white-label branding", () => {
  it("sanitizes hex colors strictly", () => {
    expect(sanitizeHex("#4A5BD0")).toBe("#4a5bd0");
    expect(sanitizeHex("#abc")).toBe("#abc");
    expect(sanitizeHex("4a5bd0")).toBeNull();
    expect(sanitizeHex("#4a5bd0; drop table x")).toBeNull();
    expect(sanitizeHex("")).toBeNull();
  });

  it("falls back to defaults when nothing is configured", async () => {
    const b = await readBranding();
    expect(b.primary).toBe(BRANDING_DEFAULTS.primary);
    expect(b.radius).toBe("soft");
    expect(b.logoKey).toBeNull();
  });

  it("derives full color scales via color-mix in the CSS override", async () => {
    await updateSetting("brand.primary", "#123456", null);
    const b = await readBranding();
    const css = brandingCssOverride(b);
    expect(css).toContain("--color-iris-600: #123456");
    expect(css).toContain("color-mix(in srgb, #123456");
    expect(css).not.toContain("undefined");
    // radius + font presets appear
    await updateSetting("brand.radius", "crisp", null);
    expect(brandingCssOverride(await readBranding())).toContain("--radius-card: 0.55rem");
    // cleanup so later assertions start from defaults
    await db.delete(siteSettings);
  });

  it("validates logo uploads (mime + size)", () => {
    expect(() => validateLogoUpload("logo.png", "image/png", 1000)).not.toThrow();
    expect(() => validateLogoUpload("evil.svg", "image/svg+xml", 10)).toThrow(AppError);
    expect(() => validateLogoUpload("big.png", "image/png", 3 * 1024 * 1024)).toThrow(AppError);
  });

  it("stores, resolves and clears an agency logo with cache-busting url", async () => {
    const agency = await agencyByEmail("ops@agencya.example");
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

    await setAgencyLogo(agency.id, { data: png, mimeType: "image/png" });

    const rows = await db.select().from(agencies).where(eq(agencies.id, agency.id)).limit(1);
    const row = rows[0]!;
    expect(row.logoKey).toBe(`agency-logos/${agency.id}/logo`);
    expect(row.logoMime).toBe("image/png");

    const stored = await storageProvider().get(row.logoKey!);
    expect(stored.data.equals(png)).toBe(true);

    const url = agencyLogoUrl(row);
    expect(url).toBe(`/api/agencies/${agency.id}/logo?v=${new Date(row.logoUploadedAt!).getTime()}`);

    await clearAgencyLogo(agency.id);
    const after = (await db.select().from(agencies).where(eq(agencies.id, agency.id)).limit(1))[0]!;
    expect(after.logoKey).toBeNull();
    const blobs = await db.select().from(documentBlobs).where(eq(documentBlobs.key, `agency-logos/${agency.id}/logo`));
    expect(blobs.length).toBe(0);
    // restore pristine row state (agency had no logo before this suite)
  });

  it("stores and clears the platform logo in settings", async () => {
    const staff = await userByEmail("superadmin@test.example");
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    await setBrandLogo({ data: png, mimeType: "image/png" }, staff);
    let b = await readBranding();
    expect(b.logoKey).toBe("branding/logo");
    expect(storageProvider()).toBeDefined();
    await clearBrandLogo(staff);
    b = await readBranding();
    expect(b.logoKey).toBeNull();
  });
});
