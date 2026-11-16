/**
 * GET /api/branding/logo — the platform logo uploaded by the super admin.
 * Public by design (it renders in the public header). Falls through with 404
 * when no logo is uploaded, so callers fall back to the built-in monogram.
 */
import { NextResponse } from "next/server";
import { readBranding } from "@/lib/branding";
import { storageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const b = await readBranding();
  if (!b.logoKey) return new NextResponse("Not found", { status: 404 });

  const etag = `"${b.logoVersion || "0"}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304 });
  }
  try {
    const { data, mimeType } = await storageProvider().get(b.logoKey);
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
