import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDocumentForUser } from "@/lib/documents";
import { storageProvider } from "@/lib/storage";
import { AppError } from "@/lib/types";
import { recordAuditStrict } from "@/lib/audit";
import { db } from "@/lib/db";
import { currentOperationActor } from "@/lib/operation-identity";
import { assertStoredFileIntegrity } from "@/lib/file-integrity";
import { downloadContentDisposition } from "@/lib/download-content-disposition";

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
  let stage: "lookup" | "storage" | "integrity" | "response" | "audit" = "lookup";
  try {
    const row = await getDocumentForUser(id, user);
    stage = "storage";
    const { data } = await storageProvider().get(row.doc.storageKey);
    stage = "integrity";
    assertStoredFileIntegrity({ data, expectedSizeBytes: row.doc.sizeBytes, expectedSha256: row.doc.sha256 });
    stage = "response";
    // Build the response before recording a successful download. A Unicode
    // filename must not turn a verified read into a 500 after the audit commit.
    const response = new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": row.doc.mimeType,
        "Content-Length": String(data.length),
        "Content-Disposition": downloadContentDisposition(row.doc.originalFilename),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
    stage = "audit";
    await db.transaction(async tx => {
      const actor = await currentOperationActor(tx, user, "read");
      await recordAuditStrict({
        actor,
        action: "DOCUMENT_DOWNLOADED",
        entity: "document",
        entityId: id,
        agencyId: row.appAgencyId,
        metadata: { evidenceIntegrity: "VERIFIED" },
      }, tx);
    });
    return response;
  } catch (err) {
    if (err instanceof AppError) {
      if (err.code === "AUDIT_FAILED") return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
      if (err.code === "UNAUTHENTICATED") return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      if (err.code.startsWith("STORAGE_")) {
        // Operational category only: never log file names, tenant IDs, file
        // contents, storage credentials, or raw provider errors.
        console.error("document-download-failed", { stage, category: err.code });
        return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
      }
      return NextResponse.json({ error: "Not found." }, { status: err.code === "NOT_FOUND" ? 404 : 400 });
    }
    console.error("document-download-failed", { stage, category: "UNEXPECTED" });
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
