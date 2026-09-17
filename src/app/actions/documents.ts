"use server";

/**
 * Document actions — upload (agency + staff), review (staff), delete (agency,
 * draft only). Every path validates the ownership chain server-side.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { AppError, DOCUMENT_REVIEW_ROLES } from "@/lib/types";
import { deleteDocument, reviewDocument, uploadDocument, uploadResubmission } from "@/lib/documents";
import { runAction } from "@/lib/action-helpers";

const idSchema = z.string().uuid("Invalid identifier.");

function clientIp(headers: Headers): string | null {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function headersOf(): Promise<Headers> {
  const { headers } = await import("next/headers");
  return headers();
}

async function fileFrom(formData: FormData): Promise<{ name: string; type: string; size: number; data: Buffer }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new AppError("NO_FILE", "Select a file to upload.");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  return { name: file.name, type: file.type || "application/octet-stream", size: file.size, data: buf };
}

export async function uploadDocumentAction(formData: FormData): Promise<void> {
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const back = String(formData.get("back") ?? `/portal/applications/${applicationId}`);
  await runAction(back, async () => {
    const user = await requireUser();
    const file = await fileFrom(formData);
    const checklistItemId = formData.get("checklistItemId");
    const documentTypeId = formData.get("documentTypeId");
    const applicantId = formData.get("applicantId");
    const doc = await uploadDocument({
      applicationId,
      actor: user,
      file,
      checklistItemId: checklistItemId ? idSchema.parse(checklistItemId) : null,
      documentTypeId: documentTypeId ? idSchema.parse(documentTypeId) : null,
      applicantId: applicantId ? idSchema.parse(applicantId) : null,
      ipAddress: clientIp(await headersOf()),
    });
    revalidatePath(back);
    revalidatePath("/portal/applications");
    revalidatePath("/admin/documents");
    return `Document "${doc.originalFilename}" uploaded.`;
  });
}

export async function uploadResubmissionAction(formData: FormData): Promise<void> {
  const applicationId = idSchema.parse(formData.get("applicationId"));
  const originalDocumentId = idSchema.parse(formData.get("originalDocumentId"));
  const back = String(formData.get("back") ?? `/portal/applications/${applicationId}`);
  await runAction(back, async () => {
    const user = await requireUser();
    const file = await fileFrom(formData);
    const doc = await uploadResubmission({
      applicationId,
      originalDocumentId,
      actor: user,
      file,
      ipAddress: clientIp(await headersOf()),
    });
    revalidatePath(back);
    revalidatePath("/admin/documents");
    return `Document "${doc.originalFilename}" resubmitted for review.`;
  });
}

export async function reviewDocumentAction(formData: FormData): Promise<void> {
  const documentId = idSchema.parse(formData.get("documentId"));
  const applicationId = formData.get("applicationId");
  const back = String(applicationId && applicationId !== "" ? `/admin/applications/${applicationId}` : "/admin/documents");
  await runAction(back, async () => {
    const user = await requireUser();
    if (!DOCUMENT_REVIEW_ROLES.includes(user.role)) {
      throw new AppError("FORBIDDEN", "Only ESSAFARIA staff can review documents.");
    }
    const data = z
      .object({
        status: z.enum(["UNDER_REVIEW", "ACCEPTED", "REJECTED", "RESUBMISSION_REQUIRED"]),
        reviewNotes: z.string().trim().max(1000).optional(),
        rejectionReason: z.string().trim().max(1000).optional(),
      })
      .parse({
        status: formData.get("status"),
        reviewNotes: formData.get("reviewNotes") || undefined,
        rejectionReason: formData.get("rejectionReason") || undefined,
      });
    await reviewDocument({
      documentId,
      actor: user,
      status: data.status,
      reviewNotes: data.reviewNotes ?? null,
      rejectionReason: data.rejectionReason ?? null,
      ipAddress: clientIp(await headersOf()),
    });
    revalidatePath(back);
    revalidatePath("/admin/documents");
    return `Document marked ${data.status.replaceAll("_", " ").toLowerCase()}.`;
  });
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const documentId = idSchema.parse(formData.get("documentId"));
  const applicationId = formData.get("applicationId");
  const back = String(applicationId && applicationId !== "" ? `/portal/applications/${applicationId}` : "/portal/documents");
  await runAction(back, async () => {
    const user = await requireUser();
    requirePermission(user, "documents.upload.own");
    await deleteDocument(documentId, user, clientIp(await headersOf()));
    revalidatePath(back);
    revalidatePath("/portal/documents");
    return "Document removed.";
  });
}
