"use server";

/**
 * White-label branding actions. Platform branding requires cms.manage
 * (SUPER_ADMIN/ADMIN). Agency logos require agencies.manage (staff) — or the
 * agency's own AGENCY_ADMIN from the portal.
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies } from "@/db/schema";
import { AppError } from "@/lib/types";
import { requireStaff, requireUser } from "@/lib/auth";

import { requirePermission, hasPermission } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { updateSetting } from "@/lib/settings";
import { runAction } from "@/lib/action-helpers";
import {
  readBranding,
  sanitizeHex,
  setBrandLogo,
  clearBrandLogo,
  setAgencyLogo,
  clearAgencyLogo,
  validateLogoUpload,
  type RadiusPreset,
  type FontPreset,
} from "@/lib/branding";

const RADIi: RadiusPreset[] = ["soft", "balanced", "crisp"];
const FONTS: FontPreset[] = ["aurora", "modern", "classic"];

function revalidateBrandSurfaces(): void {
  revalidatePath("/", "layout");
}

/** Save colors / radius / fonts / identity copy from the Brand Studio form. */
export async function saveBrandingAction(formData: FormData): Promise<void> {
  await runAction("/admin/settings", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "cms.manage");

    const entries: Array<[string, unknown]> = [];
    const name = String(formData.get("brand.name") ?? "").trim();
    if (name) entries.push(["brand.name", name.slice(0, 80)]);
    const tagline = String(formData.get("brand.tagline") ?? "").trim();
    if (tagline) entries.push(["brand.tagline", tagline.slice(0, 160)]);

    for (const key of ["brand.primary", "brand.accent", "brand.ink"] as const) {
      const raw = String(formData.get(key) ?? "");
      const hex = sanitizeHex(raw);
      if (!hex) throw new AppError("INVALID_COLOR", `${key.replace("brand.", "")} must be a hex color like #4a5bd0.`);
      entries.push([key, hex]);
    }
    const radius = String(formData.get("brand.radius") ?? "");
    if (radius) {
      if (!RADIi.includes(radius as RadiusPreset)) throw new AppError("INVALID_COLOR", "Unknown radius preset.");
      entries.push(["brand.radius", radius]);
    }
    const fonts = String(formData.get("brand.fonts") ?? "");
    if (fonts) {
      if (!FONTS.includes(fonts as FontPreset)) throw new AppError("INVALID_COLOR", "Unknown font preset.");
      entries.push(["brand.fonts", fonts]);
    }

    for (const [key, value] of entries) await updateSetting(key, value, staff.id);
    await recordAudit({
      actor: staff,
      action: "BRANDING_UPDATED",
      entity: "site_settings",
      metadata: { keys: entries.map(([k]) => k) },
    });
    revalidateBrandSurfaces();
    return "Branding saved — the whole platform is re-tinted.";
  });
}

async function logoFromFile(formData: FormData) {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    throw new AppError("INVALID_FILE", "Choose a logo image first.");
  }
  const data = Buffer.from(await file.arrayBuffer());
  validateLogoUpload(file.name, file.type, data.length);
  return { data, mimeType: file.type };
}

/** Upload the platform logo. */
export async function uploadBrandLogoAction(formData: FormData): Promise<void> {
  await runAction("/admin/settings", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "cms.manage");
    const upload = await logoFromFile(formData);
    await setBrandLogo(upload, staff);
    await recordAudit({ actor: staff, action: "BRANDING_LOGO_UPLOADED", entity: "site_settings" });
    revalidateBrandSurfaces();
    return "Platform logo updated.";
  });
}

/** Remove the platform logo (falls back to the built-in monogram). */
export async function removeBrandLogoAction(): Promise<void> {
  await runAction("/admin/settings", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "cms.manage");
    await clearBrandLogo(staff);
    await recordAudit({ actor: staff, action: "BRANDING_LOGO_REMOVED", entity: "site_settings" });
    revalidateBrandSurfaces();
    return "Platform logo removed — monogram restored.";
  });
}

function assertAgencyLogoPermission(staff: Awaited<ReturnType<typeof requireStaff>>, agencyId: string): Promise<void> {
  return (async () => {
    requirePermission(staff, "agencies.manage");
    const rows = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.id, agencyId)).limit(1);
    if (!rows[0]) throw new AppError("NOT_FOUND", "Agency not found.");
  })();
}

/** Staff: upload/replace an agency logo. */
export async function uploadAgencyLogoAction(formData: FormData): Promise<void> {
  const agencyId = String(formData.get("agencyId") ?? "");
  await runAction(`/admin/agencies/${agencyId}`, async () => {
    const staff = await requireStaff();
    await assertAgencyLogoPermission(staff, agencyId);
    const upload = await logoFromFile(formData);
    await setAgencyLogo(agencyId, upload);
    await recordAudit({ actor: staff, action: "AGENCY_LOGO_UPLOADED", entity: "agency", entityId: agencyId });
    revalidatePath(`/admin/agencies/${agencyId}`);
    revalidatePath("/portal", "layout");
    return "Agency logo updated.";
  });
}

/** Staff: remove an agency logo. */
export async function removeAgencyLogoAction(formData: FormData): Promise<void> {
  const agencyId = String(formData.get("agencyId") ?? "");
  await runAction(`/admin/agencies/${agencyId}`, async () => {
    const staff = await requireStaff();
    await assertAgencyLogoPermission(staff, agencyId);
    await clearAgencyLogo(agencyId);
    await recordAudit({ actor: staff, action: "AGENCY_LOGO_REMOVED", entity: "agency", entityId: agencyId });
    revalidatePath(`/admin/agencies/${agencyId}`);
    revalidatePath("/portal", "layout");
    return "Agency logo removed.";
  });
}

/** Agency admin: manage their OWN agency logo from the portal profile. */
export async function uploadOwnAgencyLogoAction(formData: FormData): Promise<void> {
  await runAction("/portal/profile", async () => {
    const user = await requireUser();
    if (user.role !== "AGENCY_ADMIN" || !user.agencyId) {
      throw new AppError("FORBIDDEN", "Only the agency administrator can change the agency logo.");
    }
    const upload = await logoFromFile(formData);
    await setAgencyLogo(user.agencyId, upload);
    await recordAudit({
      actor: user,
      action: "AGENCY_LOGO_UPLOADED",
      entity: "agency",
      entityId: user.agencyId,
      agencyId: user.agencyId,
    });
    revalidatePath("/portal/profile");
    revalidatePath("/portal", "layout");
    return "Agency logo updated.";
  });
}

/** Agency admin: remove their own agency logo. */
export async function removeOwnAgencyLogoAction(): Promise<void> {
  await runAction("/portal/profile", async () => {
    const user = await requireUser();
    if (user.role !== "AGENCY_ADMIN" || !user.agencyId) {
      throw new AppError("FORBIDDEN", "Only the agency administrator can change the agency logo.");
    }
    await clearAgencyLogo(user.agencyId);
    await recordAudit({
      actor: user,
      action: "AGENCY_LOGO_REMOVED",
      entity: "agency",
      entityId: user.agencyId,
      agencyId: user.agencyId,
    });
    revalidatePath("/portal/profile");
    revalidatePath("/portal", "layout");
    return "Agency logo removed.";
  });
}

/** Guard used by pages: can this staff member manage branding? */
export async function canManageBranding(): Promise<boolean> {
  const staff = await requireStaff().catch(() => null);
  return staff ? hasPermission(staff, "cms.manage") : false;
}

export async function currentBranding() {
  return readBranding();
}
