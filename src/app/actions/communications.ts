"use server";

/**
 * Communication + notification actions.
 */
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { applications, communications, notifications, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { AppError, type AuthUser } from "@/lib/types";
import { agencyUserIds, notifyUsers, staffUserIds } from "@/lib/notifications";
import { runAction } from "@/lib/action-helpers";
import { recordAudit } from "@/lib/audit";

const idSchema = z.string().uuid("Invalid identifier.");

async function appContextFor(applicationId: string, user: AuthUser) {
  const rows = await db
    .select({ id: applications.id, agencyId: applications.agencyId, reference: applications.reference })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  const app = rows[0];
  if (!app) throw new AppError("NOT_FOUND", "Application not found.");
  if (user.agencyId && app.agencyId !== user.agencyId) {
    throw new AppError("NOT_FOUND", "Application not found.");
  }
  return app;
}

export async function postMessageAction(formData: FormData): Promise<void> {
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const back = String(formData.get("back") ?? "/portal/communications");
  await runAction(back, async () => {
    const user = await requireUser();
    const app = await appContextFor(applicationId, user);
    const data = z
      .object({
        body: z.string().trim().min(2, "Write a message first.").max(4000),
        visibility: z.enum(["AGENCY", "INTERNAL"]).optional(),
      })
      .parse({
        body: formData.get("body"),
        visibility: formData.get("visibility") || undefined,
      });

    let visibility: "AGENCY" | "INTERNAL";
    if (user.agencyId) {
      requirePermission(user, "communications.post.agency");
      visibility = "AGENCY"; // agencies always write agency-visible messages
    } else {
      requirePermission(user, "communications.post.staff");
      visibility = data.visibility === "INTERNAL" ? "INTERNAL" : "AGENCY";
    }

    await db.insert(communications).values({
      applicationId: app.id,
      authorId: user.id,
      visibility,
      body: data.body,
    });
    await recordAudit({
      actor: user,
      action: "MESSAGE_POSTED",
      entity: "communication",
      entityId: app.id,
      agencyId: app.agencyId,
      metadata: { visibility },
    });
    if (visibility === "AGENCY") {
      const recipients = user.agencyId
        ? (await staffUserIds()).concat()
        : await agencyUserIds(app.agencyId);
      await notifyUsers(recipients, {
        type: "MESSAGE_POSTED",
        title: `New message on ${app.reference}`,
        body: data.body.slice(0, 140),
        link: user.agencyId ? `/admin/applications/${app.id}` : `/portal/applications/${app.id}`,
        agencyId: app.agencyId,
        applicationId: app.id,
      });
    }
    revalidatePath(back);
    return "Message posted.";
  });
}

export async function markNotificationsReadAction(formData: FormData): Promise<void> {
  const back = String(formData.get("back") ?? "/portal/notifications");
  await runAction(back, async () => {
    const user = await requireUser();
    const notificationId = formData.get("id");
    if (notificationId && notificationId !== "") {
      const id = idSchema.parse(notificationId);
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, id), eq(notifications.userId, user.id), isNull(notifications.readAt)));
    } else {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    }
    revalidatePath(back);
    revalidatePath("/portal");
    revalidatePath("/admin");
    return "Notifications marked as read.";
  });
}

/** Resolve staff directory for assignment dropdowns. */
export async function staffDirectory() {
  const { requireStaff } = await import("@/lib/auth");
  const staff = await requireStaff();
  requirePermission(staff, "applications.assign");
  const { inArray } = await import("drizzle-orm");
  return db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(isNull(users.agencyId), eq(users.status, "ACTIVE"), inArray(users.role, ["SUPER_ADMIN", "ADMIN", "VISA_AGENT"])));
}
