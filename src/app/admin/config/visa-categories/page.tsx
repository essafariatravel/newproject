import Link from "next/link";
import { count } from "drizzle-orm";
import { ConfigDialog } from "@/components/config-dialog";
import { ConfigTranslations } from "@/components/config-translations";
import { ConfirmButton, SubmitButton } from "@/components/forms";
import { PageSizeSelector } from "@/components/app-widgets";
import { ActiveBadge, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import { pageUser } from "@/lib/page-auth";
import { getUiLocale, type UiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { configDescription, configMatches, configName } from "@/lib/config-localization";
import { hasPermission } from "@/lib/rbac";
import { listVisaCategories } from "@/lib/applications-exports";
import { resolvePageSize } from "@/lib/queries";
import { db } from "@/lib/db";
import { visaCategories, visaTypes } from "@/db/schema";
import { flashFrom } from "@/lib/action-helpers";
import { createVisaCategoryAction, deleteVisaCategoryAction, updateVisaCategoryAction } from "@/app/actions/config";

export const dynamic = "force-dynamic";

type Category = typeof visaCategories.$inferSelect;

function CategoryFields({ value, locale }: { value?: Category; locale: UiLocale }) {
  const ct = contentT(locale);
  return <>
    {value ? <input type="hidden" name="id" value={value.id} /> : null}
    <label className="block text-base">{ct("Name *")} · EN
      <input name="name" required minLength={2} maxLength={60} defaultValue={value?.name} dir="ltr" className="input mt-1" />
    </label>
    <label className="block text-base">{ct("Code *")}
      <input name="code" required minLength={2} maxLength={40} defaultValue={value?.code} readOnly={!!value} dir="ltr" className="input mt-1 uppercase" />
    </label>
    <label className="block text-base sm:col-span-2">{ct("Description")} · EN
      <textarea name="description" maxLength={500} rows={2} defaultValue={value?.description ?? ""} dir="ltr" className="input mt-1" />
    </label>
    <ConfigTranslations value={value} locale={locale} />
    <label className="block text-base">{ct("Sort order")}
      <input name="sortOrder" type="number" min={0} max={9999} defaultValue={value?.sortOrder ?? 0} className="input mt-1" />
    </label>
    <div className="sm:col-span-2"><SubmitButton className="btn-primary" pendingLabel={ct("Saving…")}>{ct(value ? "Save" : "Add category")}</SubmitButton></div>
  </>;
}

export default async function VisaCategoriesConfigPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const staff = await pageUser();
  const locale = await getUiLocale();
  const ct = contentT(locale);
  if (!hasPermission(staff, "config.view")) return <div className="card"><EmptyState title={ct("Not authorized")} /></div>;
  const [allRows, usageRows] = await Promise.all([
    listVisaCategories(),
    db.select({ id: visaTypes.categoryId, total: count() }).from(visaTypes).groupBy(visaTypes.categoryId),
  ]);
  const usage = new Map(usageRows.map((row) => [row.id, row.total]));
  const canManage = hasPermission(staff, "config.manage");
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = sp.status === "active" || sp.status === "inactive" ? sp.status : "";
  const rows = allRows.filter((row) => configMatches(row, q) && (!status || row.active === (status === "active")));
  const per = resolvePageSize(sp.per);
  const pageCount = Math.max(1, Math.ceil(rows.length / per));
  const page = Math.min(pageCount, Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));
  const paged = rows.slice((page - 1) * per, page * per);
  const pageHref = (next: number) => `/admin/config/visa-categories?${new URLSearchParams({ q, status, per: String(per), page: String(next) })}`;

  return <>
    <PageHeader title={ct("Visa categories")} subtitle={ct("Top-level visa families: tourist, business, student…")} />
    <Flash {...flashFrom(sp)} />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <form className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder={ct("Search categories…")} aria-label={ct("Search categories…")} className="input w-64 text-base" />
        <select name="status" defaultValue={status} aria-label={ct("Status")} className="input w-auto text-base">
          <option value="">{ct("All statuses")}</option><option value="active">{ct("Active")}</option><option value="inactive">{ct("Inactive")}</option>
        </select>
        <input type="hidden" name="per" value={per} />
        <button className="btn-secondary btn-sm" type="submit">{ct("Search")}</button>
        {q || status ? <Link href="/admin/config/visa-categories" className="btn-secondary btn-sm">{ct("Clear")}</Link> : null}
      </form>
      {canManage ? <ConfigDialog title={ct("Add category")} closeLabel={ct("Close")}>
        <form action={createVisaCategoryAction} className="grid gap-4 sm:grid-cols-2"><CategoryFields locale={locale} /></form>
      </ConfigDialog> : null}
    </div>
    <TableWrap>
      <thead className="border-b border-slate-100 bg-ivory-50/60"><tr>
        <th className="th">{ct("Category")}</th><th className="th">{ct("Code")}</th><th className="th">{ct("Description")}</th>
        <th className="th">{ct("Visa types usage")}</th><th className="th">{ct("Status")}</th>{canManage ? <th className="th text-end">{ct("Actions")}</th> : null}
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {paged.map((row) => <tr key={row.id} className="tr-hover">
          <td className="td font-semibold text-navy-900">{configName(row, locale)}</td>
          <td className="td"><span className="badge bg-navy-900/5 text-navy-800">{row.code}</span></td>
          <td className="td max-w-[320px] truncate text-xs text-slate-500" title={configDescription(row, locale)}>{configDescription(row, locale) || "—"}</td>
          <td className="td tabular-nums">{usage.get(row.id) ?? 0}</td>
          <td className="td"><ActiveBadge active={row.active} locale={locale} /></td>
          {canManage ? <td className="td"><div className="flex flex-wrap justify-end gap-2">
            <ConfigDialog title={ct("Edit category")} closeLabel={ct("Close")}>
              <form action={updateVisaCategoryAction} className="grid gap-4 sm:grid-cols-2"><CategoryFields value={row} locale={locale} /></form>
            </ConfigDialog>
            <form action={updateVisaCategoryAction}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="toggle" value="1" />
              <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">{ct(row.active ? "Deactivate" : "Activate")}</SubmitButton>
            </form>
            {(usage.get(row.id) ?? 0) === 0 ? <form action={deleteVisaCategoryAction}><input type="hidden" name="id" value={row.id} />
              <ConfirmButton className="btn-danger btn-sm" message={ct("Delete this unused category?")}>{ct("Delete category")}</ConfirmButton>
            </form> : null}
          </div></td> : null}
        </tr>)}
        {!paged.length ? <tr><td colSpan={canManage ? 6 : 5} className="td py-8 text-center text-slate-500">{ct("No categories configured.")}</td></tr> : null}
      </tbody>
    </TableWrap>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-xs">
      <span className="text-slate-500">{ct("Page")} {page} / {pageCount} — {rows.length} {ct("total")}</span>
      <div className="flex gap-2">{page > 1 ? <Link href={pageHref(page - 1)} className="btn-secondary btn-sm">{ct("← Prev")}</Link> : null}{page < pageCount ? <Link href={pageHref(page + 1)} className="btn-secondary btn-sm">{ct("Next →")}</Link> : null}</div>
      <PageSizeSelector pageSize={per} basePath="/admin/config/visa-categories" query={{ q, status }} />
    </div>
  </>;
}
