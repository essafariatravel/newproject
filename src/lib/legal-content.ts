import { randomUUID } from "node:crypto";
import { asc, eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteSettings } from "@/db/schema";
import { AppError, type AuthUser } from "@/lib/types";
import type { UiLocale } from "@/lib/ui-i18n";
import { updateSetting } from "@/lib/settings";

export const LEGAL_DOCUMENT_TYPES = ["privacy", "terms"] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

export const LEGAL_VERSION_STATUSES = [
  "DRAFT",
  "OWNER_REVIEW",
  "LEGAL_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "SUPERSEDED",
] as const;
export type LegalVersionStatus = (typeof LEGAL_VERSION_STATUSES)[number];

export interface LegalDocumentVersion {
  schemaVersion: 1;
  id: string;
  documentType: LegalDocumentType;
  language: UiLocale;
  version: string;
  content: string;
  status: LegalVersionStatus;
  effectiveAt: string | null;
  createdAt: string;
  createdBy: string;
  ownerReviewedAt?: string | null;
  ownerReviewedBy?: string | null;
  legalReviewedAt?: string | null;
  legalReviewedBy?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
  supersedesId?: string | null;
}

const VERSION_PREFIX = "legal.version.";
const ACTIVE_PREFIX = "legal.active.";

function versionKey(id: string): string {
  return `${VERSION_PREFIX}${id}`;
}

function activeKey(documentType: LegalDocumentType, language: UiLocale): string {
  return `${ACTIVE_PREFIX}${documentType}.${language}`;
}

function isDocumentType(value: unknown): value is LegalDocumentType {
  return typeof value === "string" && (LEGAL_DOCUMENT_TYPES as readonly string[]).includes(value);
}

function isLanguage(value: unknown): value is UiLocale {
  return value === "en" || value === "fr" || value === "ar";
}

function isStatus(value: unknown): value is LegalVersionStatus {
  return typeof value === "string" && (LEGAL_VERSION_STATUSES as readonly string[]).includes(value);
}

export function isLegalDocumentVersion(value: unknown): value is LegalDocumentVersion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === 1 &&
    typeof v.id === "string" &&
    isDocumentType(v.documentType) &&
    isLanguage(v.language) &&
    typeof v.version === "string" &&
    typeof v.content === "string" &&
    isStatus(v.status) &&
    (v.effectiveAt === null || typeof v.effectiveAt === "string") &&
    typeof v.createdAt === "string" &&
    typeof v.createdBy === "string"
  );
}

function cleanVersionIdentifier(value: string): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > 80) {
    throw new AppError("VALIDATION", "A legal version identifier (max 80 characters) is required.");
  }
  return cleaned;
}

function cleanContent(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) throw new AppError("VALIDATION", "Approved legal content cannot be empty.");
  if (cleaned.length > 200_000) throw new AppError("VALIDATION", "Legal content is too large.");
  return cleaned;
}

function cleanEffectiveAt(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new AppError("VALIDATION", "Invalid effective date.");
  return date.toISOString();
}

export async function listLegalVersions(): Promise<LegalDocumentVersion[]> {
  const rows = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(like(siteSettings.key, `${VERSION_PREFIX}%`))
    .orderBy(asc(siteSettings.updatedAt));
  return rows
    .map((row) => row.value)
    .filter(isLegalDocumentVersion)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLegalVersion(id: string): Promise<LegalDocumentVersion | null> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, versionKey(id)))
    .limit(1);
  return isLegalDocumentVersion(row?.value) ? row.value : null;
}

export async function getPublishedLegalVersion(
  documentType: LegalDocumentType,
  language: UiLocale,
): Promise<LegalDocumentVersion | null> {
  const [pointer] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, activeKey(documentType, language)))
    .limit(1);
  if (typeof pointer?.value !== "string" || !pointer.value) return null;
  const version = await getLegalVersion(pointer.value);
  if (!version || version.status !== "PUBLISHED") return null;
  if (version.documentType !== documentType || version.language !== language) return null;
  return version;
}

export async function createLegalDraft(input: {
  actor: AuthUser;
  documentType: LegalDocumentType;
  language: UiLocale;
  version: string;
  content: string;
  effectiveAt?: string | null;
}): Promise<LegalDocumentVersion> {
  const now = new Date().toISOString();
  const record: LegalDocumentVersion = {
    schemaVersion: 1,
    id: randomUUID(),
    documentType: input.documentType,
    language: input.language,
    version: cleanVersionIdentifier(input.version),
    content: cleanContent(input.content),
    status: "DRAFT",
    effectiveAt: cleanEffectiveAt(input.effectiveAt),
    createdAt: now,
    createdBy: input.actor.id,
  };
  await db.insert(siteSettings).values({
    key: versionKey(record.id),
    value: record as never,
    updatedBy: input.actor.id,
  });
  return record;
}

export async function updateLegalDraft(input: {
  actor: AuthUser;
  id: string;
  version: string;
  content: string;
  effectiveAt?: string | null;
}): Promise<LegalDocumentVersion> {
  const current = await getLegalVersion(input.id);
  if (!current) throw new AppError("NOT_FOUND", "Legal version not found.");
  if (current.status === "PUBLISHED" || current.status === "SUPERSEDED") {
    throw new AppError("IMMUTABLE", "Published legal versions are immutable. Create a new version instead.");
  }
  const next: LegalDocumentVersion = {
    ...current,
    version: cleanVersionIdentifier(input.version),
    content: cleanContent(input.content),
    effectiveAt: cleanEffectiveAt(input.effectiveAt),
    // Editing invalidates prior review state.
    status: "DRAFT",
    ownerReviewedAt: null,
    ownerReviewedBy: null,
    legalReviewedAt: null,
    legalReviewedBy: null,
    approvedAt: null,
    approvedBy: null,
  };
  await updateSetting(versionKey(current.id), next, input.actor.id);
  return next;
}

const ALLOWED_TRANSITIONS: Record<Exclude<LegalVersionStatus, "PUBLISHED" | "SUPERSEDED">, readonly LegalVersionStatus[]> = {
  DRAFT: ["OWNER_REVIEW"],
  OWNER_REVIEW: ["DRAFT", "LEGAL_REVIEW", "APPROVED"],
  LEGAL_REVIEW: ["DRAFT", "APPROVED"],
  APPROVED: ["DRAFT"],
};

export async function transitionLegalVersion(input: {
  actor: AuthUser;
  id: string;
  nextStatus: LegalVersionStatus;
}): Promise<LegalDocumentVersion> {
  const current = await getLegalVersion(input.id);
  if (!current) throw new AppError("NOT_FOUND", "Legal version not found.");
  if (current.status === "PUBLISHED" || current.status === "SUPERSEDED") {
    throw new AppError("IMMUTABLE", "Published legal versions cannot re-enter editing workflow.");
  }
  const allowed = ALLOWED_TRANSITIONS[current.status];
  if (!allowed?.includes(input.nextStatus)) {
    throw new AppError("INVALID_STATE", `Cannot move legal version from ${current.status} to ${input.nextStatus}.`);
  }
  if (input.nextStatus === "APPROVED" && input.actor.role !== "SUPER_ADMIN") {
    throw new AppError("FORBIDDEN", "Only SUPER_ADMIN can approve legal content for publication.");
  }
  const now = new Date().toISOString();
  const next: LegalDocumentVersion = { ...current, status: input.nextStatus };
  if (input.nextStatus === "OWNER_REVIEW") {
    next.ownerReviewedAt = now;
    next.ownerReviewedBy = input.actor.id;
  }
  if (input.nextStatus === "LEGAL_REVIEW") {
    next.legalReviewedAt = now;
    next.legalReviewedBy = input.actor.id;
  }
  if (input.nextStatus === "APPROVED") {
    next.approvedAt = now;
    next.approvedBy = input.actor.id;
  }
  await updateSetting(versionKey(current.id), next, input.actor.id);
  return next;
}

export async function publishLegalVersion(input: {
  actor: AuthUser;
  id: string;
}): Promise<LegalDocumentVersion> {
  if (input.actor.role !== "SUPER_ADMIN") {
    throw new AppError("FORBIDDEN", "Only SUPER_ADMIN can publish legal content.");
  }
  const current = await getLegalVersion(input.id);
  if (!current) throw new AppError("NOT_FOUND", "Legal version not found.");
  if (current.status !== "APPROVED") {
    throw new AppError("INVALID_STATE", "Only an approved legal version can be published.");
  }
  if (!current.effectiveAt) {
    throw new AppError("VALIDATION", "An approved effective date is required before publication.");
  }

  const publishedAt = new Date().toISOString();
  const activeSettingKey = activeKey(current.documentType, current.language);
  let published: LegalDocumentVersion = current;

  await db.transaction(async (tx) => {
    const [pointer] = await tx
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, activeSettingKey))
      .limit(1);
    const previousId = typeof pointer?.value === "string" ? pointer.value : null;

    if (previousId && previousId !== current.id) {
      const [oldRow] = await tx
        .select({ value: siteSettings.value })
        .from(siteSettings)
        .where(eq(siteSettings.key, versionKey(previousId)))
        .limit(1);
      if (isLegalDocumentVersion(oldRow?.value) && oldRow.value.status === "PUBLISHED") {
        const superseded: LegalDocumentVersion = { ...oldRow.value, status: "SUPERSEDED" };
        await tx
          .update(siteSettings)
          .set({ value: superseded as never, updatedBy: input.actor.id, updatedAt: new Date() })
          .where(eq(siteSettings.key, versionKey(previousId)));
      }
    }

    published = {
      ...current,
      status: "PUBLISHED",
      publishedAt,
      publishedBy: input.actor.id,
      supersedesId: previousId && previousId !== current.id ? previousId : current.supersedesId ?? null,
    };
    await tx
      .update(siteSettings)
      .set({ value: published as never, updatedBy: input.actor.id, updatedAt: new Date() })
      .where(eq(siteSettings.key, versionKey(current.id)));

    await tx
      .insert(siteSettings)
      .values({ key: activeSettingKey, value: current.id as never, updatedBy: input.actor.id })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: current.id as never, updatedBy: input.actor.id, updatedAt: new Date() },
      });
  });

  return published;
}

export async function verifyLegalVersionForAcceptance(input: {
  documentType: LegalDocumentType;
  language: UiLocale;
  versionId: string;
}): Promise<LegalDocumentVersion> {
  const active = await getPublishedLegalVersion(input.documentType, input.language);
  if (!active || active.id !== input.versionId) {
    throw new AppError(
      "LEGAL_VERSION_CHANGED",
      "The legal document changed while this page was open. Refresh and review the current version.",
    );
  }
  return active;
}
