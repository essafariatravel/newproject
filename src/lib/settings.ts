import { cache } from "react";
import { db } from "@/lib/db";
import { siteSettings } from "@/db/schema";
import { sql } from "drizzle-orm";

export type SiteSettingsMap = Record<string, unknown>;

/**
 * Load all site settings (per-request cached).
 *
 * Public pages use these values for optional copy and branding. A database
 * connection failure must not turn those pages into a 500, especially during
 * the first deployment before migrations have completed.
 */
export const getSiteSettings = cache(async (): Promise<SiteSettingsMap> => {
  try {
    const rows = await db.select().from(siteSettings);
    const map: SiteSettingsMap = {};
    for (const row of rows) map[row.key] = row.value;
    return map;
  } catch {
    return {};
  }
});

export function settingString(map: SiteSettingsMap, key: string, fallback = ""): string {
  const v = map[key];
  return typeof v === "string" ? v : fallback;
}

export function settingObject(
  map: SiteSettingsMap,
  key: string,
  fallback: Record<string, string> = {},
): Record<string, string> {
  const v = map[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : fallback;
}

export async function updateSetting(key: string, value: unknown, updatedBy: string | null) {
  await db
    .insert(siteSettings)
    .values({ key, value: value as never, updatedBy })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: value as never, updatedBy, updatedAt: sql`now()` },
    });
}
