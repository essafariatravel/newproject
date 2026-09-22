import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { countries } from "@/db/schema";
import { EmptyState } from "@/components/ui";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";

export const metadata = { title: "Destinations — ESSAFARIA TRAVEL" };

export default async function CountriesPage() {
  // Countries are marketing-safe coverage information. Visa types, counts and
  const ct = contentT(await getUiLocale());
  // prices are B2B-only (Agency Portal) and deliberately not queried here.
  let rows: Array<{ id: string; name: string; region: string | null; iso2: string }> = [];
  let catalogueUnavailable = false;
  try {
    rows = await db
      .select({
        id: countries.id,
        name: countries.name,
        region: countries.region,
        iso2: countries.iso2,
      })
      .from(countries)
      .where(eq(countries.active, true))
      .orderBy(asc(countries.name));
  } catch (err) {
    console.error("[countries] destinations unavailable", err);
    rows = [];
    catalogueUnavailable = true;
  }

  const regions = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.region ?? "Other";
    const list = regions.get(key) ?? [];
    list.push(row);
    regions.set(key, list);
  }

  return (
    <div className="ess-container py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">{ct("Coverage")}</p>
      <h1 className="mt-2 font-serif text-3xl text-navy-900">{ct("Destinations we operate")}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        {ct("ESSAFARIA maintains visa operations for the following destinations. Programmes and partner pricing for each destination are available inside the Agency Portal.")}
      </p>

      {rows.length === 0 ? (
        <div className="mt-10 card">
          {catalogueUnavailable ? (
            <EmptyState
              title={ct("Destinations temporarily unavailable")}
              body={ct("We cannot reach the live destinations list right now. Please try again in a few moments.")}
            />
          ) : (
            <EmptyState title={ct("No destinations published yet")} />
          )}
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {[...regions.entries()].map(([region, list]) => (
            <section key={region}>
              <h2 className="border-b border-slate-200 pb-2 font-serif text-xl text-navy-900">{region}</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {list.map((c) => (
                  <div key={c.id} className="card flex items-center gap-2.5 p-4">
                    <span className="badge bg-navy-900/5 text-navy-800">{c.iso2}</span>
                    <span className="text-sm font-medium text-navy-900">{c.name}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
