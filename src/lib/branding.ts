/**
 * White-label branding.
 *
 * Everything visual on the platform is editable by the super admin from
 * /admin/settings and stored in site_settings:
 *   brand.name, brand.tagline          — identity copy (already existed)
 *   brand.primary / accent / ink       — hex colors driving the whole palette
 *   brand.radius                       — soft | balanced | crisp
 *   brand.fonts                        — aurora | modern | classic
 *   brand.logoKey / brand.logoMime / brand.logoVersion
 *                                      — platform logo (storage provider)
 *
 * Color editing works at the CSS-variable layer: Tailwind v4 emits every
 * @theme token as a custom property and utilities reference them, so a
 * `:root { --color-iris-600: … }` override re-tints the entire UI — buttons,
 * badges, gradients, charts — with no rebuild. Tints/shades are derived with
 * color-mix(), which every evergreen browser supports.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, siteSettings } from "@/db/schema";
import { AppError } from "@/lib/types";
import type { AuthUser } from "@/lib/types";
import { storageProvider } from "@/lib/storage";
import { getSiteSettings, updateSetting } from "@/lib/settings";

export const BRAND_LOGO_KEY = "branding/logo";
export const AGENCY_LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type RadiusPreset = "soft" | "balanced" | "crisp";
export type FontPreset = "aurora" | "modern" | "classic";

export interface Branding {
  name: string;
  tagline: string;
  primary: string;
  accent: string;
  ink: string;
  radius: RadiusPreset;
  fonts: FontPreset;
  logoKey: string | null;
  logoMime: string | null;
  logoVersion: string;
  legacyIdentity?: boolean;
}

export const BRANDING_DEFAULTS: Branding = {
  name: "ESSAFARIA VISA",
  tagline: "Professional B2B visa processing",
  primary: "#102a45",
  accent: "#c99a32",
  ink: "#071a33",
  radius: "balanced",
  fonts: "modern",
  logoKey: null,
  logoMime: null,
  logoVersion: "",
};

/** Valid hex colors: #rgb, #rgba, #rrggbb, #rrggbbaa. Returns normalized lowercase or null. */
export function sanitizeHex(input: string): string | null {
  const v = input.trim().toLowerCase();
  return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v) ? v : null;
}

function clampHex(input: string, fallback: string): string {
  return sanitizeHex(input) ?? fallback;
}

const RADIUS_PRESETS: RadiusPreset[] = ["soft", "balanced", "crisp"];
const FONT_PRESETS: FontPreset[] = ["aurora", "modern", "classic"];

function s(map: Record<string, unknown>, key: string): string {
  const v = map[key];
  return typeof v === "string" ? v : "";
}

/** Resolve the effective branding from site settings, with safe fallbacks. */
export async function readBranding(): Promise<Branding> {
  const map = (await getSiteSettings()) as Record<string, unknown>;
  const legacyIdentity = s(map, "brand.name") === "ESSAFARIA TRAVEL";
  const radius = RADIUS_PRESETS.includes(s(map, "brand.radius") as RadiusPreset)
    ? (s(map, "brand.radius") as RadiusPreset)
    : BRANDING_DEFAULTS.radius;
  const fonts = FONT_PRESETS.includes(s(map, "brand.fonts") as FontPreset)
    ? (s(map, "brand.fonts") as FontPreset)
    : BRANDING_DEFAULTS.fonts;
  return {
    name: legacyIdentity ? BRANDING_DEFAULTS.name : s(map, "brand.name") || BRANDING_DEFAULTS.name,
    tagline: s(map, "brand.tagline") || BRANDING_DEFAULTS.tagline,
    primary: s(map, "brand.primary").toLowerCase() === "#4a5bd0" ? BRANDING_DEFAULTS.primary : clampHex(s(map, "brand.primary"), BRANDING_DEFAULTS.primary),
    accent: s(map, "brand.accent").toLowerCase() === "#b2945e" ? BRANDING_DEFAULTS.accent : clampHex(s(map, "brand.accent"), BRANDING_DEFAULTS.accent),
    ink: s(map, "brand.ink").toLowerCase() === "#1d2547" ? BRANDING_DEFAULTS.ink : clampHex(s(map, "brand.ink"), BRANDING_DEFAULTS.ink),
    radius,
    fonts,
    logoKey: s(map, "brand.logoKey") || null,
    logoMime: s(map, "brand.logoMime") || null,
    logoVersion: s(map, "brand.logoVersion"),
    legacyIdentity,
  };
}

function tint(color: string, percent: number): string {
  // percent > 0 → mix toward white; percent < 0 → mix toward black
  const target = percent >= 0 ? "white" : "black";
  const baseWeight = Math.max(0, Math.min(100, 100 - Math.abs(percent)));
  return `color-mix(in srgb, ${color} ${baseWeight}%, ${target})`;
}

/**
 * CSS custom-property overrides injected into <head> by the root layout.
 * Covers the full iris (primary), gold (accent) and navy (ink) scales plus
 * the radius and font presets — every utility in the app picks these up.
 */
export function brandingCssOverride(b: Branding): string {
  const radiusCard =
    b.radius === "crisp" ? "0.55rem" : b.radius === "balanced" ? "0.9rem" : "1rem";
  const radiusBtn = b.radius === "crisp" ? "0.55rem" : b.radius === "balanced" ? "0.75rem" : "1rem";
  const fontStacks: Record<FontPreset, [string, string]> = {
    aurora: [
      `"Manrope", "Nunito Sans", ui-rounded, "SF Pro Rounded", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
      `"Fraunces", "Playfair Display", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif`,
    ],
    modern: [
      `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
      `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
    ],
    classic: [
      `Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif`,
      `Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif`,
    ],
  };
  const [sans, serif] = fontStacks[b.fonts];
  return `
:root {
  --color-iris-700: ${tint(b.primary, -14)};
  --color-iris-600: ${b.primary};
  --color-iris-500: ${tint(b.primary, 8)};
  --color-iris-400: ${tint(b.primary, 28)};
  --color-iris-200: ${tint(b.primary, 68)};
  --color-iris-100: ${tint(b.primary, 82)};
  --color-iris-50: ${tint(b.primary, 92)};
  --color-gold-700: ${tint(b.accent, -22)};
  --color-gold-600: ${tint(b.accent, -10)};
  --color-gold-500: ${b.accent};
  --color-gold-400: ${tint(b.accent, 16)};
  --color-gold-100: ${tint(b.accent, 76)};
  --color-gold-50: ${tint(b.accent, 88)};
  --color-navy-950: ${tint(b.ink, -12)};
  --color-navy-900: ${b.ink};
  --color-navy-800: ${tint(b.ink, 10)};
  --color-navy-700: ${tint(b.ink, 22)};
  --color-navy-600: ${tint(b.ink, 34)};
  --color-navy-500: ${tint(b.ink, 46)};
  --color-navy-100: ${tint(b.ink, 90)};
  --color-navy-50: ${tint(b.ink, 95)};
  --radius-card: ${radiusCard};
  --radius-btn: ${radiusBtn};
  --radius-input: ${b.radius === "crisp" ? "0.5rem" : b.radius === "balanced" ? "0.75rem" : "0.75rem"};
  --font-sans: ${sans};
  --font-serif: ${serif};
}
`.trim();
}

/* ------------------------------- logo storage ----------------------------- */

export interface LogoUpload {
  data: Buffer;
  mimeType: string;
}

export function validateLogoUpload(name: string, mimeType: string, size: number): void {
  if (!LOGO_MIME_TYPES.includes(mimeType as (typeof LOGO_MIME_TYPES)[number])) {
    throw new AppError("INVALID_FILE", "Logo must be a PNG, JPEG or WebP image.");
  }
  if (size <= 0 || size > AGENCY_LOGO_MAX_BYTES) {
    throw new AppError("INVALID_FILE", "Logo must be between 1 byte and 2 MB.");
  }
  if (name.length > 200) {
    throw new AppError("INVALID_FILE", "File name is too long.");
  }
}

async function putLogo(key: string, upload: LogoUpload): Promise<void> {
  const storage = storageProvider();
  await storage.delete(key).catch(() => {});
  await storage.put(key, upload.data, upload.mimeType);
}

/** Store the platform logo and record it in settings. */
export async function setBrandLogo(upload: LogoUpload, actor: AuthUser): Promise<void> {
  await putLogo(BRAND_LOGO_KEY, upload);
  await updateSetting("brand.logoKey", BRAND_LOGO_KEY, actor.id);
  await updateSetting("brand.logoMime", upload.mimeType, actor.id);
  await updateSetting("brand.logoVersion", String(Date.now()), actor.id);
}

/** Remove the platform logo (falls back to the built-in monogram). */
export async function clearBrandLogo(actor: AuthUser): Promise<void> {
  const b = await readBranding();
  if (b.logoKey) await storageProvider().delete(b.logoKey).catch(() => {});
  for (const key of ["brand.logoKey", "brand.logoMime", "brand.logoVersion"]) {
    await db.delete(siteSettings).where(eq(siteSettings.key, key));
  }
  void actor;
}

const agencyLogoKey = (agencyId: string) => `agency-logos/${agencyId}/logo`;

/** Store (or replace) an agency's logo. Caller has verified permissions. */
export async function setAgencyLogo(agencyId: string, upload: LogoUpload): Promise<void> {
  const rows = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.id, agencyId)).limit(1);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Agency not found.");
  const key = agencyLogoKey(agencyId);
  await putLogo(key, upload);
  await db
    .update(agencies)
    .set({ logoKey: key, logoMime: upload.mimeType, logoUploadedAt: sql`now()` })
    .where(eq(agencies.id, agencyId));
}

/** Remove an agency's logo. No-op when the agency has none. */
export async function clearAgencyLogo(agencyId: string): Promise<void> {
  const rows = await db
    .select({ logoKey: agencies.logoKey })
    .from(agencies)
    .where(eq(agencies.id, agencyId))
    .limit(1);
  const logoKey = rows[0]?.logoKey ?? null;
  await db
    .update(agencies)
    .set({ logoKey: null, logoMime: null, logoUploadedAt: null })
    .where(eq(agencies.id, agencyId));
  if (logoKey) await storageProvider().delete(logoKey).catch(() => {});
}

/** Public cache-busting URL for an agency logo (null when none). */
export function agencyLogoUrl(agency: {
  id: string;
  logoKey: string | null;
  logoUploadedAt: Date | string | null;
}): string | null {
  if (!agency.logoKey) return null;
  const v = agency.logoUploadedAt ? new Date(agency.logoUploadedAt).getTime() : 0;
  return `/api/agencies/${agency.id}/logo?v=${v}`;
}

/** Public cache-busting URL for the platform logo (null → use built-in monogram). */
export function brandLogoUrl(b: Branding): string | null {
  // The stored travel-company artwork belongs to the previous identity. Keep
  // its file and settings intact while presenting the VISA OS mark in this UI.
  return b.logoKey && !b.legacyIdentity ? `/api/branding/logo?v=${encodeURIComponent(b.logoVersion)}` : null;
}
