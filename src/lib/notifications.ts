import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, users } from "@/db/schema";
import { logErrorOnce } from "@/lib/observability";

export type NotificationType =
  | "APPLICATION_SUBMITTED"
  | "STATUS_CHANGED"
  | "DOCUMENTS_REQUIRED"
  | "DOCUMENT_REQUESTED"
  | "DOCUMENT_REJECTED"
  | "RESUBMISSION_REQUIRED"
  | "DOCUMENT_ACCEPTED"
  | "APPLICATION_COMPLETED"
  | "APPLICATION_DECISION"
  | "WALLET_ADJUSTED"
  | "APPLICATION_CREATED"
  | "APPLICATION_ASSIGNED"
  | "MESSAGE_POSTED"
  | "REGISTRATION_SUBMITTED"
  | "REGISTRATION_APPROVED"
  | "REGISTRATION_REJECTED"
  | "AGENCY_ONBOARDED"
  | "TOPUP_REQUESTED"
  | "WALLET_TOPUP_DECIDED"
  | "DOCUMENT_REQUEST_FULFILLED";

/**
 * Insert a notification row per recipient user.
 * Notifications always originate from real server-side events.
 */
export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  agencyId?: string | null;
  applicationId?: string | null;
}

export async function notifyUsers(
  userIds: string[],
  payload: NotificationPayload,
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

/**
 * Post-commit notification delivery that must never turn a completed business
 * operation into a user-visible failure. Recipient lookup and insert failures
 * are logged without title/body/recipient identifiers.
 */
export async function notifyUsersBestEffort(
  userIds: string[] | Promise<string[]>,
  payload: NotificationPayload,
  context: {
    actorRole?: string | null;
    tenantRef?: string | null;
    resourceType?: string | null;
    resourceRef?: string | null;
  } = {},
): Promise<void> {
  try {
    await notifyUsers(await Promise.resolve(userIds), payload);
  } catch (error) {
    logErrorOnce("notification.delivery.failed", error, {
      severity: "warning",
      classification: "BUSINESS_FAILURE",
      result: "technical_failed",
      actorRole: context.actorRole ?? null,
      tenantRef: context.tenantRef ?? null,
      resourceType: context.resourceType ?? null,
      resourceRef: context.resourceRef ?? null,
      metadata: { notification_type: payload.type },
    });
  }
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
