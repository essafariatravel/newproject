import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listStaffSubscriptions, revokeStaffSubscription, revokeAllStaffSubscriptions, isPushEligible, removeStaffSubscription, saveStaffSubscription } from "@/lib/push-service";
import { isValidSubscription, vapidPublicKey } from "@/lib/web-push-crypto";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { isStaffPushPreview } from "@/lib/push-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: noStore });

async function authorizedUser() {
  const user = await getSessionUser();
  return user && isPushEligible(user) ? user : null;
}
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  try { return !!origin && origin === new URL(request.url).origin; } catch { return false; }
}

export async function GET() {
  const user = await authorizedUser();
  if (!user) return reply({ error: "FORBIDDEN" }, 403);
  const publicKey = vapidPublicKey();
  try {
    const rows = await listStaffSubscriptions(user.id);
    return reply({
      configured: !!publicKey, publicKey, canSimulate: isStaffPushPreview(),
      devices: rows.length,
      registeredHashes: rows.map(row => row.endpointHash),
      deviceList: rows.map(row => ({ id: row.id, createdAt: row.createdAt.toISOString() })),
    });
  } catch {
    return reply({ error: "PUSH_STORAGE_UNAVAILABLE", configured: !!publicKey }, 503);
  }
}

export async function POST(request: Request) {
  const user = await authorizedUser();
  if (!user) return reply({ error: "FORBIDDEN" }, 403);
  if (!sameOrigin(request)) return reply({ error: "ORIGIN_REJECTED" }, 403);
  if (!vapidPublicKey()) return reply({ error: "PUSH_NOT_CONFIGURED" }, 503);
  if (!request.headers.get("content-type")?.startsWith("application/json") ||
      Number(request.headers.get("content-length") || 0) > 4096) return reply({ error: "INVALID_BODY" }, 400);
  try {
    const raw = await request.text();
    if (raw.length > 4096) return reply({ error: "INVALID_BODY" }, 400);
    const value: unknown = JSON.parse(raw);
    if (!isValidSubscription(value)) return reply({ error: "INVALID_SUBSCRIPTION" }, 400);
    if (!await consumeAuthRateLimit("push-register", user.id, 12, 3600_000)) {
      return reply({ error: "RATE_LIMITED" }, 429);
    }
    await saveStaffSubscription(user.id, value);
    return reply({ ok: true }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "PUSH_ENDPOINT_OWNED_BY_ANOTHER_USER") {
      return reply({ error: "DEVICE_ALREADY_REGISTERED" }, 409);
    }
    return reply({ error: "SUBSCRIPTION_FAILED" }, 503);
  }
}

export async function DELETE(request: Request) {
  const user = await authorizedUser();
  if (!user) return reply({ error: "FORBIDDEN" }, 403);
  if (!sameOrigin(request)) return reply({ error: "ORIGIN_REJECTED" }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 4096) return reply({ error: "INVALID_BODY" }, 400);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return reply({ error: "INVALID_BODY" }, 400);
    if ("all" in value && value.all === true) {
      await revokeAllStaffSubscriptions(user.id);
      return reply({ ok: true });
    }
    const deviceId = "deviceId" in value && typeof value.deviceId === "string" ? value.deviceId : "";
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(deviceId)) {
      await revokeStaffSubscription(user.id, deviceId);
      return reply({ ok: true });
    }
    const endpoint = "endpoint" in value && typeof value.endpoint === "string" ? value.endpoint : "";
    if (!endpoint || endpoint.length > 2048) return reply({ error: "INVALID_BODY" }, 400);
    await removeStaffSubscription(user.id, endpoint);
    return reply({ ok: true });
  } catch { return reply({ error: "REMOVE_FAILED" }, 503); }
}
