import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, pushSubscriptions, users } from "@/db/schema";
import { deliverWebPush, isValidSubscription, vapidPublicKey, type PushSubscriptionInfo } from "@/lib/web-push-crypto";
import { STAFF_PUSH_ROLES, safeStaffPushLink } from "@/lib/push-policy";
import { isTransientPushFailure } from "@/lib/push-delivery-policy";
export { isPushEligible } from "@/lib/push-policy";

const MAX_DEVICES = 5;

export const endpointHash = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

/** Replaces only the same browser endpoint; never creates agency subscriptions. */
export async function saveStaffSubscription(userId: string, sub: PushSubscriptionInfo): Promise<void> {
  if (!isValidSubscription(sub) || !vapidPublicKey()) throw new Error("INVALID_PUSH_CONFIG");
  const hash = endpointHash(sub.endpoint);
  // A browser endpoint is owned by one staff identity. Do NOT allow a second
  // account to steal another user's push endpoint via a conflicting upsert.
  const saved = await db.insert(pushSubscriptions).values({
    userId, endpointHash: hash, endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh, auth: sub.keys.auth,
  }).onConflictDoUpdate({
    target: pushSubscriptions.endpointHash,
    set: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh,
      auth: sub.keys.auth, updatedAt: new Date() },
    setWhere: eq(pushSubscriptions.userId, userId),
  }).returning({ id: pushSubscriptions.id });
  if (!saved.length) throw new Error("PUSH_ENDPOINT_OWNED_BY_ANOTHER_USER");
  const devices = await db.select({ id: pushSubscriptions.id })
    .from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.updatedAt), desc(pushSubscriptions.createdAt));
  const obsolete = devices.slice(MAX_DEVICES).map(x => x.id);
  if (obsolete.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, obsolete));
}

export async function removeStaffSubscription(userId: string, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(and(
    eq(pushSubscriptions.userId, userId),
    eq(pushSubscriptions.endpointHash, endpointHash(endpoint)),
  ));
}

export async function listStaffSubscriptions(userId: string) {
  const rows = await db.select({
    id: pushSubscriptions.id, endpointHash: pushSubscriptions.endpointHash,
    createdAt: pushSubscriptions.createdAt,
  }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.createdAt));
  return rows;
}

export async function revokeStaffSubscription(userId: string, deviceId: string): Promise<void> {
  await db.delete(pushSubscriptions).where(and(
    eq(pushSubscriptions.userId, userId),
    eq(pushSubscriptions.id, deviceId),
  ));
}

export async function revokeAllStaffSubscriptions(userId: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

/** Application event dispatcher runs after the response so submissions stay fast. */
export async function dispatchStaffPush(notificationIds: string[]): Promise<void> {
  if (!vapidPublicKey() || !notificationIds.length) return;
  const events = await db.select({
    id: notifications.id, userId: notifications.userId, type: notifications.type,
    link: notifications.link,
  }).from(notifications)
    .innerJoin(users, eq(notifications.userId, users.id))
    .where(and(
      inArray(notifications.id, notificationIds),
      isNull(users.agencyId),
      eq(users.status, "ACTIVE"),
      inArray(users.role, [...STAFF_PUSH_ROLES]),
    ));
  if (!events.length) return;
  const subs = await db.select().from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, [...new Set(events.map(e => e.userId))]));
  const byUser = new Map<string, typeof subs>();
  for (const sub of subs) byUser.set(sub.userId, [...(byUser.get(sub.userId) ?? []), sub]);
  const deliveries = events.flatMap(event =>
    (byUser.get(event.userId) ?? []).map(sub => ({
      sub, payload: { kind: event.type, url: safeStaffPushLink(event.link) },
    })));
  // Bounded concurrency and one retry for transient provider failures.
  // No personal data, endpoints, encryption keys or notification content in logs.
  let accepted = 0, expired = 0, rejected = 0;
  for (let offset = 0; offset < deliveries.length; offset += 8) {
    await Promise.allSettled(deliveries.slice(offset, offset + 8).map(async ({sub, payload}) => {
      let status: number | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          status = await deliverWebPush({
            endpoint: sub.endpoint, keys: {p256dh: sub.p256dh, auth: sub.auth},
          }, payload);
        } catch { status = null; }
        if (attempt === 0 && isTransientPushFailure(status)) {
          await new Promise(resolve => setTimeout(resolve, 350));
          continue;
        }
        break;
      }
      if (status === 404 || status === 410) {
        expired++;
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      } else if (status !== null && status >= 200 && status < 300) {
        accepted++;
      } else {
        rejected++;
      }
    }));
  }
  if (rejected > 0) {
    console.warn("[web-push] batch delivery incomplete", { attempted: deliveries.length, accepted, expired, rejected });
  }
}

export async function sendStaffTestPush(userId: string): Promise<number> {
  if (!vapidPublicKey()) throw new Error("WEB_PUSH_NOT_CONFIGURED");
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let delivered = 0;
  for (const sub of subs) {
    try {
      const status = await deliverWebPush({
        endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, { kind: "TEST", url: "/admin/notifications" });
      if (status >= 200 && status < 300) delivered++;
      if (status === 404 || status === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    } catch { /* No private endpoints or keys in logs */ }
  }
  return delivered;
}
