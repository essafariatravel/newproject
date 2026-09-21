import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { getRegistrationDocument } from "@/lib/registrations";
import { storageProvider } from "@/lib/storage";
import { AppError } from "@/lib/types";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Staff-only download of an agency-registration document (private storage).
 * Never exposed publicly; every download is audited.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!hasPermission(user, "registrations.view")) {
    // Do not leak existence of the record.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const doc = await getRegistrationDocument(id, docId);
    if (!doc) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const { data, mimeType } = await storageProvider().get(doc.storageKey);
    await recordAudit({
      actor: user,
      action: "REGISTRATION_DOCUMENT_DOWNLOADED",
      entity: "agency_registration_document",
      entityId: doc.id,
      metadata: { registrationId: id, filename: doc.originalFilename },
    });
    const safeName = doc.originalFilename.replace(/["\\\r\n]/g, "_");
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
      return NextResponse.json({ error: "Not found." }, { status: err.code === "NOT_FOUND" ? 404 : 400 });
    }
    console.error("registration-document-download-failed", err);
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
