import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listCountries } from "@/lib/applications-exports";
import { flashFrom } from "@/lib/action-helpers";
import { createCountryAction, deleteCountryAction, updateCountryAction } from "@/app/actions/config";
import { SubmitButton } from "@/components/forms";
import { ActiveBadge, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";

export const dynamic = "force-dynamic";
const REGIONS = ["Africa","Asia","Europe","Middle East","North America","South America","Oceania"];

export default async function CountriesConfigPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const staff = await pageUser();
  const locale = await getUiLocale();
  const ct = contentT(locale);
  if (!hasPermission(staff, "config.view")) {
    return <div className="card"><EmptyState title={ct("Not authorized")} /></div>;
  }
  const flash = flashFrom(sp);
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const allRows = await listCountries();
  const rows = q ? allRows.filter((c) => c.name.toLowerCase().includes(q) || c.iso2.toLowerCase().includes(q) || (c.region ?? "").toLowerCase().includes(q)) : allRows;
  const canManage = hasPermission(staff, "config.manage");

  return (
    <>
      <PageHeader
        title={ct("Countries")}
        subtitle={ct("Destination countries — safe hard-delete blocked when referenced by visa types or applications.")}
        actions={
          <form className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input name="q" defaultValue={typeof sp.q === "string" ? sp.q : ""} placeholder={ct("Search country, ISO, region…")} className="input min-w-0 flex-1 text-base sm:w-64" />
            <button type="submit" className="btn-secondary btn-sm">{ct("Search")}</button>
            {q ? <Link href="/admin/config/countries" className="btn-secondary btn-sm">{ct("Clear")}</Link> : null}
          </form>
        }
      />
      <Flash {...flash} />

      <TableWrap>
        <thead className="border-b border-slate-100 bg-ivory-50/60">
          <tr>
            <th className="th">{ct("Country")}</th>
            <th className="th">ISO</th>
            <th className="th">{ct("Region")}</th>
            <th className="th">{ct("Sort")}</th>
            <th className="th">{ct("Used by visa programmes")}</th>
            <th className="th">{ct("Status")}</th>
            {canManage ? <th className="th text-right">{ct("Actions")}</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((c) => (
            <tr key={c.id} className="tr-hover">
              <td className="td font-semibold text-navy-900">{countryName(c, locale)}</td>
              <td className="td"><span className="badge bg-navy-900/5 text-navy-800">{c.iso2}</span></td>
              <td className="td">{c.region ? ct(c.region) : "—"}</td>
              <td className="td tabular-nums text-xs">{c.sortOrder}</td>
              <td className="td tabular-nums text-xs">{c.usageCount}</td>
              <td className="td"><ActiveBadge active={c.active} locale={locale} /></td>
              {canManage ? (
                <td className="td text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <details className="text-start"><summary className="btn-secondary btn-sm cursor-pointer">{ct("Edit")}</summary>
                      <form action={updateCountryAction} className="space-y-4 p-3 min-w-60">
                        <input type="hidden" name="id" value={c.id}/>
                        <label className="label">{ct("Name")} · EN<input name="name" required className="input" defaultValue={c.name}/></label>
                        <label className="label">{ct("Name")} · FR<input name="nameFr" className="input" defaultValue={c.nameFr??""}/></label>
                        <label className="label">{ct("Name")} · AR<input name="nameAr" className="input" dir="rtl" defaultValue={c.nameAr??""}/></label>
                        <label className="label">ISO-2<input name="iso2" required maxLength={2} minLength={2} className="input" defaultValue={c.iso2}/></label>
                        <label className="label">{ct("Region")}<select name="region" className="input" defaultValue={c.region??"Europe"}>{REGIONS.map(region=><option key={region} value={region}>{ct(region)}</option>)}</select></label>
                        <label className="label">{ct("Sort order")}<input name="sortOrder" type="number" min={0} className="input" defaultValue={c.sortOrder}/></label>
                        <SubmitButton className="btn-primary btn-sm" pendingLabel={ct("Saving…")}>{ct("Save")}</SubmitButton>
                      </form>
                    </details>
                    <form action={updateCountryAction} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="name" value={c.name} />
                      <input type="hidden" name="iso2" value={c.iso2} />
                      <input type="hidden" name="region" value={c.region ?? ""} />
                      <input type="hidden" name="sortOrder" value={c.sortOrder} />
                      <input type="hidden" name="toggle" value="1" />
                      <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                        {ct(c.active ? "Deactivate" : "Activate")}
                      </SubmitButton>
                    </form>
                    <form action={deleteCountryAction} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <SubmitButton className="btn-danger btn-sm" pendingLabel="…">{ct("Delete")}</SubmitButton>
                    </form>
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="td py-8 text-center text-slate-500">{ct("No countries found")}{q ? ` ${ct("for")} “${q}”` : ""}.</td></tr>
          ) : null}
        </tbody>
      </TableWrap>

      {canManage ? (
        <div className="mt-8">
          <h2 className="mb-4 font-serif text-xl text-navy-900">{ct("Add country")}</h2>
          <form action={createCountryAction} className="card grid grid-cols-1 gap-4 p-6 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="label">{ct("Name")} *</label>
              <input name="name" required className="input" placeholder="Portugal" />
            </div>
            <div>
              <label className="label">ISO-2 *</label>
              <input name="iso2" required maxLength={2} minLength={2} className="input uppercase" placeholder="PT" />
            </div>
            <div>
              <label className="label">{ct("Region")}</label>
              <select name="region" className="input">{REGIONS.map(region=><option key={region} value={region}>{ct(region)}</option>)}</select>
            </div>
            <label className="label">{ct("Name")} · FR<input name="nameFr" className="input"/></label>
            <label className="label">{ct("Name")} · AR<input name="nameAr" className="input" dir="rtl"/></label>
            <div className="sm:col-span-4">
              <SubmitButton className="btn-primary" pendingLabel={ct("Saving…")}>{ct("Add country")}</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
