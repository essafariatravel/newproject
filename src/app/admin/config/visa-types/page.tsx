import { ConfigDialog } from "@/components/config-dialog";
import { ConfigTranslations } from "@/components/config-translations";
import { count } from "drizzle-orm";
import { db } from "@/lib/db";
import { visaRequirements } from "@/db/schema";
import { configMatches, configName } from "@/lib/config-localization";
import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { NavigableTableRow } from "@/components/navigable-table-row";
import { countryName as localizedCountryName } from "@/lib/country-names";
import { hasPermission } from "@/lib/rbac";
import { listCountries, listVisaCategories, listVisaTypesWithRelations } from "@/lib/applications-exports";
import { resolvePageSize } from "@/lib/queries";
import { PageSizeSelector } from "@/components/app-widgets";
import { flashFrom } from "@/lib/action-helpers";
import { createVisaTypeAction, updateVisaTypeAction } from "@/app/actions/config";
import { formatAmount, formatProcessingDays } from "@/lib/format";
import { SubmitButton } from "@/components/forms";
import { ActiveBadge, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";


export default async function VisaTypesConfigPage({
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
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = sp.status === "active" || sp.status === "inactive" ? sp.status : "";
  const countryId = typeof sp.countryId === "string" ? sp.countryId : "";
  const categoryId = typeof sp.categoryId === "string" ? sp.categoryId : "";
  const uiLocale = await getUiLocale(sp);
  const [allRows, countries, categories, requirementCounts] = await Promise.all([
    listVisaTypesWithRelations(),
    listCountries(),
    listVisaCategories(),
    db.select({ id: visaRequirements.visaTypeId, total: count() }).from(visaRequirements).groupBy(visaRequirements.visaTypeId),
  ]);
  const canManage = hasPermission(staff, "config.manage");
  const activeCountries = countries.filter((c) => c.active);
  const countryLabels = new Map(countries.map((c) => [c.name, localizedCountryName(c, locale)]));
  const activeCategories = categories.filter((c) => c.active);
  const categoryLabels = new Map(categories.map((c) => [c.id, configName(c, locale)]));
  const documents = new Map(requirementCounts.map((row) => [row.id, row.total]));

  let rows = allRows.filter(({ vt }) => (!status || vt.active === (status === "active")) && (!countryId || vt.countryId === countryId) && (!categoryId || vt.categoryId === categoryId));
  if (q) {
    const lower = q.toLowerCase();
    rows = rows.filter(({ vt, countryName, categoryName }) =>
      configMatches(vt, q) ||
      (countryLabels.get(countryName) ?? "").toLocaleLowerCase().includes(lower) ||
      (categoryLabels.get(vt.categoryId) ?? "").toLocaleLowerCase().includes(lower) ||
      countryName.toLowerCase().includes(lower) ||
      categoryName.toLowerCase().includes(lower)
    );
  }
  const total = rows.length;
  const per = resolvePageSize(sp.per);
  const pageCount = Math.max(1, Math.ceil(total / per));
  const page = Math.min(pageCount, Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));
  const paged = rows.slice((page - 1) * per, page * per);
  const filterQuery = { q, status, countryId, categoryId };

  return (
    <>
      <PageHeader
        title={ct("Visa types")}
        subtitle={ct("Service catalogue — DZD only. Fees snapshotted at application creation.")}
        actions={
          <form className="flex flex-wrap items-center gap-2">
            <input name="q" defaultValue={q} aria-label={ct("Search visa, country, code…")} placeholder={ct("Search visa, country, code…")} className="input w-64 text-base" />
            <select name="countryId" defaultValue={countryId} aria-label={ct("Country")} className="input w-auto text-base"><option value="">{ct("All countries")}</option>{countries.map((c) => <option key={c.id} value={c.id}>{localizedCountryName(c, locale)}</option>)}</select>
            <select name="categoryId" defaultValue={categoryId} aria-label={ct("Category")} className="input w-auto text-base"><option value="">{ct("All categories")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{configName(c, locale)}</option>)}</select>
            <select name="status" defaultValue={status} aria-label={ct("Status")} className="input w-auto text-base"><option value="">{ct("All statuses")}</option><option value="active">{ct("Active")}</option><option value="inactive">{ct("Inactive")}</option></select>
            <input type="hidden" name="per" value={per} />
            <button type="submit" className="btn-secondary btn-sm">{ct("Search")}</button>
            {q || status || countryId || categoryId ? <Link href="/admin/config/visa-types" className="btn-secondary btn-sm">{ct("Clear")}</Link> : null}
          </form>
        }
      />
      <Flash {...flash} />
      <div className="mb-5">
      {canManage ? (
        <ConfigDialog title={ct("Add visa type (DZD only)")} closeLabel={ct("Close")}>

          <form action={createVisaTypeAction} className="card grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="new-visa-name">{ct("Name *")} · EN</label>
              <input id="new-visa-name" name="name" required minLength={2} maxLength={120} dir="ltr" className="input" placeholder="Portugal Schengen Tourist Visa" />
            </div>
            <div>
              <label className="label">{ct("Code *")}</label>
              <input name="code" required className="input uppercase" placeholder="PT-SCH-TOUR" />
            </div>
            <div>
              <label className="label">{ct("Country *")}</label>
              <select name="countryId" required className="input">
                {activeCountries.map((c) => (
                  <option key={c.id} value={c.id}>{localizedCountryName(c, locale)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{ct("Category *")}</label>
              <select name="categoryId" required className="input">
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>{configName(c, locale)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{ct("Fee (DZD) *")}</label>
              <input name="fee" type="number" step="0.01" min="0" required className="input" placeholder="12000.00" />
              <input type="hidden" name="currency" value="DZD" />
            </div>
            <div>
              <label className="label">{ct("Processing min days *")}</label>
              <input name="processingMinDays" type="number" min="0" required className="input" defaultValue={5} />
            </div>
            <div>
              <label className="label">{ct("Processing max days *")}</label>
              <input name="processingMaxDays" type="number" min="0" required className="input" defaultValue={15} />
            </div>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="new-visa-description">{ct("Description")} · EN</label>
              <textarea id="new-visa-description" name="description" rows={2} maxLength={1000} dir="ltr" className="input" />
            </div>
            <div className="sm:col-span-3">
              <SubmitButton className="btn-primary" pendingLabel={ct("Saving…")}>{ct("Add visa type")}</SubmitButton>
            </div>
            <ConfigTranslations locale={locale} />
          </form>
        </ConfigDialog>
      ) : null}
      </div>

      <TableWrap>
        <thead className="border-b border-slate-100 bg-ivory-50/60">
          <tr>
            <th className="th">{ct("Visa type")}</th>
            <th className="th">{ct("Country")}</th>
            <th className="th">{ct("Category")}</th>
            <th className="th">{ct("Fee (DZD)")}</th>
            <th className="th">{ct("Processing")}</th>
            <th className="th">{ct("Documents")}</th>
            <th className="th">{ct("Status")}</th>
            <th className="th"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {paged.map(({ vt, countryName, categoryName }) => (
            <NavigableTableRow key={vt.id} href={`/admin/config/visa-types/${vt.id}`} className="tr-hover">
              <td className="td">
                <Link href={`/admin/config/visa-types/${vt.id}`} className="font-semibold text-navy-900 hover:underline">
                  {configName(vt, locale)}
                </Link>
                <span className="block text-xs text-slate-400">{vt.code}</span>
              </td>
              <td className="td">{countryLabels.get(countryName) ?? countryName}</td>
              <td className="td">{categoryLabels.get(vt.categoryId) ?? categoryName}</td>
              <td className="td whitespace-nowrap tabular-nums">{formatAmount(vt.fee, "DZD", uiLocale)}</td>
              <td className="td whitespace-nowrap text-xs">{formatProcessingDays(vt.processingMinDays, vt.processingMaxDays, locale)}</td>
              <td className="td tabular-nums">{documents.get(vt.id) ?? 0}</td>
              <td className="td"><ActiveBadge active={vt.active} locale={locale} /></td>
              <td className="td text-right">
        {canManage ? (
                  <form action={updateVisaTypeAction} className="inline">
                    <input type="hidden" name="id" value={vt.id} />
                    <input type="hidden" name="toggle" value="1" />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                      {ct(vt.active ? "Deactivate" : "Activate")}
                    </SubmitButton>
                  </form>
                ) : null}
              </td>
            </NavigableTableRow>
          ))}
          {paged.length === 0 ? (
            <tr><td colSpan={8} className="td py-8 text-center text-slate-500">{ct("No visa types found")}{q ? ` ${ct("for")} “${q}”` : ""}.</td></tr>
          ) : null}
        </tbody>
      </TableWrap>

      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-slate-500">{ct("Page")} {page} / {pageCount} — {total} {ct("total")}</span>
          <span className="flex gap-1.5">
            {page > 1 ? <Link href={`/admin/config/visa-types?${new URLSearchParams({ ...filterQuery, ...(per !== 20 ? { per: String(per) } : {}), page: String(page - 1) }).toString()}`} className="btn-secondary btn-sm">{ct("← Prev")}</Link> : null}
            {page < pageCount ? <Link href={`/admin/config/visa-types?${new URLSearchParams({ ...filterQuery, ...(per !== 20 ? { per: String(per) } : {}), page: String(page + 1) }).toString()}`} className="btn-secondary btn-sm">{ct("Next →")}</Link> : null}
          </span>
        </div>
      ) : null}

      <div className="mt-2 flex justify-end">
        <PageSizeSelector pageSize={per} basePath="/admin/config/visa-types" query={filterQuery} />
      </div>


    </>
  );
}
