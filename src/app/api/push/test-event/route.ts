import { after } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { isPushEligible, dispatchStaffPush, listStaffSubscriptions } from "@/lib/push-service";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { isStaffPushPreview } from "@/lib/push-preview";
import { vapidPublicKey } from "@/lib/web-push-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Manually triggered sandbox simulation. Deliberately impossible in Production. */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isStaffPushPreview()) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
  const user = await getSessionUser();
  if (!user || !isPushEligible(user)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "ORIGIN_REJECTED" }, { status: 403, headers });
  }
  if (!vapidPublicKey()) return NextResponse.json({ error: "PUSH_NOT_CONFIGURED" }, { status: 503, headers });
  try {
    if (!await consumeAuthRateLimit("push-simulated-event", user.id, 2, 3600_000)) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers });
    }
    if (!(await listStaffSubscriptions(user.id)).length) {
      return NextResponse.json({ error: "NO_SUBSCRIPTIONS" }, { status: 409, headers });
    }
    // The event is visibly marked as simulation and has no application/agency ID.
    const [row] = await db.insert(notifications).values({
      userId: user.id,
      type: "PREVIEW_APPLICATION_SUBMITTED",
      title: "[TEST PREVIEW] Simulation de nouveau dossier",
      body: "Événement fictif de qualification Web Push : aucun dossier réel n'a été créé.",
      link: "/admin/notifications",
    }).returning({ id: notifications.id });
    if (!row) throw new Error("NO_INSERTED_NOTIFICATION");
    after(async () => {
      try { await dispatchStaffPush([row.id]); }
      catch { console.warn("[web-push] Preview simulated event delivery failed"); }
    });
    return NextResponse.json({ queued: true }, { status: 202, headers });
  } catch {
    return NextResponse.json({ error: "SIMULATION_FAILED" }, { status: 503, headers });
  }
}
