import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { hasPermission } from "@/lib/rbac";
import { listVisaCategories } from "@/lib/applications-exports";
import { flashFrom } from "@/lib/action-helpers";
import { createVisaCategoryAction, updateVisaCategoryAction } from "@/app/actions/config";
import { SubmitButton } from "@/components/forms";
import { ActiveBadge, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VisaCategoriesConfigPage({
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
  const rows = await listVisaCategories();
  const canManage = hasPermission(staff, "config.manage");

  return (
    <>
      <PageHeader title={ct("Visa categories")} subtitle={ct("Top-level visa families: tourist, business, student…")} />
      <Flash {...flash} />

      <TableWrap>
        <thead className="border-b border-slate-100 bg-ivory-50/60">
          <tr>
            <th className="th">{ct("Category")}</th>
            <th className="th">{ct("Code")}</th>
            <th className="th">{ct("Description")}</th>
            <th className="th">{ct("Status")}</th>
            {canManage ? <th className="th text-right">{ct("Actions")}</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((c) => (
            <tr key={c.id} className="tr-hover">
              <td className="td font-medium text-navy-900">{c.name}</td>
              <td className="td"><span className="badge bg-navy-900/5 text-navy-800">{c.code}</span></td>
              <td className="td max-w-[320px] truncate text-xs text-slate-500">{c.description ?? "—"}</td>
              <td className="td"><ActiveBadge active={c.active} locale={locale} /></td>
              {canManage ? (
                <td className="td text-right">
                  <form action={updateVisaCategoryAction} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="name" value={c.name} />
                    <input type="hidden" name="code" value={c.code} />
                    <input type="hidden" name="description" value={c.description ?? ""} />
                    <input type="hidden" name="sortOrder" value={c.sortOrder} />
                    <input type="hidden" name="toggle" value="1" />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                      {ct(c.active ? "Deactivate" : "Activate")}
                    </SubmitButton>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="td py-8 text-center text-slate-500">{ct("No categories configured.")}</td></tr>
          ) : null}
        </tbody>
      </TableWrap>

      {canManage ? (
        <div className="mt-8">
          <h2 className="mb-3 font-serif text-xl text-navy-900">{ct("Add category")}</h2>
          <form action={createVisaCategoryAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="name">{ct("Name *")}</label>
              <input id="name" name="name" required className="input" placeholder="Transit" />
            </div>
            <div>
              <label className="label" htmlFor="code">{ct("Code *")}</label>
              <input id="code" name="code" required className="input uppercase" placeholder="TRANSIT" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="description">{ct("Description")}</label>
              <input id="description" name="description" className="input" />
            </div>
            <div className="sm:col-span-4">
              <SubmitButton className="btn-primary" pendingLabel={ct("Saving…")}>{ct("Add category")}</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
