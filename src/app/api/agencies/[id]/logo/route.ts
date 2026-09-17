/**
 * GET /api/agencies/[id]/logo — an agency's white-label logo.
 * Public by design (logos are meant to be displayed). UUID-guarded; 404 when
 * the agency does not exist or has no logo.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies } from "@/db/schema";
import { storageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return new NextResponse("Not found", { status: 404 });

  const rows = await db
    .select({ logoKey: agencies.logoKey, logoUploadedAt: agencies.logoUploadedAt })
    .from(agencies)
    .where(eq(agencies.id, id))
    .limit(1);
  const row = rows[0];
  if (!row?.logoKey) return new NextResponse("Not found", { status: 404 });

  const etag = `"${row.logoUploadedAt ? new Date(row.logoUploadedAt).getTime() : 0}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304 });
  }
  try {
    const { data, mimeType } = await storageProvider().get(row.logoKey);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
