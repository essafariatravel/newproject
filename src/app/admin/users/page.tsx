import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listAgencies, listUsers } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { formatDateTime } from "@/lib/format";
import { ALL_ROLES } from "@/lib/types";
import { createUserAction, updateUserAction } from "@/app/actions/admin";
import { FilterBar } from "@/components/app-widgets";
import { ConfirmButton, SubmitButton } from "@/components/forms";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const staff = await pageUser();
  if (!hasPermission(staff, "users.view")) {
    return (
      <>
        <PageHeader title="Users" />
        <div className="card"><EmptyState title="Not authorized" /></div>
      </>
    );
  }
  const flash = flashFrom(sp);
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const [rows, agencies] = await Promise.all([listUsers(q), hasPermission(staff, "agencies.view") ? listAgencies() : Promise.resolve([])]);
  const canManage = hasPermission(staff, "users.manage");

  return (
    <>
      <PageHeader title="Users" subtitle="Staff and agency users. Roles are enforced server-side on every action." />
      <Flash {...flash} />

      <FilterBar action="/admin/users" fields={[{ name: "q", label: "Search", type: "text", value: q, placeholder: "Name or email…" }]} />

      {rows.length === 0 ? (
        <div className="card"><EmptyState title="No users found" /></div>
      ) : (
        <TableWrap>
          <thead className="border-b border-slate-100 bg-ivory-50/60">
            <tr>
              <th className="th">User</th>
              <th className="th">Role</th>
              <th className="th">Agency</th>
              <th className="th">Status</th>
              <th className="th">Last login</th>
              {canManage ? <th className="th text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ user: u, agencyName }) => (
              <tr key={u.id} className="tr-hover">
                <td className="td">
                  <span className="block font-medium text-navy-900">{u.name}</span>
                  <span className="block text-xs text-slate-400">{u.email}</span>
                </td>
                <td className="td">
                  {canManage && u.id !== staff.id ? (
                    <form action={updateUserAction} className="flex items-center gap-1.5" id={`role-${u.id}`}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="back" value="/admin/users" />
                      <input type="hidden" name="name" value={u.name} />
                      <select name="role" defaultValue={u.role} className="input w-40 py-1 text-xs">
                        {ALL_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                      <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">Save</SubmitButton>
                    </form>
                  ) : (
                    <span className="badge bg-navy-900/5 text-navy-800">{u.role.replaceAll("_", " ")}</span>
                  )}
                </td>
                <td className="td max-w-[160px] truncate">{agencyName ?? "— (staff)"}</td>
                <td className="td">
                  <span className={`badge ${u.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{u.status}</span>
                </td>
                <td className="td whitespace-nowrap text-xs text-slate-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "never"}</td>
                {canManage ? (
                  <td className="td text-right">
                    {u.id !== staff.id ? (
                      <form action={updateUserAction} className="inline">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="back" value="/admin/users" />
                        <input type="hidden" name="name" value={u.name} />
                        <input type="hidden" name="role" value={u.role} />
                        <input type="hidden" name="toggleStatus" value="1" />
                        <ConfirmButton
                          message={u.status === "ACTIVE" ? `Suspend ${u.email}?` : `Reactivate ${u.email}?`}
                          className="btn-secondary btn-sm"
                        >
                          {u.status === "ACTIVE" ? "Suspend" : "Activate"}
                        </ConfirmButton>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-400">you</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {canManage ? (
        <div className="mt-8">
          <h2 className="mb-3 font-serif text-xl text-navy-900">Create user</h2>
          <form action={createUserAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="back" value="/admin/users" />
            <div>
              <label className="label" htmlFor="n-name">Full name *</label>
              <input id="n-name" name="name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="n-email">Email *</label>
              <input id="n-email" name="email" type="email" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="n-role">Role *</label>
              <select id="n-role" name="role" required className="input" defaultValue="VISA_AGENT">
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="n-agency">Agency (agency roles)</label>
              <select id="n-agency" name="agencyId" className="input" defaultValue="">
                <option value="">— none (staff) —</option>
                {agencies.map((a) => (
                  <option key={a.agency.id} value={a.agency.id}>
                    {a.agency.tradingName ?? a.agency.legalName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="n-password">Temporary password *</label>
              <input id="n-password" name="password" type="password" required minLength={10} className="input" />
            </div>
            <div className="lg:col-span-5">
              <SubmitButton className="btn-primary" pendingLabel="Creating…">Create user</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
