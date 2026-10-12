import { pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { requirePermission } from "@/lib/rbac";
import { AppError, type AuthUser } from "@/lib/types";
import type { UiLocale } from "@/lib/ui-i18n";
import { recordAuditPg } from "@/lib/audit";
import { currentOperationActorPg } from "@/lib/operation-identity";

export type LegalKind = "terms" | "privacy";

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
  effectiveAt: Date;
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
    if (!["terms", "privacy"].includes(input.kind) || !["en", "fr", "ar"].includes(input.locale) ||
        !input.body.trim() || input.body.trim().length > 50_000 || !(input.effectiveAt instanceof Date) ||
        !Number.isFinite(input.effectiveAt.getTime())) {
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
    const results: PublishedLegal[] = [];
    for (const [index, input] of publications.entries()) {
      const actor = actors[index]!, body = input.body.trim();
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        `legal:${input.kind}:${input.locale}`,
      ]);

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
        previous.effectiveAt.getTime() === input.effectiveAt.getTime()
      ) {
        results.push(previous);
        continue;
      }

      const version = Number(previous?.version ?? 0) + 1;
      const inserted = await client.query(
        `insert into ${qualifiedTable("legal_versions")}
           (kind,locale,version,body,effective_at,published_at,author_id)
         values ($1,$2,$3,$4,$5,now(),$6)
         returning id, body, version, effective_at as "effectiveAt",
                   published_at as "publishedAt", author_id as "authorId"`,
        [
          input.kind,
          input.locale,
          version,
          body,
          input.effectiveAt,
          actor.id,
        ],
      );

      const published = inserted.rows[0] as PublishedLegal;
      await recordAuditPg(client, {
        actor, action: "LEGAL_PUBLISHED", entity: "legal_version", entityId: published.id,
        metadata: {
          kind: input.kind,
          locale: input.locale,
          version,
          effectiveAt: input.effectiveAt.toISOString(),
          publishedAt: published.publishedAt.toISOString(),
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
