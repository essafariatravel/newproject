import { pageUser } from "@/lib/page-auth";
import { getUiLocale, localizedStatusName } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { hasPermission } from "@/lib/rbac";
import { listStatuses, listTransitions } from "@/lib/applications";
import { flashFrom } from "@/lib/action-helpers";
import { addTransitionAction, createStatusAction, deleteStatusAction, updateStatusAction } from "@/app/actions/config";
import { SubmitButton } from "@/components/forms";
import { ActiveBadge, Card, CardHeader, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import { StatusBadge } from "@/components/badges";

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
  const locale = await getUiLocale();
  const ct = contentT(locale);
  if (!hasPermission(staff, "config.view")) {
    return <div className="card"><EmptyState title={ct("Not authorized")} /></div>;
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
        title={ct("Statuses & transitions")}
        subtitle={ct("The application workflow is data-driven: statuses below and their permitted transitions.")}
      />
      <Flash {...flash} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={ct("Status catalog")} />
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">{ct("Status")}</th>
                <th className="th">{ct("Code")}</th>
                <th className="th">{ct("Flags")}</th>
                <th className="th">{ct("Status")}</th>
                {canManage ? <th className="th">{ct("Actions")}</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id} className="tr-hover">
                  <td className="td"><StatusBadge code={s.code} name={localizedStatusName(s.code, s.name, locale, s.nameFr, s.nameAr)} /></td>
                  <td className="td text-xs text-slate-500">{s.code}</td>
                  <td className="td">
                    {s.isTerminal ? <span className="badge bg-slate-200 text-slate-600">{ct("Terminal")}</span> : null}
                    {s.isDraft ? <span className="badge bg-ivory-100 text-slate-600">{ct("Draft-like")}</span> : null}
                  </td>
                  <td className="td"><ActiveBadge active={s.active} locale={locale} /></td>
                  {canManage ? (
                    <td className="td">
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={updateStatusAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="toggle" value="1" />
                          <SubmitButton className="btn-secondary btn-xs" pendingLabel="…">
                            {ct(s.active ? "Deactivate" : "Activate")}
                          </SubmitButton>
                        </form>
                        <details className="relative">
                          <summary className="btn-danger btn-xs cursor-pointer list-none">{ct("Delete")}</summary>
                          <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-red-100 bg-white p-3 shadow-lg">
                            <p className="text-xs text-navy-800">
                              {ct("Delete status")} <strong>{localizedStatusName(s.code, s.name, locale, s.nameFr, s.nameAr)}</strong> (<code>{s.code}</code>)? {ct("Referenced statuses are deactivated instead of deleted.")}
                            </p>
                            <form action={deleteStatusAction} className="mt-2">
                              <input type="hidden" name="id" value={s.id} />
                              <SubmitButton className="btn-danger btn-xs" pendingLabel="…">
                                Confirm delete
                              </SubmitButton>
                            </form>
                          </div>
                        </details>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader title={ct("Transition matrix")} subtitle={ct("Which status changes are permitted, and by whom.")} />
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
            {transitions.length === 0 ? <p className="text-sm text-slate-500">{ct("No transitions configured.")}</p> : null}
          </div>
        </Card>
      </div>

      {canManage ? (
        <div className="mt-4">
          <Card>
            <CardHeader title={ct("Edit status labels & ordering")} subtitle={ct("EN label + FR / AR display labels. Codes never change; business logic uses codes.")} />
            <TableWrap>
              <thead className="border-b border-slate-100 bg-ivory-50/60">
                <tr>
                  <th className="th">{ct("Code")}</th>
                  <th className="th">{ct("EN label")}</th>
                  <th className="th">{ct("FR label")}</th>
                  <th className="th">{ct("AR label")}</th>
                  <th className="th">{ct("Order")}</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((s) => (
                  <tr key={s.id} className="tr-hover align-middle">
                    <td className="td text-xs text-slate-500">{s.code}</td>
                    <form action={updateStatusAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <td className="td py-2"><input name="name" defaultValue={s.name} required className="input input-sm w-44" /></td>
                      <td className="td py-2"><input name="nameFr" defaultValue={s.nameFr ?? ""} className="input input-sm w-44" /></td>
                      <td className="td py-2" dir="rtl"><input name="nameAr" defaultValue={s.nameAr ?? ""} className="input input-sm w-44" /></td>
                      <td className="td py-2"><input name="sortOrder" type="number" defaultValue={s.sortOrder} className="input input-sm w-20" /></td>
                      <td className="td py-2">
                        <SubmitButton className="btn-primary btn-xs" pendingLabel="…">{ct("Save")}</SubmitButton>
                      </td>
                    </form>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title={ct("Add status")} />
            <form action={createStatusAction} className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="s-name">{ct("Name *")}</label>
                <input id="s-name" name="name" required className="input" placeholder="Visa Issued" />
              </div>
              <div>
                <label className="label" htmlFor="s-code">{ct("Code *")}</label>
                <input id="s-code" name="code" required className="input uppercase" placeholder="VISA_ISSUED" />
              </div>
              <div>
                <label className="label" htmlFor="s-order">{ct("Sort order")}</label>
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
              <div>
                <label className="label" htmlFor="s-name-fr">{ct("Label FR")}</label>
                <input id="s-name-fr" name="nameFr" className="input" placeholder="Ex. Visa délivré" />
              </div>
              <div dir="rtl">
                <label className="label" htmlFor="s-name-ar">{ct("Label AR")}</label>
                <input id="s-name-ar" name="nameAr" className="input" placeholder="مثال: تأشيرة صادرة" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="s-desc">{ct("Description")}</label>
                <input id="s-desc" name="description" className="input" />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton className="btn-primary" pendingLabel={ct("Saving…")}>{ct("Add status")}</SubmitButton>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader title={ct("Add transition")} subtitle={ct("Connect two statuses and define who may perform the change.")} />
            <form action={addTransitionAction} className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="t-from">{ct("From *")}</label>
                <select id="t-from" name="fromStatusId" required className="input">
                  {rows.map((s) => (
                    <option key={s.id} value={s.id}>{localizedStatusName(s.code, s.name, locale, s.nameFr, s.nameAr)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="t-to">{ct("To *")}</label>
                <select id="t-to" name="toStatusId" required className="input">
                  {rows.map((s) => (
                    <option key={s.id} value={s.id}>{localizedStatusName(s.code, s.name, locale, s.nameFr, s.nameAr)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="t-scope">{ct("Allowed for *")}</label>
                <select id="t-scope" name="scope" required className="input" defaultValue="STAFF">
                  <option value="STAFF">{ct("Staff only")}</option>
                  <option value="AGENCY">{ct("Agency only")}</option>
                  <option value="BOTH">{ct("Staff & agency")}</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <SubmitButton className="btn-primary" pendingLabel={ct("Saving…")}>{ct("Add transition")}</SubmitButton>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
