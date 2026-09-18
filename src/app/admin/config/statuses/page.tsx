import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listStatuses, listTransitions } from "@/lib/applications";
import { flashFrom } from "@/lib/action-helpers";
import { addTransitionAction, createStatusAction } from "@/app/actions/config";
import { SubmitButton } from "@/components/forms";
import { ActiveBadge, Card, CardHeader, EmptyState, Flash, PageHeader, StatusBadge, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

const SCOPE_LABEL: Record<string, string> = {
  STAFF: "Staff only",
  AGENCY: "Agency only",
  BOTH: "Staff & agency",
};

export default async function StatusesConfigPage({
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
  const [rows, transitions] = await Promise.all([listStatuses(), listTransitions()]);
  const canManage = hasPermission(staff, "config.manage");
  const byFrom = new Map<string, typeof transitions>();
  for (const t of transitions) {
    const list = byFrom.get(t.fromCode) ?? [];
    list.push(t);
    byFrom.set(t.fromCode, list);
  }

  return (
    <>
      <PageHeader
        title="Statuses & transitions"
        subtitle="The application workflow is data-driven: statuses below and their permitted transitions."
      />
      <Flash {...flash} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Status catalog" />
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">Status</th>
                <th className="th">Code</th>
                <th className="th">Flags</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id} className="tr-hover">
                  <td className="td"><StatusBadge code={s.code} name={s.name} /></td>
                  <td className="td text-xs text-slate-500">{s.code}</td>
                  <td className="td">
                    {s.isTerminal ? <span className="badge bg-slate-200 text-slate-600">Terminal</span> : null}
                    {s.isDraft ? <span className="badge bg-ivory-100 text-slate-600">Draft-like</span> : null}
                  </td>
                  <td className="td"><ActiveBadge active={s.active} /></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader title="Transition matrix" subtitle="Which status changes are permitted, and by whom." />
          <div className="space-y-3 px-4 py-4">
            {[...byFrom.entries()].map(([from, list]) => (
              <div key={from}>
                <p className="mb-1.5 text-xs font-semibold text-navy-900">
                  <StatusBadge code={from} /> →
                </p>
                <div className="flex flex-wrap gap-2">
                  {list.map((t) => (
                    <span key={`${t.fromCode}-${t.toCode}`} className="badge bg-ivory-100 text-slate-600">
                      {t.toName}
                      <span className="text-[9px] uppercase tracking-wide text-gold-600">{SCOPE_LABEL[t.scope]}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {transitions.length === 0 ? <p className="text-sm text-slate-500">No transitions configured.</p> : null}
          </div>
        </Card>
      </div>

      {canManage ? (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Add status" />
            <form action={createStatusAction} className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="s-name">Name *</label>
                <input id="s-name" name="name" required className="input" placeholder="Visa Issued" />
              </div>
              <div>
                <label className="label" htmlFor="s-code">Code *</label>
                <input id="s-code" name="code" required className="input uppercase" placeholder="VISA_ISSUED" />
              </div>
              <div>
                <label className="label" htmlFor="s-order">Sort order</label>
                <input id="s-order" name="sortOrder" type="number" defaultValue={120} className="input" />
              </div>
              <div className="flex items-end gap-4 pb-1 text-xs text-slate-600">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="isTerminal" className="h-3.5 w-3.5" /> Terminal
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="isDraft" className="h-3.5 w-3.5" /> Draft-like
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="s-desc">Description</label>
                <input id="s-desc" name="description" className="input" />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton className="btn-primary" pendingLabel="Saving…">Add status</SubmitButton>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader title="Add transition" subtitle="Connect two statuses and define who may perform the change." />
            <form action={addTransitionAction} className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="t-from">From *</label>
                <select id="t-from" name="fromStatusId" required className="input">
                  {rows.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="t-to">To *</label>
                <select id="t-to" name="toStatusId" required className="input">
                  {rows.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="t-scope">Allowed for *</label>
                <select id="t-scope" name="scope" required className="input" defaultValue="STAFF">
                  <option value="STAFF">Staff only</option>
                  <option value="AGENCY">Agency only</option>
                  <option value="BOTH">Staff & agency</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <SubmitButton className="btn-primary" pendingLabel="Saving…">Add transition</SubmitButton>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
