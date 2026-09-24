import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listDocumentTypes } from "@/lib/applications-exports";
import { resolvePageSize } from "@/lib/queries";
import { PageSizeSelector } from "@/components/app-widgets";
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
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const allRows = await listDocumentTypes();
  const canManage = hasPermission(staff, "config.manage");

  let rows = allRows;
  if (q) {
    const lower = q.toLowerCase();
    rows = rows.filter((d) => d.name.toLowerCase().includes(lower) || d.code.toLowerCase().includes(lower) || (d.description ?? "").toLowerCase().includes(lower));
  }
  const total = rows.length;
  const per = resolvePageSize(sp.per);
  const pageCount = Math.max(1, Math.ceil(total / per));
  const paged = rows.slice((page - 1) * per, page * per);

  return (
    <>
      <PageHeader
        title="Document types"
        subtitle="Catalogue used by visa requirements and checklists."
        actions={
          <form className="flex items-center gap-2">
            <input name="q" defaultValue={q} placeholder="Search document type…" className="input w-64 text-sm" />
            <button type="submit" className="btn-secondary btn-sm">Search</button>
            {q ? <Link href="/admin/config/document-types" className="btn-secondary btn-sm">Clear</Link> : null}
          </form>
        }
      />
      <Flash {...flash} />

      <TableWrap>
        <thead className="border-b border-slate-100 bg-ivory-50/60">
          <tr>
            <th className="th">Document type</th>
            <th className="th">Code</th>
            <th className="th">Description</th>
            <th className="th">Sort</th>
            <th className="th">Agency upload</th>
            <th className="th">Status</th>
            {canManage ? <th className="th text-right">Actions</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {paged.map((d) => (
            <tr key={d.id} className="tr-hover">
              <td className="td font-medium text-navy-900">{d.name}</td>
              <td className="td"><span className="badge bg-navy-900/5 text-navy-800">{d.code}</span></td>
              <td className="td max-w-[320px] truncate text-xs text-slate-500">{d.description ?? "—"}</td>
              <td className="td tabular-nums text-xs">{d.sortOrder}</td>
              <td className="td">
                {d.agencyUploadable ? (
                  <span className="badge bg-teal-50 text-teal-700">Agency</span>
                ) : (
                  <span className="badge bg-navy-900/5 text-navy-800">ESSAFARIA issued</span>
                )}
              </td>
              <td className="td"><ActiveBadge active={d.active} /></td>
      {canManage ? (
                <td className="td text-right">
                  <form action={updateDocumentTypeAction} className="inline">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="name" value={d.name} />
                    <input type="hidden" name="code" value={d.code} />
                    <input type="hidden" name="description" value={d.description ?? ""} />
                    <input type="hidden" name="sortOrder" value={d.sortOrder} />
                    <input type="hidden" name="agencyUploadable" value={d.agencyUploadable ? "1" : "0"} />
                    <input type="hidden" name="toggle" value="1" />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                      {d.active ? "Deactivate" : "Activate"}
                    </SubmitButton>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
          {paged.length === 0 ? (
            <tr><td colSpan={7} className="td py-8 text-center text-slate-500">No document types found{q ? ` for “${q}”` : ""}.</td></tr>
          ) : null}
        </tbody>
      </TableWrap>

      {pageCount > 1 ? (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-slate-500">Page {page} / {pageCount} — {total} total</span>
          <span className="flex gap-1.5">
            {page > 1 ? <Link href={`/admin/config/document-types?${new URLSearchParams({ ...(q ? { q } : {}), ...(per !== 20 ? { per: String(per) } : {}), page: String(page - 1) }).toString()}`} className="btn-secondary btn-sm">← Prev</Link> : null}
            {page < pageCount ? <Link href={`/admin/config/document-types?${new URLSearchParams({ ...(q ? { q } : {}), ...(per !== 20 ? { per: String(per) } : {}), page: String(page + 1) }).toString()}`} className="btn-secondary btn-sm">Next →</Link> : null}
          </span>
        </div>
      ) : null}

      <div className="mt-2 flex justify-end">
        <PageSizeSelector pageSize={per} basePath="/admin/config/document-types" query={{ q }} />
      </div>

      {canManage ? (
        <div className="mt-8">
          <h2 className="mb-3 font-serif text-xl text-navy-900">Add document type</h2>
          <form action={createDocumentTypeAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-4">
            <div>
              <label className="label">Name *</label>
              <input name="name" required className="input" placeholder="Police Clearance" />
            </div>
            <div>
              <label className="label">Code *</label>
              <input name="code" required className="input uppercase" placeholder="POLICE_CLEARANCE" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <input name="description" className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Provided by</label>
              <select name="agencyUploadable" className="input" defaultValue="1">
                <option value="1">Agency uploads it</option>
                <option value="0">ESSAFARIA / authority issues it</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <SubmitButton className="btn-primary" pendingLabel="Saving…">Add document type</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
