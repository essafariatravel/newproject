import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, users } from "@/db/schema";

type NotificationType =
  | "APPLICATION_SUBMITTED"
  | "STATUS_CHANGED"
  | "DOCUMENTS_REQUIRED"
  | "DOCUMENT_REJECTED"
  | "RESUBMISSION_REQUIRED"
  | "DOCUMENT_ACCEPTED"
  | "APPLICATION_COMPLETED"
  | "WALLET_ADJUSTED"
  | "APPLICATION_CREATED"
  | "APPLICATION_ASSIGNED"
  | "MESSAGE_POSTED"
  | "REGISTRATION_SUBMITTED"
  | "REGISTRATION_APPROVED"
  | "REGISTRATION_REJECTED"
  | "AGENCY_ONBOARDED";

/**
 * Insert a notification row per recipient user.
 * Notifications always originate from real server-side events.
 */
export async function notifyUsers(
  userIds: string[],
  payload: {
    type: NotificationType;
    title: string;
    body: string;
    link?: string | null;
    agencyId?: string | null;
    applicationId?: string | null;
  },
): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  await db.insert(notifications).values(
    unique.map((userId) => ({
      userId,
      agencyId: payload.agencyId ?? null,
      applicationId: payload.applicationId ?? null,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      link: payload.link ?? null,
    })),
  );
}

/** All active staff (ESSAFARIA internal) user ids, optionally limited to roles. */
export async function staffUserIds(roles?: string[]): Promise<string[]> {
  const conditions = [isNull(users.agencyId), eq(users.status, "ACTIVE")];
  if (roles && roles.length > 0) conditions.push(inArray(users.role, roles));
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(...conditions));
  return rows.map((r) => r.id);
}

/** All active user ids belonging to an agency (the tenant). */
export async function agencyUserIds(agencyId: string): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.agencyId, agencyId), eq(users.status, "ACTIVE")));
  return rows.map((r) => r.id);
}
