import Link from "next/link";
import { publicDestinations } from "@/lib/public-destinations";
import { EmptyState } from "@/components/ui";
import { Pagination, PageSizeSelector } from "@/components/app-widgets";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";
import { resolvePageSize } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Destinations — ESSAFARIA VISA" };

/**
 * PUBLIC destinations index.
 *
 * Public coverage includes only countries with an active visa programme.
 * Programme names, categories and prices remain private in the Agency Portal.
 * The list behaves like
 * every other list in the product: accent-insensitive search, a region filter,
 * the shared 20/50/100 pagination standard, and an empty state that tells the
 * visitor what to do next instead of showing nothing.
 */
export default async function CountriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const uiLocale = await getUiLocale();
  const ct = contentT(uiLocale);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const region = typeof sp.region === "string" ? sp.region : "";
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const per = resolvePageSize(sp.per);

  let rows: Array<{ id: string; name: string; region: string | null; iso2: string }> = [];
  let catalogueUnavailable = false;
  try {
    rows = await publicDestinations();
  } catch (err) {
    console.error("[countries] destinations unavailable", err);
    rows = [];
    catalogueUnavailable = true;
  }

  const allRegions = [...new Set(rows.map((r) => r.region ?? "Other"))].sort((a, b) => a.localeCompare(b));

  // Accent-insensitive matching on BOTH the localized name and the stored name,
  // so "espagne" finds "Spain"/"España" and "tetouan" style typos still rank.
  const needle = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matches = (row: (typeof rows)[number]) => {
    if (region && (row.region ?? "Other") !== region) return false;
    if (!needle) return true;
    const haystack = `${countryName(row, uiLocale)} ${row.name} ${row.region ?? ""}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return haystack.includes(needle);
  };

  const filtered = rows.filter(matches);
  const pageCount = Math.max(1, Math.ceil(filtered.length / per));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * per, safePage * per);

  return (
    <div className="ess-container py-14">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">{ct("Coverage")}</p>
      <h1 className="mt-2 font-serif text-3xl text-navy-900">{ct("Destinations we operate")}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        {ct("ESSAFARIA maintains visa operations for the following destinations. Programmes and partner pricing for each destination are available inside the Agency Portal.")}
      </p>

      <form method="get" action="/countries" className="card mt-8 flex flex-wrap items-end gap-3 p-4" data-testid="destinations-filter">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="d-q">{ct("Search a destination")}</label>
          <input
            id="d-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={ct("Country or region…")}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="d-region">{ct("Region")}</label>
          <select id="d-region" name="region" defaultValue={region} className="input">
            <option value="">{ct("All regions")}</option>
            {allRegions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary btn-sm">{ct("Search")}</button>
        {q || region ? (
          <Link href="/countries" className="btn-secondary btn-sm">{ct("Clear")}</Link>
        ) : null}
      </form>

      {catalogueUnavailable ? (
        <div className="card mt-6">
          <EmptyState
            title={ct("Destinations are temporarily unavailable")}
            body={ct("Our catalogue could not be loaded just now. Please try again in a moment, or contact us and we will confirm coverage for your destination.")}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card mt-6">
          <EmptyState
            title={ct("No destination matches your search")}
            body={ct("Try a shorter search term or clear the region filter. If your destination is missing, contact us — we open new programmes regularly.")}
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paged.map((row) => (
              <div key={row.id} className="card flex items-center justify-between p-4">
                <span className="font-medium text-navy-900">{countryName(row, uiLocale)}</span>
                <span className="text-xs text-slate-400">{row.region ?? "—"}</span>
              </div>
            ))}
          </div>
          <Pagination
            locale={uiLocale}
            page={safePage}
            pageCount={pageCount}
            total={filtered.length}
            basePath="/countries"
            query={{ q: q || undefined, region: region || undefined, per: per === 20 ? undefined : String(per) }}
          />
          <div className="flex justify-end">
            <PageSizeSelector
              locale={uiLocale}
              pageSize={per}
              basePath="/countries"
              query={{ q: q || undefined, region: region || undefined }}
            />
          </div>
        </>
      )}
    </div>
  );
}
