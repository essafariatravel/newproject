import { pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { requirePermission } from "@/lib/rbac";
import { AppError, type AuthUser } from "@/lib/types";
import type { UiLocale } from "@/lib/ui-i18n";
import { recordAuditPg } from "@/lib/audit";
import { currentOperationActorPg } from "@/lib/operation-identity";
import { legalContentSha256 } from "@/lib/legal-evidence";

export const LEGAL_KINDS=["terms","privacy","legal_notice","cookies","commercial","staff_confidentiality","traveller_submission_declaration"] as const;
export type LegalKind = typeof LEGAL_KINDS[number];

export interface PublishedLegal {
  id: string;
  body: string;
  version: number;
  /** Owner/legal supplied effective date. Never inferred from deployment time. */
  effectiveAt: Date;
  /** Actual database publication timestamp. */
  publishedAt: Date;
  authorId: string;
}

/**
 * Returns the version currently in effect for this kind/locale.
 * A future-dated published version remains inactive until effective_at.
 */
export async function readPublishedLegal(
  kind: LegalKind,
  locale: UiLocale,
): Promise<PublishedLegal | null> {
  const result = await pool.query(
    `select id, body, version,
            effective_at as "effectiveAt",
            published_at as "publishedAt",
            author_id as "authorId"
       from ${qualifiedTable("legal_versions")}
      where kind=$1 and locale=$2 and effective_at<=now()
      order by version desc
      limit 1`,
    [kind, locale],
  );
  return result.rows[0] ?? null;
}

/** Latest immutable published record, including a scheduled future-effective version. */
export async function readLatestLegal(
  kind: LegalKind,
  locale: UiLocale,
): Promise<PublishedLegal | null> {
  const result = await pool.query(
    `select id, body, version,
            effective_at as "effectiveAt",
            published_at as "publishedAt",
            author_id as "authorId"
       from ${qualifiedTable("legal_versions")}
      where kind=$1 and locale=$2
      order by version desc
      limit 1`,
    [kind, locale],
  );
  return result.rows[0] ?? null;
}

/**
 * Publishes content that has already completed the owner/legal approval process.
 *
 * This function deliberately does not invent or infer legal approval. It only
 * records a SUPER_ADMIN publication event once approved content and its
 * approved effective date have been supplied.
 */
export interface LegalPublication {
  kind: LegalKind;
  locale: UiLocale;
  body: string;
  effectiveAt: Date | "AT_RECORDING";
  /** Bound owner decision; required for its explicitly authorised recording-time policy. */
  ownerApprovalReference?: string;
  actor: AuthUser;
}

export async function publishLegalContent(input: LegalPublication): Promise<PublishedLegal> {
  return (await publishLegalContents([input]))[0]!;
}

/** One editor save commits every immutable version and its audit together. */
export async function publishLegalContents(inputs: LegalPublication[]): Promise<PublishedLegal[]> {
  const publications = [...inputs].sort((a, b) => `${a.kind}:${a.locale}`.localeCompare(`${b.kind}:${b.locale}`));
  if (!publications.length || new Set(publications.map(input => `${input.kind}:${input.locale}`)).size !== publications.length) {
    throw new AppError("VALIDATION", "Supply approved legal content and its approved effective date.");
  }
  for (const input of publications) {
    requirePermission(input.actor, "cms.manage");
    if (input.actor.agencyId || input.actor.role !== "SUPER_ADMIN") {
      throw new AppError("FORBIDDEN", "Only SUPER_ADMIN can publish approved legal content.");
    }
    if (!LEGAL_KINDS.includes(input.kind) || !["en", "fr", "ar"].includes(input.locale) ||
        !input.body.trim() || input.body.trim().length > 50_000 ||
        (input.effectiveAt === "AT_RECORDING" ? !input.ownerApprovalReference || !/^[A-Za-z0-9_-]{16,128}$/.test(input.ownerApprovalReference)
          : !(input.effectiveAt instanceof Date) || !Number.isFinite(input.effectiveAt.getTime()) || !!input.ownerApprovalReference)) {
      throw new AppError(
        "VALIDATION",
        "Supply approved legal content and its approved effective date.",
      );
    }
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    // Identity serialization precedes legal locks, matching every privileged
    // mutation. Slow form processing cannot revive a captured revoked actor.
    const actors: AuthUser[] = [];
    for (const input of publications) actors.push(await currentOperationActorPg(client, input.actor));
    for (const input of publications) await client.query("select pg_advisory_xact_lock(hashtext($1))", [`legal:${input.kind}:${input.locale}`]);
    // Owner-authorised policy: the real DB instant after all publication waits,
    // shared by this atomic batch. Never use a browser, deployment or host clock.
    const recordedAt = (await client.query<{at:Date}>("select clock_timestamp() at")).rows[0]!.at;
    const results: PublishedLegal[] = [];
    for (const [index, input] of publications.entries()) {
      const actor = actors[index]!, body = input.body.trim();
      const effectiveAt = input.effectiveAt === "AT_RECORDING" ? recordedAt : input.effectiveAt;
      if (input.ownerApprovalReference) {
        const bound = (await client.query<PublishedLegal>(`select v.id,v.body,v.version,v.effective_at as "effectiveAt",v.published_at as "publishedAt",v.author_id as "authorId"
          from ${qualifiedTable("legal_versions")} v join ${qualifiedTable("audit_logs")} a on a.entity_id=v.id::text
          where a.action='LEGAL_PUBLISHED' and a.entity='legal_version' and a.metadata->>'ownerApprovalReference'=$1 and v.kind=$2 and v.locale=$3
          order by v.version desc limit 1`, [input.ownerApprovalReference,input.kind,input.locale])).rows[0];
        if (bound) { if(bound.body!==body)throw new AppError("LEGAL_APPROVAL_CHANGED","The recorded approval is bound to different content."); results.push(bound); continue; }
      }

      const latest = await client.query(
        `select id, body, version, effective_at as "effectiveAt",
                published_at as "publishedAt", author_id as "authorId"
           from ${qualifiedTable("legal_versions")}
          where kind=$1 and locale=$2
          order by version desc
          limit 1`,
        [input.kind, input.locale],
      );

      const previous = latest.rows[0] as PublishedLegal | undefined;
      if (
        previous?.body === body &&
        previous.effectiveAt instanceof Date &&
        input.effectiveAt !== "AT_RECORDING" && previous.effectiveAt.getTime() === effectiveAt.getTime()
      ) {
        results.push(previous);
        continue;
      }

      const version = Number(previous?.version ?? 0) + 1;
      const inserted = await client.query(
        `insert into ${qualifiedTable("legal_versions")}
           (kind,locale,version,body,effective_at,published_at,author_id)
         values ($1,$2,$3,$4,$5,$7,$6)
         returning id, body, version, effective_at as "effectiveAt",
                   published_at as "publishedAt", author_id as "authorId"`,
        [
          input.kind,
          input.locale,
          version,
          body,
          effectiveAt,
          actor.id,
          recordedAt,
        ],
      );

      const published = inserted.rows[0] as PublishedLegal;
      await recordAuditPg(client, {
        actor, action: "LEGAL_PUBLISHED", entity: "legal_version", entityId: published.id,
        metadata: {
          kind: input.kind,
          locale: input.locale,
          version,
          effectiveAt: effectiveAt.toISOString(),
          publishedAt: published.publishedAt.toISOString(),
          contentSha256: legalContentSha256(body),
          ...(input.ownerApprovalReference ? {ownerApprovalReference:input.ownerApprovalReference,effectiveDatePolicy:"AT_RECORDING"} : {}),
        },
      });
      results.push(published);
    }
    await client.query("commit");
    return results;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
