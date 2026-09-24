import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { searchEverything, countHits } from "@/lib/command-search";
import { EmptyState, PageHeader } from "@/components/ui";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";

/**
 * §28 — global command search: one field, every object type, deep links.
 * Results respect the signed-in staff role's permissions; agency users cannot
 * reach this route (the admin layout redirects them to their portal).
 */
export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await pageUser();
  const uiLocale = await getUiLocale(sp);
  const ct = contentT(uiLocale);
  const term = typeof sp.q === "string" ? sp.q : "";

  const groups = term.trim().length >= 2 ? await searchEverything(user, term, uiLocale) : [];
  const total = countHits(groups);

  return (
    <>
      <PageHeader title={ct("Search")} subtitle={ct("Find a dossier, an agency, an applicant or a catalogue entry.")} />

      <form action="/admin/search" method="get" className="card mb-5 p-4" role="search">
        <label className="label" htmlFor="global-search">
          {ct("Search")}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="global-search"
            name="q"
            type="search"
            defaultValue={term}
            autoComplete="off"
            autoFocus={!term}
            data-testid="global-search-input"
            placeholder={ct("Reference, applicant, agency, country or visa")}
            className="input flex-1"
          />
          <button type="submit" className="btn-primary px-5">
            {ct("Search")}
          </button>
        </div>
        {hasPermission(user, "agencies.view") ? (
          <p className="mt-2 text-xs text-slate-400">
            {ct("Tip: search an agency name, a reference like EVT-2026-XXXXXX, an applicant name, a country or a visa type.")}
          </p>
        ) : null}
      </form>

      {term.trim().length < 2 ? (
        <div className="card">
          <EmptyState title={ct("Start typing to search")} body={ct("Enter at least two characters. Results appear grouped by object type.")} />
        </div>
      ) : total === 0 ? (
        <div className="card">
          <EmptyState
            title={ct("No matches")}
            body={ct("Nothing matched “{term}”. Try a shorter term, a reference, or an applicant name.").replace("{term}", term)}
          />
        </div>
      ) : (
        <div className="space-y-5" data-testid="search-results">
          {groups.map((group) => (
            <section key={group.key} className="card overflow-hidden">
              <header className="flex items-center justify-between border-b border-slate-100 bg-ivory-50/60 px-4 py-2.5">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{ct(group.title)}</h2>
                <span className="text-xs tabular-nums text-slate-400">{group.items.length}</span>
              </header>
              <ul className="divide-y divide-slate-100">
                {group.items.map((item) => (
                  <li key={`${group.key}-${item.href}`}>
                    <Link href={item.href} className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-ivory-50/70">
                      <span className="text-sm font-medium text-navy-900">{item.label}</span>
                      {item.hint ? <span className="text-xs text-slate-400">{item.hint}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
