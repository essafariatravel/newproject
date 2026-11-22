import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, countries, statuses, vfsChinaBindings } from "@/db/schema";
import { AppError, type AuthUser, isStaffRole } from "@/lib/types";
import { currentOperationActor } from "@/lib/operation-identity";
import { assertAgencyOperational } from "@/lib/agency-identity";
import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/rbac";
import { VFS_CHINA_BINDING_REFERENCE } from "@/lib/vfs-china-certificate";

/**
 * Disabled until migration 0036 is applied to the intended schema and the
 * Staff-only page/permission are qualified on Preview.
 * This flag does NOT authorize any automatic approval or email ingestion.
 */
export function vfsChinaStaffBindingEnabled(): boolean {
  return process.env.VFS_CHINA_STAFF_BINDING_ENABLED === "true";
}

export async function readVfsChinaReference(applicationId: string, user: AuthUser): Promise<string | null> {
  if (!vfsChinaStaffBindingEnabled() || user.agencyId || !isStaffRole(user.role)) return null;
  requirePermission(user, "applications.review");
  const [binding] = await db.select({ reference: vfsChinaBindings.vfsReference })
    .from(vfsChinaBindings).where(eq(vfsChinaBindings.applicationId, applicationId)).limit(1);
  return binding?.reference ?? null;
}

/** Write-once Staff binding. Corrections require an audited reconciliation workflow. */
export async function saveVfsChinaReference(
  applicationId: string,
  rawReference: string,
  actor: AuthUser,
): Promise<"CREATED" | "UNCHANGED"> {
  if (!vfsChinaStaffBindingEnabled()) throw new AppError("NOT_ENABLED", "VFS reference binding is not enabled.");
  if (!isStaffRole(actor.role) || actor.agencyId || actor.mustChangePassword)
    throw new AppError("FORBIDDEN", "Only ESSAFARIA Staff may register a VFS reference.");
  requirePermission(actor, "applications.review");
  const reference = rawReference.trim().toUpperCase();
  if (!VFS_CHINA_BINDING_REFERENCE.test(reference))
    throw new AppError("VALIDATION", "Enter the VFS China certificate number (ALG...) or numeric application form number.");

  return db.transaction(async (tx) => {
    await currentOperationActor(tx, actor);
    // Lock only the dossier row. With a schema-qualified Drizzle pgTable,
    // .for("update", { of: applications }) generates FOR UPDATE OF
    // "visa_os_preview"."applications", which PostgreSQL rejects (42601).
    // A standalone SELECT FOR UPDATE emits valid SQL and avoids locking the
    // shared countries/statuses lookup rows.
    const [app] = await tx.select({
      id: applications.id, agencyId: applications.agencyId,
      reference: applications.reference,
    }).from(applications)
      .where(eq(applications.id, applicationId)).limit(1).for("update");
    if (!app) throw new AppError("NOT_FOUND", "Application not found.");

    const [details] = await tx.select({
      iso2: countries.iso2, terminal: statuses.isTerminal,
    }).from(applications)
      .innerJoin(countries, eq(applications.countryId, countries.id))
      .innerJoin(statuses, eq(applications.statusId, statuses.id))
      .where(eq(applications.id, applicationId)).limit(1);
    if (!details) throw new AppError("NOT_FOUND", "Application details not found.");

    await assertAgencyOperational(tx, app.agencyId, app.id);
    if (details.iso2 !== "CN" || details.terminal)
      throw new AppError("INVALID_STATE", "VFS references can only be added to open China dossiers.");

    const [old] = await tx.select({ reference: vfsChinaBindings.vfsReference })
      .from(vfsChinaBindings).where(eq(vfsChinaBindings.applicationId, applicationId)).limit(1);
    if (old?.reference === reference) return "UNCHANGED";
    if (old) throw new AppError("REFERENCE_LOCKED", "The existing VFS reference needs audited Staff correction.");

    // Unique constraint stops a VFS reference from being bound to another agency.
    const [inserted] = await tx.insert(vfsChinaBindings).values({
      applicationId, vfsReference: reference, savedBy: actor.id,
    }).onConflictDoNothing().returning({ applicationId: vfsChinaBindings.applicationId });
    if (!inserted) throw new AppError("DUPLICATE_VFS_REFERENCE", "This VFS reference is already registered.");

    await recordAudit({
      actor,
      action: "VFS_CHINA_REFERENCE_BOUND",
      entity: "application",
      entityId: applicationId,
      agencyId: app.agencyId,
      metadata: { applicationReference: app.reference, vfsReferenceSuffix: reference.slice(-5) },
    }, tx);
    return "CREATED";
  });
}
