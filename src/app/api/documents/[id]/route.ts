import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDocumentForUser } from "@/lib/documents";
import { storageProvider } from "@/lib/storage";
import { AppError } from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { currentOperationActor } from "@/lib/operation-identity";

export const dynamic = "force-dynamic";

/**
 * Authenticated, tenant-isolated document download.
 * Ownership chain verified server-side: user → agency → application → document.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "You must set a new password before continuing.", code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const row = await getDocumentForUser(id, user);
    const { data, mimeType } = await storageProvider().get(row.doc.storageKey);
    await db.transaction(async tx => {
      const actor = await currentOperationActor(tx, user);
      await recordAudit({
      actor,
      action: "DOCUMENT_DOWNLOADED",
      entity: "document",
      entityId: id,
      agencyId: row.appAgencyId,
      }, tx);
    });
    // Content-Disposition attachment prevents inline script execution for HTML-like uploads
    const safeName = row.doc.originalFilename.replace(/["\\\r\n]/g, "_");
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(data.length),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.code === "UNAUTHENTICATED") return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
      return NextResponse.json({ error: "Not found." }, { status: err.code === "NOT_FOUND" ? 404 : 400 });
    }
    console.error("document-download-failed");
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
