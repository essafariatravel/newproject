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

    let agencyId: string | null = null;
    if (isAgencyRole(data.role)) {
      agencyId = staff.agencyId; // agency admins can only create users in their own agency
      if (!agencyId) throw new AppError("FORBIDDEN", "No agency bound to your account.");
    } else {
      if (isAgencyAdmin) throw new AppError("FORBIDDEN", "You cannot create staff accounts.");
      agencyId = formData.get("agencyId") ? String(formData.get("agencyId")) : null;
      if (isAgencyRole(data.role) && !agencyId) {
        throw new AppError("VALIDATION", "Agency users must be assigned to an agency.");
      }
    }

    const dup = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = lower(${data.email})`).limit(1);
    if (dup[0]) throw new AppError("DUPLICATE", "A user with this email already exists.");

    const passwordHash = await hashPassword(data.password);
    const inserted = await db
      .insert(users)
      .values({ name: data.name, email: data.email, passwordHash, role: data.role, agencyId })
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
    if (target.id === staff.id && data.role !== target.role) {
      throw new AppError("VALIDATION", "You cannot change your own role.");
    }
    const patch: Record<string, unknown> = { name: data.name, role: data.role, updatedAt: new Date() };
    if (data.password) {
      if (data.password.length < 10) throw new AppError("VALIDATION", "Password must be at least 10 characters.");
      patch.passwordHash = await hashPassword(data.password);
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
    const amount = z.coerce.number().refine((v) => v !== 0, "Amount cannot be zero.").parse(formData.get("amount"));
    const reason = z.string().trim().min(5, "A reason (min 5 characters) is mandatory.").max(500).parse(formData.get("reason"));
    await adjustWallet({ agencyId, amount, reason, actor: staff });
    revalidatePath(back);
    revalidatePath("/admin/billing");
    return `Wallet ${amount > 0 ? "credited" : "debited"} by ${Math.abs(amount).toFixed(2)}.`;
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
