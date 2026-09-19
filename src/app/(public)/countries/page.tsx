import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { countries, visaTypes } from "@/db/schema";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Destinations — ESSAFARIA TRAVEL" };

export default async function CountriesPage() {
  let rows: Array<{ id: string; name: string; region: string | null; iso2: string; visaCount: number }> = [];
  let catalogueUnavailable = false;
  try {
    rows = await db
      .select({
        id: countries.id,
        name: countries.name,
        region: countries.region,
        iso2: countries.iso2,
        visaCount: sql<number>`count(${visaTypes.id})::int`,
      })
      .from(countries)
      .leftJoin(visaTypes, and(eq(visaTypes.countryId, countries.id), eq(visaTypes.active, true)))
      .where(eq(countries.active, true))
      .groupBy(countries.id)
      .orderBy(asc(countries.name));
  } catch (err) {
    console.error("[countries] catalogue unavailable", err);
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">Coverage</p>
      <h1 className="mt-2 font-serif text-3xl text-navy-900">Destinations we operate</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        ESSAFARIA maintains visa operations for the following destinations. Each destination lists the
        programmes available to partner agencies.
      </p>

      {rows.length === 0 ? (
        <div className="mt-10 card">
          {catalogueUnavailable ? (
            <EmptyState
              title="Destinations temporarily unavailable"
              body="We cannot reach the live destinations list right now. Please try again in a few moments."
            />
          ) : (
            <EmptyState title="No destinations published yet" />
          )}
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {[...regions.entries()].map(([region, list]) => (
            <section key={region}>
              <h2 className="border-b border-slate-200 pb-2 font-serif text-xl text-navy-900">{region}</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {list.map((c) => (
                  <Link
                    key={c.id}
                    href="/visas"
                    className="card tr-hover flex items-center justify-between p-4"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="badge bg-navy-900/5 text-navy-800">{c.iso2}</span>
                      <span className="text-sm font-medium text-navy-900">{c.name}</span>
                    </span>
                    <span className="text-xs text-slate-400">
                      {c.visaCount} {c.visaCount === 1 ? "visa" : "visas"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
