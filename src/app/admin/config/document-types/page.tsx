import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listDocumentTypes } from "@/lib/applications-exports";
import { flashFrom } from "@/lib/action-helpers";
import { createDocumentTypeAction, updateDocumentTypeAction } from "@/app/actions/config";
import { SubmitButton } from "@/components/forms";
import { ActiveBadge, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DocumentTypesConfigPage({
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
  const rows = await listDocumentTypes();
  const canManage = hasPermission(staff, "config.manage");

  return (
    <>
      <PageHeader title="Document types" subtitle="The document catalogue used by visa requirements and checklists." />
      <Flash {...flash} />

      <TableWrap>
        <thead className="border-b border-slate-100 bg-ivory-50/60">
          <tr>
            <th className="th">Document type</th>
            <th className="th">Code</th>
            <th className="th">Description</th>
            <th className="th">Sort</th>
            <th className="th">Status</th>
            {canManage ? <th className="th text-right">Actions</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((d) => (
            <tr key={d.id} className="tr-hover">
              <td className="td font-medium text-navy-900">{d.name}</td>
              <td className="td"><span className="badge bg-navy-900/5 text-navy-800">{d.code}</span></td>
              <td className="td max-w-[320px] truncate text-xs text-slate-500">{d.description ?? "—"}</td>
              <td className="td tabular-nums text-xs">{d.sortOrder}</td>
              <td className="td"><ActiveBadge active={d.active} /></td>
              {canManage ? (
                <td className="td text-right">
                  <form action={updateDocumentTypeAction} className="inline">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="name" value={d.name} />
                    <input type="hidden" name="code" value={d.code} />
                    <input type="hidden" name="description" value={d.description ?? ""} />
                    <input type="hidden" name="sortOrder" value={d.sortOrder} />
                    <input type="hidden" name="toggle" value="1" />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                      {d.active ? "Deactivate" : "Activate"}
                    </SubmitButton>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="td py-8 text-center text-slate-500">No document types configured.</td></tr>
          ) : null}
        </tbody>
      </TableWrap>

      {canManage ? (
        <div className="mt-8">
          <h2 className="mb-3 font-serif text-xl text-navy-900">Add document type</h2>
          <form action={createDocumentTypeAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="name">Name *</label>
              <input id="name" name="name" required className="input" placeholder="Police Clearance" />
            </div>
            <div>
              <label className="label" htmlFor="code">Code *</label>
              <input id="code" name="code" required className="input uppercase" placeholder="POLICE_CLEARANCE" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="description">Description</label>
              <input id="description" name="description" className="input" />
            </div>
            <div className="sm:col-span-4">
              <SubmitButton className="btn-primary" pendingLabel="Saving…">Add document type</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
