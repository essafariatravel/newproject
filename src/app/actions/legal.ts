"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/lib/action-helpers";
import { requireStaff } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import {
  LEGAL_DOCUMENT_TYPES,
  LEGAL_VERSION_STATUSES,
  createLegalDraft,
  publishLegalVersion,
  transitionLegalVersion,
  updateLegalDraft,
} from "@/lib/legal-content";

const documentTypeSchema = z.enum(LEGAL_DOCUMENT_TYPES);
const languageSchema = z.enum(["en", "fr", "ar"]);
const statusSchema = z.enum(LEGAL_VERSION_STATUSES);
const idSchema = z.string().uuid();

function refreshLegalPages(): void {
  revalidatePath("/admin/settings");
  revalidatePath("/privacy");
  revalidatePath("/terms");
  revalidatePath("/agency/register");
}

export async function saveLegalDraftAction(formData: FormData): Promise<void> {
  await runAction("/admin/settings", async () => {
    const actor = await requireStaff();
    requirePermission(actor, "cms.manage");

    const idRaw = String(formData.get("id") ?? "").trim();
    const documentType = documentTypeSchema.parse(formData.get("documentType"));
    const language = languageSchema.parse(formData.get("language"));
    const version = z.string().trim().min(1).max(80).parse(formData.get("version"));
    const content = z.string().trim().min(1).max(200_000).parse(formData.get("content"));
    const effectiveAtRaw = String(formData.get("effectiveAt") ?? "").trim();

    const saved = idRaw
      ? await updateLegalDraft({
          actor,
          id: idSchema.parse(idRaw),
          version,
          content,
          effectiveAt: effectiveAtRaw || null,
        })
      : await createLegalDraft({
          actor,
          documentType,
          language,
          version,
          content,
          effectiveAt: effectiveAtRaw || null,
        });

    await recordAudit({
      actor,
      action: idRaw ? "LEGAL_DRAFT_UPDATED" : "LEGAL_DRAFT_CREATED",
      entity: "legal_document",
      entityId: saved.id,
      metadata: {
        documentType: saved.documentType,
        language: saved.language,
        version: saved.version,
        status: saved.status,
      },
    });
    refreshLegalPages();
    return "Legal draft saved. It is not published.";
  });
}

export async function transitionLegalVersionAction(formData: FormData): Promise<void> {
  await runAction("/admin/settings", async () => {
    const actor = await requireStaff();
    requirePermission(actor, "cms.manage");
    const id = idSchema.parse(formData.get("id"));
    const nextStatus = statusSchema.parse(formData.get("nextStatus"));
    const updated = await transitionLegalVersion({ actor, id, nextStatus });
    await recordAudit({
      actor,
      action: "LEGAL_VERSION_STATUS_CHANGED",
      entity: "legal_document",
      entityId: updated.id,
      metadata: {
        documentType: updated.documentType,
        language: updated.language,
        version: updated.version,
        status: updated.status,
      },
    });
    refreshLegalPages();
    return `Legal version moved to ${updated.status}.`;
  });
}

export async function publishLegalVersionAction(formData: FormData): Promise<void> {
  await runAction("/admin/settings", async () => {
    const actor = await requireStaff();
    requirePermission(actor, "cms.manage");
    const id = idSchema.parse(formData.get("id"));
    const published = await publishLegalVersion({ actor, id });
    await recordAudit({
      actor,
      action: "LEGAL_VERSION_PUBLISHED",
      entity: "legal_document",
      entityId: published.id,
      metadata: {
        documentType: published.documentType,
        language: published.language,
        version: published.version,
        effectiveAt: published.effectiveAt,
      },
    });
    refreshLegalPages();
    return `${published.documentType === "privacy" ? "Privacy Notice" : "Terms of Service"} ${published.version} published for ${published.language.toUpperCase()}.`;
  });
}
