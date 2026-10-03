import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { topupRequestById } from "@/lib/topup";
import { storageProvider } from "@/lib/storage";
import { recordAuditStrict } from "@/lib/audit";
import { AppError } from "@/lib/types";
import { assertStoredFileIntegrity } from "@/lib/file-integrity";

export const dynamic = "force-dynamic";

/** A receipt has its own financial tenant scope, separate from visa documents. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 });
  const { id } = await params;
  try {
    const row = await topupRequestById(id, user);
    if (!row?.proofStorageKey || !row.proofFilename || !row.proofMimeType || row.proofSizeBytes == null) {
      throw new AppError("NOT_FOUND", "Receipt not found.");
    }
    const stored = await storageProvider().get(row.proofStorageKey);
    assertStoredFileIntegrity({
      data: stored.data,
      expectedSizeBytes: row.proofSizeBytes,
      expectedSha256: row.proofSha256,
    });
    await recordAuditStrict({ actor: user, action: "TOPUP_RECEIPT_DOWNLOADED", entity: "wallet_topup_request", entityId: id, agencyId: row.agencyId });
    const fallback = row.proofFilename.replace(/[^\x20-\x7e]|["\\]/g, "_");
    const encoded = encodeURIComponent(row.proofFilename).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return new NextResponse(new Uint8Array(stored.data), { headers: {
      "Content-Type": row.proofMimeType,
      "Content-Length": String(stored.data.length),
      "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "AUDIT_FAILED") return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
      return NextResponse.json({ error: error.code === "FORBIDDEN" ? "FORBIDDEN" : "NOT_FOUND" }, { status: error.code === "FORBIDDEN" ? 403 : 404 });
    }
    console.error("topup-receipt-download-failed");
    return NextResponse.json({ error: "DOWNLOAD_FAILED" }, { status: 500 });
  }
}
