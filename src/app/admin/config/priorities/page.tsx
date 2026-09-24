import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { hasPermission } from "@/lib/rbac";
import { listPriorities } from "@/lib/applications";
import { flashFrom } from "@/lib/action-helpers";
import { createPriorityAction, updatePriorityAction } from "@/app/actions/config";
import { SubmitButton } from "@/components/forms";
import { ActiveBadge, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import { PriorityBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function PrioritiesConfigPage({
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
  const rows = await listPriorities();
  const canManage = hasPermission(staff, "config.manage");

  return (
    <>
      <PageHeader title={ct("Priorities")} subtitle={ct("Application priority levels. Higher weight sorts earlier in operational queues.")} />
      <Flash {...flash} />

      <TableWrap>
        <thead className="border-b border-slate-100 bg-ivory-50/60">
          <tr>
            <th className="th">{ct("Priority")}</th>
            <th className="th">{ct("Code")}</th>
            <th className="th">{ct("Weight")}</th>
            <th className="th">{ct("Status")}</th>
            {canManage ? <th className="th text-right">{ct("Actions")}</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((p) => (
            <tr key={p.id} className="tr-hover">
              <td className="td"><PriorityBadge name={p.name} weight={p.weight} /></td>
              <td className="td text-xs text-slate-500">{p.code}</td>
              <td className="td tabular-nums">{p.weight}</td>
              <td className="td"><ActiveBadge active={p.active} locale={locale} /></td>
              {canManage ? (
                <td className="td text-right">
                  <form action={updatePriorityAction} className="inline">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="name" value={p.name} />
                    <input type="hidden" name="weight" value={p.weight} />
                    <input type="hidden" name="sortOrder" value={p.sortOrder} />
                    <input type="hidden" name="toggle" value="1" />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                      {ct(p.active ? "Deactivate" : "Activate")}
                    </SubmitButton>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="td py-8 text-center text-slate-500">{ct("No priorities configured.")}</td></tr>
          ) : null}
        </tbody>
      </TableWrap>

      {canManage ? (
        <div className="mt-8">
          <h2 className="mb-3 font-serif text-xl text-navy-900">{ct("Add priority")}</h2>
          <form action={createPriorityAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="name">{ct("Name *")}</label>
              <input id="name" name="name" required className="input" placeholder="Critical" />
            </div>
            <div>
              <label className="label" htmlFor="code">{ct("Code *")}</label>
              <input id="code" name="code" required className="input uppercase" placeholder="CRITICAL" />
            </div>
            <div>
              <label className="label" htmlFor="weight">{ct("Weight (0–100) *")}</label>
              <input id="weight" name="weight" type="number" min="0" max="100" required className="input" defaultValue={20} />
            </div>
            <div className="flex items-end">
              <SubmitButton className="btn-primary" pendingLabel={ct("Saving…")}>{ct("Add priority")}</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
