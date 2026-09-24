/**
 * §28 — global staff search.
 *
 * One term, several object types, every result a deep link. The search is
 * server-side and permission-aware: a group is only queried (and only ever
 * rendered) when the signed-in staff role holds the matching permission, so it
 * can never leak data across modules or tenants.
 */
import { eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, countries, visaTypes, visaCategories, applications, applicants } from "@/db/schema";
import { hasPermission } from "@/lib/rbac";
import { countryName } from "@/lib/country-names";
import { qualifiedTable } from "@/lib/database-schema";
import type { AuthUser } from "@/lib/types";

export interface SearchHit {
  label: string;
  hint?: string;
  href: string;
}

export interface SearchGroup {
  key: string;
  title: string;
  items: SearchHit[];
}

const LIMIT_PER_GROUP = 6;

export async function searchEverything(
  user: AuthUser,
  rawTerm: string,
  locale: "en" | "fr" | "ar" = "en",
): Promise<SearchGroup[]> {
  const term = rawTerm.trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const groups: SearchGroup[] = [];

  if (hasPermission(user, "applications.view.all")) {
    const rows = await db
      .select({
        id: applications.id,
        reference: applications.reference,
        statusName: sql<string>`(select s.name from ${sql.raw(qualifiedTable("statuses"))} s where s.id = applications.status_id)`,
        agencyName: sql<string>`(select coalesce(a.trading_name, a.legal_name) from ${sql.raw(qualifiedTable("agencies"))} a where a.id = applications.agency_id)`,
        applicantSummary: sql<string>`(select coalesce(nullif(p.full_name, ''), '—') from ${sql.raw(qualifiedTable("applicants"))} p where p.application_id = applications.id limit 1)`,
      })
      .from(applications)
      .where(
        or(
          ilike(applications.reference, like),
          ilike(applications.visaTypeName, like),
          ilike(applications.countryName, like),
          sql`exists (select 1 from ${sql.raw(qualifiedTable("applicants"))} p
                where p.application_id = applications.id and p.full_name ilike ${like})`,
          sql`exists (select 1 from ${sql.raw(qualifiedTable("agencies"))} a
                where a.id = applications.agency_id
                  and (a.legal_name ilike ${like} or coalesce(a.trading_name, '') ilike ${like}))`,
        ),
      )
      .limit(LIMIT_PER_GROUP);
    if (rows.length > 0) {
      groups.push({
        key: "applications",
        title: "Applications",
        items: rows.map((r) => ({
          label: r.reference,
          hint: [r.applicantSummary, r.agencyName, r.statusName].filter(Boolean).join(" · "),
          href: `/admin/applications/${r.id}`,
        })),
      });
    }
  }

  if (hasPermission(user, "agencies.view")) {
    const rows = await db
      .select({ id: agencies.id, legalName: agencies.legalName, tradingName: agencies.tradingName, city: agencies.city, email: agencies.email })
      .from(agencies)
      .where(
        or(
          ilike(agencies.legalName, like),
          ilike(agencies.tradingName, like),
          ilike(agencies.email, like),
          ilike(agencies.city, like),
        ),
      )
      .limit(LIMIT_PER_GROUP);
    if (rows.length > 0) {
      groups.push({
        key: "agencies",
        title: "Agencies",
        items: rows.map((r) => ({
          label: r.tradingName ?? r.legalName,
          hint: [r.legalName === r.tradingName ? null : r.legalName, r.city, r.email].filter(Boolean).join(" · "),
          href: `/admin/agencies/${r.id}`,
        })),
      });
    }
  }

  if (hasPermission(user, "applicants.view.all")) {
    const rows = await db
      .select({
        id: applicants.id,
        fullName: sql<string>`coalesce(nullif(${applicants.fullName}, ''), '—')`,
        reference: applications.reference,
        applicationId: applications.id,
      })
      .from(applicants)
      .innerJoin(applications, eq(applicants.applicationId, applications.id))
      .where(ilike(applicants.fullName, like))
      .limit(LIMIT_PER_GROUP);
    if (rows.length > 0) {
      groups.push({
        key: "applicants",
        title: "Applicants",
        items: rows.map((r) => ({
          label: r.fullName,
          hint: r.reference,
          href: `/admin/applications/${r.applicationId}?tab=documents`,
        })),
      });
    }
  }

  if (hasPermission(user, "config.view")) {
    const countryRows = await db
      .select({ id: countries.id, name: countries.name, iso2: countries.iso2 })
      .from(countries)
      .where(or(ilike(countries.name, like), ilike(countries.iso2, like)))
      .limit(LIMIT_PER_GROUP);
    const visaRows = await db
      .select({ id: visaTypes.id, name: visaTypes.name, code: visaTypes.code, countryIso2: countries.iso2, countryName: countries.name })
      .from(visaTypes)
      .innerJoin(countries, eq(visaTypes.countryId, countries.id))
      .where(or(ilike(visaTypes.name, like), ilike(visaTypes.code, like), ilike(countries.name, like)))
      .limit(LIMIT_PER_GROUP);
    const items: SearchHit[] = [
      ...countryRows.map((c) => ({
        label: countryName(c, locale),
        hint: `Country · ${c.iso2}`,
        href: `/admin/config/countries/${c.id}`,
      })),
      ...visaRows.map((v) => ({
        label: v.name,
        hint: `Visa type · ${countryName({ name: v.countryName, iso2: v.countryIso2 }, locale)}`,
        href: `/admin/config/visa-types/${v.id}`,
      })),
    ];
    const categories = await db
      .select({ id: visaCategories.id, name: visaCategories.name })
      .from(visaCategories)
      .where(ilike(visaCategories.name, like))
      .limit(2);
    for (const c of categories) items.push({ label: c.name, hint: "Visa category", href: `/admin/config/visa-categories/${c.id}` });
    if (items.length > 0) groups.push({ key: "config", title: "Catalogue", items: items.slice(0, LIMIT_PER_GROUP) });
  }

  return groups;
}

/** Kept for symmetry with the list pages: total hits across groups. */
export function countHits(groups: SearchGroup[]): number {
  return groups.reduce((sum, g) => sum + g.items.length, 0);
}
