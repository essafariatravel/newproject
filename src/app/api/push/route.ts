import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { countStaffSubscriptions, isPushEligible, removeStaffSubscription, saveStaffSubscription } from "@/lib/push-service";
import { isValidSubscription, vapidPublicKey } from "@/lib/web-push-crypto";

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
    const devices = await countStaffSubscriptions(user.id);
    return reply({ configured: !!publicKey, publicKey, devices });
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
    const value: unknown = await request.json();
    if (!isValidSubscription(value)) return reply({ error: "INVALID_SUBSCRIPTION" }, 400);
    await saveStaffSubscription(user.id, value);
    return reply({ ok: true }, 201);
  } catch {
    return reply({ error: "SUBSCRIPTION_FAILED" }, 503);
  }
}

export async function DELETE(request: Request) {
  const user = await authorizedUser();
  if (!user) return reply({ error: "FORBIDDEN" }, 403);
  if (!sameOrigin(request)) return reply({ error: "ORIGIN_REJECTED" }, 403);
  try {
    const value: unknown = await request.json();
    const endpoint = value && typeof value === "object" &&
      "endpoint" in value && typeof value.endpoint === "string" ? value.endpoint : "";
    if (!endpoint || endpoint.length > 2048) return reply({ error: "INVALID_BODY" }, 400);
    await removeStaffSubscription(user.id, endpoint);
    return reply({ ok: true });
  } catch { return reply({ error: "REMOVE_FAILED" }, 503); }
}
