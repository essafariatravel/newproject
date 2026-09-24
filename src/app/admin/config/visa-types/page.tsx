import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listCountries, listVisaCategories, listVisaTypesWithRelations } from "@/lib/applications-exports";
import { resolvePageSize } from "@/lib/queries";
import { PageSizeSelector } from "@/components/app-widgets";
import { flashFrom } from "@/lib/action-helpers";
import { createVisaTypeAction, updateVisaTypeAction } from "@/app/actions/config";
import { formatAmount, formatProcessingDays } from "@/lib/format";
import { getUiLocale } from "@/lib/ui-i18n";
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
  if (!hasPermission(staff, "config.view")) {
    return <div className="card"><EmptyState title="Not authorized" /></div>;
  }
  const flash = flashFrom(sp);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const uiLocale = await getUiLocale(sp);
  const [allRows, countries, categories] = await Promise.all([
    listVisaTypesWithRelations(),
    listCountries(),
    listVisaCategories(),
  ]);
  const canManage = hasPermission(staff, "config.manage");
  const activeCountries = countries.filter((c) => c.active);
  const activeCategories = categories.filter((c) => c.active);

  let rows = allRows;
  if (q) {
    const lower = q.toLowerCase();
    rows = rows.filter(({ vt, countryName, categoryName }) =>
      vt.name.toLowerCase().includes(lower) ||
      vt.code.toLowerCase().includes(lower) ||
      countryName.toLowerCase().includes(lower) ||
      categoryName.toLowerCase().includes(lower)
    );
  }
  const total = rows.length;
  const per = resolvePageSize(sp.per);
  const pageCount = Math.max(1, Math.ceil(total / per));
  const paged = rows.slice((page - 1) * per, page * per);

  return (
    <>
      <PageHeader
        title="Visa types"
        subtitle="Service catalogue — DZD only. Fees snapshotted at application creation."
        actions={
          <form className="flex items-center gap-2">
            <input name="q" defaultValue={q} placeholder="Search visa, country, code…" className="input w-64 text-sm" />
            <button type="submit" className="btn-secondary btn-sm">Search</button>
            {q ? <Link href="/admin/config/visa-types" className="btn-secondary btn-sm">Clear</Link> : null}
          </form>
        }
      />
      <Flash {...flash} />

      <TableWrap>
        <thead className="border-b border-slate-100 bg-ivory-50/60">
          <tr>
            <th className="th">Visa type</th>
            <th className="th">Country</th>
            <th className="th">Category</th>
            <th className="th">Fee (DZD)</th>
            <th className="th">Processing</th>
            <th className="th">Status</th>
            <th className="th"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {paged.map(({ vt, countryName, categoryName }) => (
            <tr key={vt.id} className="tr-hover">
              <td className="td">
                <Link href={`/admin/config/visa-types/${vt.id}`} className="font-medium text-navy-900 hover:underline">
                  {vt.name}
                </Link>
                <span className="block text-xs text-slate-400">{vt.code}</span>
              </td>
              <td className="td">{countryName}</td>
              <td className="td">{categoryName}</td>
              <td className="td whitespace-nowrap tabular-nums">{formatAmount(vt.fee, "DZD", uiLocale)}</td>
              <td className="td whitespace-nowrap text-xs">{formatProcessingDays(vt.processingMinDays, vt.processingMaxDays)}</td>
              <td className="td"><ActiveBadge active={vt.active} /></td>
              <td className="td text-right">
        {canManage ? (
                  <form action={updateVisaTypeAction} className="inline">
                    <input type="hidden" name="id" value={vt.id} />
                    <input type="hidden" name="toggle" value="1" />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                      {vt.active ? "Deactivate" : "Activate"}
                    </SubmitButton>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
          {paged.length === 0 ? (
            <tr><td colSpan={7} className="td py-8 text-center text-slate-500">No visa types found{q ? ` for “${q}”` : ""}.</td></tr>
          ) : null}
        </tbody>
      </TableWrap>

      {pageCount > 1 ? (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-slate-500">Page {page} / {pageCount} — {total} total</span>
          <span className="flex gap-1.5">
            {page > 1 ? <Link href={`/admin/config/visa-types?${new URLSearchParams({ ...(q ? { q } : {}), ...(per !== 20 ? { per: String(per) } : {}), page: String(page - 1) }).toString()}`} className="btn-secondary btn-sm">← Prev</Link> : null}
            {page < pageCount ? <Link href={`/admin/config/visa-types?${new URLSearchParams({ ...(q ? { q } : {}), ...(per !== 20 ? { per: String(per) } : {}), page: String(page + 1) }).toString()}`} className="btn-secondary btn-sm">Next →</Link> : null}
          </span>
        </div>
      ) : null}

      <div className="mt-2 flex justify-end">
        <PageSizeSelector pageSize={per} basePath="/admin/config/visa-types" query={{ q }} />
      </div>

      {canManage ? (
        <div className="mt-8">
          <h2 className="mb-3 font-serif text-xl text-navy-900">Add visa type (DZD only)</h2>
          <form action={createVisaTypeAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label">Name *</label>
              <input name="name" required className="input" placeholder="Portugal Schengen Tourist Visa" />
            </div>
            <div>
              <label className="label">Code *</label>
              <input name="code" required className="input uppercase" placeholder="PT-SCH-TOUR" />
            </div>
            <div>
              <label className="label">Country *</label>
              <select name="countryId" required className="input">
                {activeCountries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Category *</label>
              <select name="categoryId" required className="input">
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Fee (DZD) *</label>
              <input name="fee" type="number" step="0.01" min="0" required className="input" placeholder="12000.00" />
              <input type="hidden" name="currency" value="DZD" />
            </div>
            <div>
              <label className="label">Processing min days *</label>
              <input name="processingMinDays" type="number" min="0" required className="input" defaultValue={5} />
            </div>
            <div>
              <label className="label">Processing max days *</label>
              <input name="processingMaxDays" type="number" min="0" required className="input" defaultValue={15} />
            </div>
            <div className="sm:col-span-3">
              <label className="label">Description</label>
              <textarea name="description" rows={2} className="input" />
            </div>
            <div className="sm:col-span-3">
              <SubmitButton className="btn-primary" pendingLabel="Saving…">Add visa type</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
