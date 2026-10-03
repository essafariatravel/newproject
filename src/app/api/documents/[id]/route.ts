import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDocumentForUser } from "@/lib/documents";
import { storageProvider } from "@/lib/storage";
import { AppError } from "@/lib/types";
import { recordAudit } from "@/lib/audit";
import { currentObservabilityContext, logErrorOnce, logEvent, pseudonymizeIdentifier, withObservabilityContext } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * Authenticated, tenant-isolated document download.
 * Ownership chain verified server-side: user → agency → application → document.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return withObservabilityContext(
    {
      action: "document.download",
      actorRole: user.role,
      tenantRef: pseudonymizeIdentifier(user.agencyId),
    },
    async () => {
      const downloadStartedAt = Date.now();
      const requestId = currentObservabilityContext()?.requestId ?? null;
      const correlationHeaders: Record<string, string> = {};
      if (requestId) correlationHeaders["X-Request-ID"] = requestId;
      try {
        const row = await getDocumentForUser(id, user);
        const { data, mimeType } = await storageProvider().get(row.doc.storageKey);
        await recordAudit({
          actor: user,
          action: "DOCUMENT_DOWNLOADED",
          entity: "document",
          entityId: id,
          agencyId: row.appAgencyId,
        });
        logEvent({
          eventName: "document.download.succeeded",
          result: "succeeded",
          actorRole: user.role,
          tenantRef: pseudonymizeIdentifier(row.appAgencyId),
          resourceType: "document",
          resourceRef: pseudonymizeIdentifier(id),
          metadata: { size_bytes: data.length, mime_type: mimeType },
          durationMs: Date.now() - downloadStartedAt,
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
            ...correlationHeaders,
          },
        });
      } catch (err) {
        if (err instanceof AppError) {
          logEvent({
            eventName: "document.download.prevented",
            severity: "warning",
            classification: "SAFE_PREVENTION",
            result: "prevented",
            errorCode: err.code,
            actorRole: user.role,
            tenantRef: pseudonymizeIdentifier(user.agencyId),
            resourceType: "document",
            resourceRef: pseudonymizeIdentifier(id),
            durationMs: Date.now() - downloadStartedAt,
          });
          return NextResponse.json(
            { error: "Not found." },
            {
              status: err.code === "NOT_FOUND" ? 404 : 400,
              headers: correlationHeaders,
            },
          );
        }
        logErrorOnce("document.download.technical_failed", err, {
          severity: "error",
          classification: "BUSINESS_FAILURE",
          result: "technical_failed",
          actorRole: user.role,
          tenantRef: pseudonymizeIdentifier(user.agencyId),
          resourceType: "document",
          resourceRef: pseudonymizeIdentifier(id),
          durationMs: Date.now() - downloadStartedAt,
        });
        return NextResponse.json(
          { error: "Download failed." },
          { status: 500, headers: correlationHeaders },
        );
      }
    },
  );
}
