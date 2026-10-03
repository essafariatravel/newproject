import { pool } from "@/lib/db";
import { qualifiedTable } from "@/lib/database-schema";
import { requirePermission } from "@/lib/rbac";
import { AppError, type AuthUser } from "@/lib/types";
import type { UiLocale } from "@/lib/ui-i18n";

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
      order by effective_at desc, version desc
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
export async function publishLegalContent(input: {
  kind: LegalKind;
  locale: UiLocale;
  body: string;
  effectiveAt: Date;
  actor: AuthUser;
}): Promise<PublishedLegal> {
  requirePermission(input.actor, "cms.manage");
  if (input.actor.agencyId || input.actor.role !== "SUPER_ADMIN") {
    throw new AppError("FORBIDDEN", "Only SUPER_ADMIN can publish approved legal content.");
  }
  const body = input.body.trim();
  if (
    !["terms", "privacy"].includes(input.kind) ||
    !["en", "fr", "ar"].includes(input.locale) ||
    !body ||
    body.length > 50_000 ||
    !Number.isFinite(input.effectiveAt.getTime())
  ) {
    throw new AppError(
      "VALIDATION",
      "Supply approved legal content and its approved effective date.",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
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
      await client.query("commit");
      return previous;
    }

    const version = Number(previous?.version ?? 0) + 1;
    const publishedAt = new Date();
    const inserted = await client.query(
      `insert into ${qualifiedTable("legal_versions")}
         (kind,locale,version,body,effective_at,published_at,author_id)
       values ($1,$2,$3,$4,$5,$6,$7)
       returning id, body, version, effective_at as "effectiveAt",
                 published_at as "publishedAt", author_id as "authorId"`,
      [
        input.kind,
        input.locale,
        version,
        body,
        input.effectiveAt,
        publishedAt,
        input.actor.id,
      ],
    );

    const published = inserted.rows[0] as PublishedLegal;
    await client.query(
      `insert into ${qualifiedTable("audit_logs")}
         (actor_id,actor_email,actor_role,action,entity,entity_id,metadata)
       values ($1,$2,$3,'LEGAL_PUBLISHED','legal_version',$4,$5)`,
      [
        input.actor.id,
        input.actor.email,
        input.actor.role,
        published.id,
        JSON.stringify({
          kind: input.kind,
          locale: input.locale,
          version,
          effectiveAt: input.effectiveAt.toISOString(),
          publishedAt: publishedAt.toISOString(),
        }),
      ],
    );
    await client.query("commit");
    return published;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
