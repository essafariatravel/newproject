import { and, asc, eq } from "drizzle-orm";
import { countries, visaCategories, visaTypes } from "@/db/schema";
import { db } from "@/lib/db";

/** Public coverage exposes country names only; programmes and partner fees stay private. */
export async function publicDestinations() {
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
