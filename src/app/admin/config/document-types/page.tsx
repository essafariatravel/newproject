import { ConfigDialog } from "@/components/config-dialog";
import { ConfigTranslations } from "@/components/config-translations";
import { count } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentTypes, visaRequirements } from "@/db/schema";
import { configDescription, configMatches, configName } from "@/lib/config-localization";
import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { getUiLocale, type UiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { hasPermission } from "@/lib/rbac";
import { listDocumentTypes } from "@/lib/applications-exports";
import { resolvePageSize } from "@/lib/queries";
import { PageSizeSelector } from "@/components/app-widgets";
import { flashFrom } from "@/lib/action-helpers";
import { createDocumentTypeAction, deleteDocumentTypeAction, updateDocumentTypeAction } from "@/app/actions/config";
import { ConfirmButton, SubmitButton } from "@/components/forms";
import { ActiveBadge, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

function DocumentFields({ value, locale }: { value?: typeof documentTypes.$inferSelect; locale: UiLocale }) {
  const ct = contentT(locale);
  return <>
    {value ? <input type="hidden" name="id" value={value.id} /> : null}
    <label className="block text-sm">{ct("Name *")} · EN
      <input name="name" required minLength={2} maxLength={80} defaultValue={value?.name} dir="ltr" className="input mt-1" />
    </label>
    <label className="block text-sm">{ct("Code *")}
      <input name="code" required minLength={2} maxLength={40} defaultValue={value?.code} readOnly={!!value} dir="ltr" className="input mt-1 uppercase" />
    </label>
    <label className="block text-sm sm:col-span-2">{ct("Description")} · EN
      <textarea name="description" maxLength={500} rows={2} defaultValue={value?.description ?? ""} dir="ltr" className="input mt-1" />
    </label>
    <ConfigTranslations value={value} locale={locale} />
    <label className="block text-sm">{ct("Provided by")}
      <select name="agencyUploadable" className="input mt-1" defaultValue={value?.agencyUploadable === false ? "0" : "1"}>
        <option value="1">{ct("Agency uploads it")}</option><option value="0">{ct("ESSAFARIA / authority issues it")}</option>
      </select>
    </label>
    <label className="block text-sm">{ct("Sort order")}
      <input name="sortOrder" type="number" min={0} max={9999} defaultValue={value?.sortOrder ?? 0} className="input mt-1" />
    </label>
    <div className="sm:col-span-2"><SubmitButton className="btn-primary" pendingLabel={ct("Saving…")}>{ct(value ? "Save" : "Add document type")}</SubmitButton></div>
  </>;
}

export default async function DocumentTypesConfigPage({
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
  const [allRows, usageRows] = await Promise.all([
    listDocumentTypes(),
    db.select({ id: visaRequirements.documentTypeId, total: count() }).from(visaRequirements).groupBy(visaRequirements.documentTypeId),
  ]);
  const usage = new Map(usageRows.map((row) => [row.id, row.total]));
  const canManage = hasPermission(staff, "config.manage");

  const rows = allRows.filter((d) => configMatches(d, q) && (!status || d.active === (status === "active")));
  const total = rows.length;
  const per = resolvePageSize(sp.per);
  const pageCount = Math.max(1, Math.ceil(total / per));
  const page = Math.min(pageCount, Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));
  const paged = rows.slice((page - 1) * per, page * per);

  return (
    <>
      <PageHeader
        title={ct("Document types")}
        subtitle={ct("Catalogue used by visa requirements and checklists.")}
        actions={
          <form className="flex flex-wrap items-center gap-2">
            <input name="q" defaultValue={q} placeholder={ct("Search document type…")} aria-label={ct("Search document type…")} className="input w-64 text-sm" />
            <select name="status" defaultValue={status} aria-label={ct("Status")} className="input w-auto text-sm">
              <option value="">{ct("All statuses")}</option><option value="active">{ct("Active")}</option><option value="inactive">{ct("Inactive")}</option>
            </select>
            <input type="hidden" name="per" value={per} />
            <button type="submit" className="btn-secondary btn-sm">{ct("Search")}</button>
            {q || status ? <Link href="/admin/config/document-types" className="btn-secondary btn-sm">{ct("Clear")}</Link> : null}
          </form>
        }
      />
      <Flash {...flash} />
      <div className="mb-6">
      {canManage ? (
        <ConfigDialog title={ct("Add document type")} closeLabel={ct("Close")}>

          <form action={createDocumentTypeAction} className="grid gap-4 sm:grid-cols-2"><DocumentFields locale={locale} /></form>
        </ConfigDialog>
      ) : null}
      </div>

      <TableWrap>
        <thead className="border-b border-slate-100 bg-ivory-50/60">
          <tr>
            <th className="th">{ct("Document type")}</th>
            <th className="th">{ct("Code")}</th>
            <th className="th">{ct("Description")}</th>
            <th className="th">{ct("Sort")}</th>
            <th className="th">{ct("Used by")}</th>
            <th className="th">{ct("Agency upload")}</th>
            <th className="th">{ct("Status")}</th>
            {canManage ? <th className="th text-right">{ct("Actions")}</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {paged.map((d) => (
            <tr key={d.id} className="tr-hover">
              <td className="td font-medium text-navy-900">{configName(d, locale)}</td>
              <td className="td"><span className="badge bg-navy-900/5 text-navy-800">{d.code}</span></td>
              <td className="td max-w-[320px] truncate text-xs text-slate-500" title={configDescription(d, locale)}>{configDescription(d, locale) || "—"}</td>
              <td className="td tabular-nums text-xs">{d.sortOrder}</td>
              <td className="td tabular-nums text-xs">{usage.get(d.id) ?? 0} {ct("Visa types")}</td>
              <td className="td">
                {d.agencyUploadable ? (
                  <span className="badge bg-teal-50 text-teal-700">{ct("Agency")}</span>
                ) : (
                  <span className="badge bg-navy-900/5 text-navy-800">{ct("ESSAFARIA issued")}</span>
                )}
              </td>
              <td className="td"><ActiveBadge active={d.active} locale={locale} /></td>
      {canManage ? (
                <td className="td text-end"><div className="flex flex-wrap justify-end gap-2">
                  <ConfigDialog title={ct("Edit document type")} closeLabel={ct("Close")}>
                    <form action={updateDocumentTypeAction} className="grid gap-4 sm:grid-cols-2"><DocumentFields value={d} locale={locale} /></form>
                  </ConfigDialog>
                  <form action={updateDocumentTypeAction} className="inline">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="name" value={d.name} />
                    <input type="hidden" name="code" value={d.code} />
                    <input type="hidden" name="description" value={d.description ?? ""} />
                    <input type="hidden" name="sortOrder" value={d.sortOrder} />
                    <input type="hidden" name="agencyUploadable" value={d.agencyUploadable ? "1" : "0"} />
                    <input type="hidden" name="toggle" value="1" />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                      {ct(d.active ? "Deactivate" : "Activate")}
                    </SubmitButton>
                  </form>
                  <form action={deleteDocumentTypeAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <ConfirmButton className="btn-danger btn-sm" message={ct("Delete this unused document type?")} title={ct("Only unused configuration can be deleted. Referenced records must be deactivated.")}>{ct("Delete document type")}</ConfirmButton>
                  </form>
                </div></td>
              ) : null}
            </tr>
          ))}
          {paged.length === 0 ? (
            <tr><td colSpan={canManage ? 8 : 7} className="td py-8 text-center text-slate-500">{ct("No document types found")}{q ? ` ${ct("for")} “${q}”` : ""}.</td></tr>
          ) : null}
        </tbody>
      </TableWrap>

      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-slate-500">{ct("Page")} {page} / {pageCount} — {total} {ct("total")}</span>
          <span className="flex gap-2">
            {page > 1 ? <Link href={`/admin/config/document-types?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(per !== 20 ? { per: String(per) } : {}), page: String(page - 1) }).toString()}`} className="btn-secondary btn-sm">{ct("← Prev")}</Link> : null}
            {page < pageCount ? <Link href={`/admin/config/document-types?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(per !== 20 ? { per: String(per) } : {}), page: String(page + 1) }).toString()}`} className="btn-secondary btn-sm">{ct("Next →")}</Link> : null}
          </span>
        </div>
      ) : null}

      <div className="mt-2 flex justify-end">
        <PageSizeSelector pageSize={per} basePath="/admin/config/document-types" query={{ q, status }} />
      </div>


    </>
  );
}
