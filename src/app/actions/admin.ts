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

const idSchema = z.string().uuid("Invalid identifier.");
const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

/* ------------------------------- agencies ------------------------------ */

const agencySchema = z.object({
  legalName: z.string().trim().min(2, "Legal name is required.").max(160),
  tradingName: z.string().trim().max(160).optional().nullable(),
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
    const dup = await db.select({ id: agencies.id }).from(agencies).where(sql`lower(${agencies.legalName}) = lower(${data.legalName})`).limit(1);
    if (dup[0]) throw new AppError("DUPLICATE", "An agency with this legal name already exists.");
    const inserted = await db
      .insert(agencies)
      .values({ ...data, currency: data.currency ?? "DZD", billingName: data.billingName ?? data.legalName, billingEmail: data.billingEmail ?? data.email })
      .returning();
    await recordAudit({ actor: staff, action: "AGENCY_CREATED", entity: "agency", entityId: inserted[0]!.id, metadata: { legalName: data.legalName } });
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
    await db.update(agencies).set({ ...data, updatedAt: new Date() }).where(eq(agencies.id, id));
    await recordAudit({ actor: staff, action: "AGENCY_UPDATED", entity: "agency", entityId: id });
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
    const rows = await db.select().from(agencies).where(eq(agencies.id, id)).limit(1);
    const agency = rows[0];
    if (!agency) throw new AppError("NOT_FOUND", "Agency not found.");
    const next = agency.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    await db.update(agencies).set({ status: next, updatedAt: new Date() }).where(eq(agencies.id, id));
    await recordAudit({ actor: staff, action: next === "ACTIVE" ? "AGENCY_ACTIVATED" : "AGENCY_SUSPENDED", entity: "agency", entityId: id });
    revalidatePath(`/admin/agencies/${id}`);
    revalidatePath("/admin/agencies");
    return `Agency ${next === "ACTIVE" ? "activated" : "suspended"}.`;
  });
}

/* ------------------------- Phase 2.2 §10 — agency + first admin ------------------------- */

const createAgencyWithAdminSchema = agencySchema.omit({ billingName: true, billingEmail: true, notes: true }).extend({
  adminName: z.string().trim().min(2, "Administrator name is required.").max(120),
  adminEmail: z.string().trim().toLowerCase().email("A valid administrator email is required."),
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
    const dupAgency = await db.select({ id: agencies.id }).from(agencies).where(sql`lower(${agencies.legalName}) = lower(${data.legalName})`).limit(1);
    if (dupAgency[0]) throw new AppError("DUPLICATE", "An agency with this legal name already exists.");
    const dupUser = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = lower(${data.adminEmail})`).limit(1);
    if (dupUser[0]) throw new AppError("DUPLICATE", "A user with this email already exists.");
    const passwordHash = await hashPassword(data.adminPassword); // hashed before any DB write
    const created = await db.transaction(async (tx) => {
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
            email: data.adminEmail,
            passwordHash,
            role: "AGENCY_ADMIN",
            agencyId: agency.id,
            mustChangePassword: true,
          })
          .returning()
      )[0]!;
      return { agency, admin };
    });
    await recordAudit({
      actor: staff,
      action: "AGENCY_ONBOARDED",
      entity: "agency",
      entityId: created.agency.id,
      agencyId: created.agency.id,
      metadata: {
        legalName: data.legalName,
        adminEmail: data.adminEmail, // email only — never the password
        firstAdminUserId: created.admin.id,
        mustChangePassword: true,
      },
    });
    revalidatePath("/admin/agencies");
    revalidatePath("/admin");
    return `Agency "${data.legalName}" created with administrator ${data.adminEmail} (password change required at first login).`;
  });
}

/* -------------------------------- users -------------------------------- */

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  email: emailSchema,
  password: z.string().min(10, "Password must be at least 10 characters.").max(200),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "VISA_AGENT", "ACCOUNTING", "AGENCY_ADMIN", "AGENCY_USER"]),
});

export async function createUserAction(formData: FormData): Promise<void> {
  const back = String(formData.get("back") ?? "/admin/users");
  await runAction(back, async () => {
    const staff = await requireUser();
    const isAgencyAdmin = staff.role === "AGENCY_ADMIN";
    if (isAgencyAdmin) {
      requirePermission(staff, "users.manage");
    } else {
      requireStaff();
      requirePermission(staff, "users.manage");
    }
    const data = createUserSchema.parse(Object.fromEntries(formData));
    // Phase 2.2 §9 — an AGENCY_ADMIN may ONLY create AGENCY_USER accounts
    if (isAgencyAdmin && data.role !== "AGENCY_USER") {
      throw new AppError("FORBIDDEN", "Agency administrators can only create AGENCY_USER accounts.");
    }

    // Prevent privilege escalation for staff role creation
    if (!isAgencyRole(data.role)) {
      // Staff role creation — only SUPER_ADMIN and ADMIN may create staff users
      if (isAgencyAdmin) throw new AppError("FORBIDDEN", "You cannot create staff accounts.");
      if (!["SUPER_ADMIN", "ADMIN"].includes(staff.role)) {
        throw new AppError("FORBIDDEN", "Only SUPER_ADMIN or ADMIN can create staff accounts.");
      }
      // Only SUPER_ADMIN can create SUPER_ADMIN
      if (data.role === "SUPER_ADMIN" && staff.role !== "SUPER_ADMIN") {
        throw new AppError("FORBIDDEN", "Only SUPER_ADMIN can create a SUPER_ADMIN account.");
      }
    }

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

    const dup = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = lower(${data.email})`).limit(1);
    if (dup[0]) throw new AppError("DUPLICATE", "A user with this email already exists.");

    const passwordHash = await hashPassword(data.password);
    const inserted = await db
      .insert(users)
      .values({ name: data.name, email: data.email, passwordHash, role: data.role, agencyId, mustChangePassword: true })
      .returning();
    await recordAudit({ actor: staff, action: "USER_CREATED", entity: "user", entityId: inserted[0]!.id, agencyId, metadata: { email: data.email, role: data.role } });
    revalidatePath(back);
    return `User ${data.email} created.`;
  });
}

export async function updateUserAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  const back = String(formData.get("back") ?? "/admin/users");
  await runAction(back, async () => {
    const staff = await requireUser();
    requirePermission(staff, "users.manage");
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const target = rows[0];
    if (!target) throw new AppError("NOT_FOUND", "User not found.");
    if (staff.role === "AGENCY_ADMIN" && target.agencyId !== staff.agencyId) {
      throw new AppError("NOT_FOUND", "User not found.");
    }
    if (staff.role === "AGENCY_ADMIN" && !isAgencyRole(target.role)) {
      throw new AppError("FORBIDDEN", "You cannot modify staff accounts.");
    }

    if (formData.get("toggleStatus")) {
      const next = target.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      if (target.id === staff.id) throw new AppError("VALIDATION", "You cannot suspend your own account.");
      await db.update(users).set({ status: next, updatedAt: new Date() }).where(eq(users.id, id));
      await recordAudit({ actor: staff, action: next === "ACTIVE" ? "USER_ACTIVATED" : "USER_SUSPENDED", entity: "user", entityId: id, agencyId: target.agencyId });
      revalidatePath(back);
      return `User ${next === "ACTIVE" ? "activated" : "suspended"}.`;
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
    if (staff.role === "AGENCY_ADMIN" && !isAgencyRole(data.role)) {
      throw new AppError("FORBIDDEN", "You cannot assign staff roles.");
    }
    if (staff.role === "AGENCY_ADMIN" && data.role !== "AGENCY_USER") {
      throw new AppError("FORBIDDEN", "Agency administrators can only hold the AGENCY_USER role assignable.");
    }
    if (target.id === staff.id && data.role !== target.role) {
      throw new AppError("VALIDATION", "You cannot change your own role.");
    }
    const patch: Record<string, unknown> = { name: data.name, role: data.role, updatedAt: new Date() };
    if (data.password) {
      if (data.password.length < 10) throw new AppError("VALIDATION", "Password must be at least 10 characters.");
      patch.passwordHash = await hashPassword(data.password);
      patch.mustChangePassword = true; // §11 — a staff-set reset also forces a change at next login
    }
    await db.update(users).set(patch).where(eq(users.id, id));
    await recordAudit({ actor: staff, action: "USER_UPDATED", entity: "user", entityId: id, agencyId: target.agencyId, metadata: { role: data.role, passwordReset: Boolean(data.password) } });
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
    await recordAudit({ actor: staff, action: "SETTINGS_UPDATED", entity: "site_settings", metadata: { keys: entries.map(([k]) => k) } });
    revalidatePath("/admin/settings");
    revalidatePath("/");
    return "Settings saved.";
  });
}
