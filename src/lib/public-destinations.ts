import { and, asc, eq } from "drizzle-orm";
import { countries, visaCategories, visaTypes } from "@/db/schema";
import { requireAgencyUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Legacy loader for authenticated Agency coverage; no public callers. */
export async function publicDestinations() {
  await requireAgencyUser();
  return db
    .selectDistinct({
      id: countries.id,
      name: countries.name,
      iso2: countries.iso2,
      region: countries.region,
    })
    .from(countries)
    .innerJoin(visaTypes, and(eq(visaTypes.countryId, countries.id), eq(visaTypes.active, true)))
    .innerJoin(visaCategories, and(eq(visaCategories.id, visaTypes.categoryId), eq(visaCategories.active, true)))
    .where(eq(countries.active, true))
    .orderBy(asc(countries.name));
}
