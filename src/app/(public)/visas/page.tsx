import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { countries, visaCategories, visaTypes } from "@/db/schema";
import { formatAmount } from "@/lib/format";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Visa Services — ESSAFARIA TRAVEL" };

export default async function VisasPage() {
  let rows: Array<{ visa: typeof visaTypes.$inferSelect; countryName: string; categoryName: string }> = [];
  let catalogueUnavailable = false;
  try {
    rows = await db
      .select({
        visa: visaTypes,
        countryName: countries.name,
        categoryName: visaCategories.name,
      })
      .from(visaTypes)
      .innerJoin(countries, eq(visaTypes.countryId, countries.id))
      .innerJoin(visaCategories, eq(visaTypes.categoryId, visaCategories.id))
      .where(and(eq(visaTypes.active, true), eq(countries.active, true)))
      .orderBy(asc(countries.name), asc(visaCategories.name));
  } catch (err) {
    // Keep the page alive, but say the truth: this is a temporary database
    // problem, not an empty catalogue.
    console.error("[visas] catalogue unavailable", err);
    rows = [];
    catalogueUnavailable = true;
  }

  const byCountry = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byCountry.get(row.countryName) ?? [];
    list.push(row);
    byCountry.set(row.countryName, list);
  }

  return (
    <div className="ess-container py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">Service catalogue</p>
      <h1 className="mt-2 font-serif text-3xl text-navy-900">Visa services</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        Current programmes operated by ESSAFARIA. Fees and processing times are maintained centrally and
        updated by our operations team; partner agencies always quote from the live catalogue.
      </p>

      {rows.length === 0 ? (
        <div className="mt-10 card">
          {catalogueUnavailable ? (
            <EmptyState
              title="Service catalogue temporarily unavailable"
              body="We cannot reach the live visa catalogue right now. Please try again in a few moments."
            />
          ) : (
            <EmptyState title="No visa programmes published yet" body="Please check back soon or contact our partnerships team." />
          )}
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {[...byCountry.entries()].map(([country, visas]) => (
            <section key={country}>
              <h2 className="border-b border-slate-200 pb-2 font-serif text-xl text-navy-900">{country}</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {visas.map((v) => (
                  <div key={v.visa.id} className="card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="badge bg-ivory-100 text-slate-600">{v.categoryName}</p>
                        <h3 className="mt-2 font-serif text-lg text-navy-900">{v.visa.name}</h3>
                      </div>
                      <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-teal-700">
                        {formatAmount(v.visa.fee, v.visa.currency)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{v.visa.description}</p>
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                      <span>
                        Processing: <strong className="text-slate-700">{v.visa.processingMinDays}–{v.visa.processingMaxDays} working days</strong>
                      </span>
                      <span>
                        Code: <strong className="text-slate-700">{v.visa.code}</strong>
                      </span>
                    </div>
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
