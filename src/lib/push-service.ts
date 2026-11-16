import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, pushSubscriptions, users } from "@/db/schema";
import { deliverWebPush, isValidSubscription, vapidPublicKey, type PushSubscriptionInfo } from "@/lib/web-push-crypto";
import { STAFF_PUSH_ROLES, safeStaffPushLink } from "@/lib/push-policy";
export { isPushEligible } from "@/lib/push-policy";

const MAX_DEVICES = 5;

export const endpointHash = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

/** Replaces only the same browser endpoint; never creates agency subscriptions. */
export async function saveStaffSubscription(userId: string, sub: PushSubscriptionInfo): Promise<void> {
  if (!isValidSubscription(sub) || !vapidPublicKey()) throw new Error("INVALID_PUSH_CONFIG");
  const hash = endpointHash(sub.endpoint);
  await db.insert(pushSubscriptions).values({
    userId, endpointHash: hash, endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh, auth: sub.keys.auth,
  }).onConflictDoUpdate({
    target: pushSubscriptions.endpointHash,
    set: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh,
      auth: sub.keys.auth, updatedAt: new Date() },
  });
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

export async function countStaffSubscriptions(userId: string): Promise<number> {
  const rows = await db.select({ id: pushSubscriptions.id })
    .from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  return rows.length;
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
  // Small bounded batches prevent a burst of cases from overwhelming push providers.
  for (let offset = 0; offset < deliveries.length; offset += 8) {
    await Promise.allSettled(deliveries.slice(offset, offset + 8).map(async ({sub, payload}) => {
      try {
        const status = await deliverWebPush({
          endpoint: sub.endpoint, keys: {p256dh: sub.p256dh, auth: sub.auth},
        }, payload);
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else if (status < 200 || status >= 300) {
          console.warn("[web-push] provider rejected a staff notification, status", status);
        }
      } catch {
        console.warn("[web-push] delivery failed; in-app notification remains available.");
      }
    }));
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
