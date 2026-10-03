/**
 * GET /api/agencies/[id]/logo — authenticated agency white-label logo.
 *
 * Agency users may fetch only their own agency logo. Staff need agencies.view.
 * This resource is private by design; the public website uses /api/branding/logo.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { db } from "@/lib/db";
import { agencies } from "@/db/schema";
import { storageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Authentication required", { status: 401 });
  if (user.mustChangePassword) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return new NextResponse("Not found", { status: 404 });

  const isOwnAgency = user.agencyId === id;
  const canViewAgencies = hasPermission(user, "agencies.view");
  if (!isOwnAgency && !canViewAgencies) {
    // Do not reveal whether another tenant exists.
    return new NextResponse("Not found", { status: 404 });
  }

  const rows = await db
    .select({ logoKey: agencies.logoKey })
    .from(agencies)
    .where(eq(agencies.id, id))
    .limit(1);
  const row = rows[0];
  if (!row?.logoKey) return new NextResponse("Not found", { status: 404 });

  try {
    const { data, mimeType } = await storageProvider().get(row.logoKey);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
