"use server";

/**
 * Administrative actions: agencies, users, wallet adjustments, site settings.
 */
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { agencies, users } from "@/db/schema";
import { requireStaff, requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { AppError, WALLET_MANAGE_ROLES, isAgencyRole } from "@/lib/types";
import { hashPassword } from "@/lib/crypto";
import { runAction } from "@/lib/action-helpers";
import { updateSetting } from "@/lib/settings";
import { adjustWallet } from "@/lib/wallet";
import { publishLegalContent } from "@/lib/legal";
import { normalizeOptionalAgencyName } from "@/lib/agency-display";
import { createAccount, currentAccountActor, lockIdentityState, recordIdentityAudit, toggleAgencyAccess, updateAccount } from "@/lib/account-security";
import { normalizeAgencyUsername } from "@/lib/identity-policy";

const idSchema = z.string().uuid("Invalid identifier.");
const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

/* ------------------------------- agencies ------------------------------ */

const agencySchema = z.object({
  legalName: z.string().trim().min(2, "Legal name is required.").max(160),
  tradingName: z.string().trim().max(160).optional().nullable().transform(normalizeOptionalAgencyName),
  email: emailSchema,
  phone: z.string().trim().max(40).optional().nullable(),
  addressLine: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  currency: z.string().trim().length(3).transform((v) => v.toUpperCase()).optional(),
  billingName: z.string().trim().max(160).optional().nullable(),
  billingEmail: z.string().trim().email().optional().or(z.literal("")).transform((v) => (v === "" ? null : v)).nullable(),
  billingTaxId: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function createAgencyAction(formData: FormData): Promise<void> {
  await runAction("/admin/agencies", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "agencies.manage");
    const data = agencySchema.parse(Object.fromEntries(formData));
    await db.transaction(async (tx) => {
      await lockIdentityState(tx);
      const current = await currentAccountActor(tx, staff);
      requirePermission(current, "agencies.manage");
      const dup = await tx.select({ id: agencies.id }).from(agencies).where(sql`lower(${agencies.legalName}) = lower(${data.legalName})`).limit(1);
      if (dup[0]) throw new AppError("DUPLICATE", "An agency with this legal name already exists.");
      const inserted = await tx.insert(agencies)
        .values({ ...data, currency: data.currency ?? "DZD", billingName: data.billingName ?? data.legalName, billingEmail: data.billingEmail ?? data.email }).returning();
      await recordIdentityAudit(tx, { actor: current, action: "AGENCY_CREATED", entity: "agency", entityId: inserted[0]!.id, metadata: { legalName: data.legalName } });
    });
    revalidatePath("/admin/agencies");
    revalidatePath("/admin");
    return `Agency "${data.legalName}" created. Create its first user next.`;
  });
}

export async function updateAgencyAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  await runAction(`/admin/agencies/${id}`, async () => {
    const staff = await requireStaff();
    requirePermission(staff, "agencies.manage");
    const data = agencySchema.parse(Object.fromEntries(formData));
    await db.transaction(async (tx) => {
      await lockIdentityState(tx);
      const current = await currentAccountActor(tx, staff);
      requirePermission(current, "agencies.manage");
      await tx.update(agencies).set({ ...data, updatedAt: new Date() }).where(eq(agencies.id, id));
      await tx.update(users).set({ email: data.email, updatedAt: new Date() }).where(eq(users.agencyId, id));
      await recordIdentityAudit(tx, { actor: current, action: "AGENCY_UPDATED", entity: "agency", entityId: id });
    });
    revalidatePath(`/admin/agencies/${id}`);
    revalidatePath("/admin/agencies");
    return "Agency saved.";
  });
}

export async function toggleAgencyStatusAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  await runAction(`/admin/agencies/${id}`, async () => {
    const staff = await requireStaff();
    requirePermission(staff, "agencies.manage");
    const next = await toggleAgencyAccess(staff, id);
    revalidatePath(`/admin/agencies/${id}`);
    revalidatePath("/admin/agencies");
    return `Agency ${next === "ACTIVE" ? "activated" : "suspended"}.`;
  });
}

/** Agency administrators may maintain operational contact details, never legal/billing identity. */
export async function updateOwnAgencyContactAction(formData: FormData): Promise<void> {
  await runAction("/portal/profile", async () => {
    const user = await requireUser();
    if (user.role !== "AGENCY_ADMIN" || !user.agencyId) throw new AppError("FORBIDDEN", "Only the agency administrator can update contact details.");
    const data = z.object({ phone: z.string().trim().max(40), addressLine: z.string().trim().max(300), city: z.string().trim().max(80) }).parse(Object.fromEntries(formData));
    await db.transaction(async (tx) => {
      await lockIdentityState(tx);
      const current = await currentAccountActor(tx, user);
      if (current.role !== "AGENCY_ADMIN" || !current.agencyId) throw new AppError("FORBIDDEN", "Only the agency administrator can update contact details.");
      await tx.update(agencies).set({ ...data, updatedAt: new Date() }).where(eq(agencies.id, current.agencyId));
      await recordIdentityAudit(tx, { actor: current, action: "AGENCY_CONTACT_UPDATED", entity: "agency", entityId: current.agencyId, agencyId: current.agencyId, metadata: data });
    });
    revalidatePath("/portal/profile");
    return "Agency saved.";
  });
}

/* ------------------------- Phase 2.2 §10 — agency + first admin ------------------------- */

const createAgencyWithAdminSchema = agencySchema.omit({ billingName: true, billingEmail: true, notes: true }).extend({
  adminName: z.string().trim().min(2, "Administrator name is required.").max(120),
  adminUsername: z.string().transform(normalizeAgencyUsername),
  adminPassword: z
    .string()
    .min(10, "Temporary password must be at least 10 characters.")
    .max(200),
});

/**
 * SUPER_ADMIN creates an agency AND its first AGENCY_ADMIN in one transaction.
 * Coexists with the public /agency/register flow. The temporary password is
 * hashed with the same scrypt KDF as logins, NEVER returned after hash time,
 * NEVER written to audit/log output, and forces a password change at first
 * login (§11). Auditing records only the admin email + agency id.
 */
export async function createAgencyWithAdminAction(formData: FormData): Promise<void> {
  await runAction("/admin/agencies", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "agencies.manage");
    requirePermission(staff, "users.manage");
    const data = createAgencyWithAdminSchema.parse(Object.fromEntries(formData));
    if (staff.role !== "SUPER_ADMIN") {
      // §10 — this one-shot onboarding flow is reserved for SUPER_ADMIN;
      // delegated roles keep the separate agency/user dashboards.
      throw new AppError("FORBIDDEN", "Only SUPER_ADMIN can onboard an agency with its first administrator.");
    }
    const passwordHash = await hashPassword(data.adminPassword); // hashed before any DB write
    await db.transaction(async (tx) => {
      await lockIdentityState(tx);
      const current = await currentAccountActor(tx, staff);
      if (current.role !== "SUPER_ADMIN") throw new AppError("FORBIDDEN", "Only SUPER_ADMIN can create an agency administrator.");
      const dupAgency = await tx.select({ id: agencies.id }).from(agencies).where(sql`lower(${agencies.legalName}) = lower(${data.legalName})`).limit(1);
      if (dupAgency[0]) throw new AppError("DUPLICATE", "An agency with this legal name already exists.");
      const dupUser = await tx.select({ id: users.id }).from(users).where(eq(users.username, data.adminUsername)).limit(1);
      if (dupUser[0]) throw new AppError("DUPLICATE", "This username is unavailable.");
      const agency = (
        await tx
          .insert(agencies)
          .values({
            ...data,
            currency: data.currency ?? "DZD",
            billingName: data.legalName,
            billingEmail: data.email,
          })
          .returning()
      )[0]!;
      const admin = (
        await tx
          .insert(users)
          .values({
            name: data.adminName,
            email: data.email,
            username: data.adminUsername,
            passwordHash,
            role: "AGENCY_ADMIN",
            agencyId: agency.id,
            mustChangePassword: true,
          })
          .returning()
      )[0]!;
      await recordIdentityAudit(tx, { actor: current, action: "AGENCY_ONBOARDED", entity: "agency", entityId: agency.id, agencyId: agency.id,
        metadata: { legalName: data.legalName, adminUsername: data.adminUsername, firstAdminUserId: admin.id, mustChangePassword: true } });
    });
    revalidatePath("/admin/agencies");
    revalidatePath("/admin");
    return `Agency "${data.legalName}" created with administrator ${data.adminUsername} (password change required at first login).`;
  });
}

/* -------------------------------- users -------------------------------- */

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  email: emailSchema.optional(),
  username: z.string().optional(),
  password: z.string().min(10, "Password must be at least 10 characters.").max(200),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "VISA_AGENT", "ACCOUNTING", "AGENCY_ADMIN", "AGENCY_USER"]),
});

export async function createUserAction(formData: FormData): Promise<void> {
  const back = String(formData.get("back") ?? "/admin/users");
  await runAction(back, async () => {
    const staff = await requireUser();
    const isAgencyAdmin = staff.role === "AGENCY_ADMIN";
    requirePermission(staff, "users.manage");
    const data = createUserSchema.parse(Object.fromEntries(formData));
    let agencyId: string | null = null;
    if (isAgencyRole(data.role)) {
      if (isAgencyAdmin) {
        // Agency admins create users only in their own agency
        agencyId = staff.agencyId;
        if (!agencyId) throw new AppError("FORBIDDEN", "No agency bound to your account.");
      } else {
        // Staff creating agency user — agencyId must come from form, not from staff.agencyId
        const rawAgencyId = formData.get("agencyId") ? String(formData.get("agencyId")).trim() : "";
        if (!rawAgencyId) {
          throw new AppError("VALIDATION", "Agency users must be assigned to an agency.");
        }
        // Validate UUID format
        try {
          idSchema.parse(rawAgencyId);
        } catch {
          throw new AppError("VALIDATION", "Invalid agency identifier.");
        }
        agencyId = rawAgencyId;
      }
    } else {
      // Staff role — no agency
      agencyId = null;
    }

    const inserted = await createAccount(staff, { ...data, agencyId });
    revalidatePath(back);
    return `User ${inserted.username ?? inserted.email} created.`;
  });
}

export async function updateUserAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  const back = String(formData.get("back") ?? "/admin/users");
  await runAction(back, async () => {
    const staff = await requireUser();
    requirePermission(staff, "users.manage");
    if (formData.get("toggleStatus")) {
      const { nextStatus: next } = await updateAccount(staff, id, { toggleStatus: true });
      revalidatePath(back);
      return `User ${next === "ACTIVE" ? "activated" : "suspended"}.`;
    }
    if (formData.get("forceSignOut")) {
      await updateAccount(staff, id, { forceSignOut: true });
      revalidatePath(back);
      return "All sessions were signed out.";
    }

    const data = z
      .object({
        name: z.string().trim().min(2).max(120),
        role: z.enum(["SUPER_ADMIN", "ADMIN", "VISA_AGENT", "ACCOUNTING", "AGENCY_ADMIN", "AGENCY_USER"]),
        password: z.string().max(200).optional().or(z.literal("")),
      })
      .parse({
        name: formData.get("name"),
        role: formData.get("role"),
        password: formData.get("password") ?? "",
      });
    if (data.password) {
      if (data.password.length < 10) throw new AppError("VALIDATION", "Password must be at least 10 characters.");
    }
    const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, id)).limit(1);
    if (target && target.role !== data.role && formData.get("confirmRoleChange") !== "1") {
      throw new AppError("VALIDATION", "Confirm the role change before saving.");
    }
    await updateAccount(staff, id, data);
    revalidatePath(back);
    return "User saved.";
  });
}

/* -------------------------- wallet management -------------------------- */

export async function adjustWalletAction(formData: FormData): Promise<void> {
  const agencyId = idSchema.parse(formData.get("agencyId"));
  const back = String(formData.get("back") ?? `/admin/agencies/${agencyId}`);
  await runAction(back, async () => {
    const staff = await requireStaff();
    if (!WALLET_MANAGE_ROLES.includes(staff.role)) {
      throw new AppError("FORBIDDEN", "Only SUPER_ADMIN, ADMIN or ACCOUNTING can adjust wallets.");
    }
    // DZD-only explicit operation model
    const operation = z.enum(["CREDIT", "DEBIT"]).parse(formData.get("operation") ?? formData.get("type") ?? "CREDIT");
    const amount = z.coerce.number().positive("Amount must be positive.").max(10000000).parse(formData.get("amount"));
    const reason = z.string().trim().min(5, "A reason (min 5 characters) is mandatory.").max(500).parse(formData.get("reason"));
    if (formData.get("confirmed") !== "yes") throw new AppError("VALIDATION", "Confirm the agency, amount and resulting balance before applying this adjustment.");
    await adjustWallet({ agencyId, amount, reason, actor: staff, operation });
    revalidatePath(back);
    revalidatePath("/admin/billing");
    return `Wallet ${operation === "CREDIT" ? "credited" : "debited"} by ${amount.toFixed(2)} DZD.`;
  });
}

/* ---------------------------- site settings ---------------------------- */

export async function updateSiteSettingsAction(formData: FormData): Promise<void> {
  await runAction("/admin/settings", async () => {
    const staff = await requireStaff();
    requirePermission(staff, "cms.manage");
    // §Settings — each section saves independently: only the keys the submitted
    // section actually carries are written, so saving the website copy cannot
    // overwrite legal text (and the legal section never touches the CMS fields).
    const section = String(formData.get("section") ?? "");
    if (section === "legal") {
      const publishedAt = new Date(String(formData.get("legal.publishedAt") ?? ""));
      if (!Number.isFinite(publishedAt.getTime()) || publishedAt.getTime() > Date.now()) throw new AppError("VALIDATION", "Supply the actual publication date of owner-approved legal text.");
      const publications = (["en","fr","ar"] as const).flatMap(locale => (["terms","privacy"] as const).map(kind => ({kind,locale,body:String(formData.get(`legal.${kind}.${locale}`)??"").trim(),publishedAt,actor:staff}))).filter(p => p.body);
      if (!publications.length) throw new AppError("VALIDATION", "Supply owner-approved legal content before publishing.");
      if (publications.some(p=>p.body.length>50_000)) throw new AppError("VALIDATION", "Legal content is too long.");
      for (const publication of publications) await publishLegalContent(publication);
      revalidatePath("/admin/settings"); revalidatePath("/terms"); revalidatePath("/privacy"); revalidatePath("/register");
      return "Legal versions published.";
    }
    const entries: Array<[string, unknown]> = [];
    const simpleKeys = [
      "brand.name",
      "brand.product",
      "brand.tagline",
      "brand.description",
      "site.contactEmail",
      "site.contactPhone",
      "site.address",
      "site.officeHours",
      "legal.privacy",
      "legal.terms",
    ];
    for (const key of simpleKeys) {
      const v = formData.get(key);
      if (v !== null) entries.push([key, String(v)]);
    }
    // Multilingual legal copy (EN/FR/AR) — every language stored under its own key.
    for (const key of [
      "legal.privacy.en",
      "legal.privacy.fr",
      "legal.privacy.ar",
      "legal.terms.en",
      "legal.terms.fr",
      "legal.terms.ar",
    ]) {
      const v = formData.get(key);
      if (v !== null) entries.push([key, String(v)]);
    }
    if (entries.length === 0) {
      throw new AppError("VALIDATION", "Nothing to save in this section.");
    }
    if (formData.get("site.social.linkedin") !== null || formData.get("site.social.instagram") !== null || formData.get("site.social.x") !== null) {
      entries.push([
        "site.social",
        {
          linkedin: String(formData.get("site.social.linkedin") ?? ""),
          instagram: String(formData.get("site.social.instagram") ?? ""),
          x: String(formData.get("site.social.x") ?? ""),
        },
      ]);
    }
    for (const [key, value] of entries) {
      await updateSetting(key, value, staff.id);
    }
    await recordAudit({
      actor: staff,
      action: "SETTINGS_UPDATED",
      entity: "site_settings",
      metadata: { section: section || "unspecified", keys: entries.map(([k]) => k) },
    });
    revalidatePath("/admin/settings");
    revalidatePath("/");
    revalidatePath("/privacy");
    revalidatePath("/terms");
    return section === "legal" ? "Legal content saved." : "Website content saved.";
  });
}
