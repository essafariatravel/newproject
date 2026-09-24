import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { hasPermission } from "@/lib/rbac";
import { listAgencies, listUsers } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { formatDateTime } from "@/lib/format";
import { STAFF_ROLES, AGENCY_ROLES } from "@/lib/types";
import { createUserAction, updateUserAction } from "@/app/actions/admin";
import { FilterBar } from "@/components/app-widgets";
import { contentT } from "@/lib/i18n-content";
import { ConfirmButton, PasswordField, SubmitButton } from "@/components/forms";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const staff = await pageUser();
  const uiLocale = await getUiLocale();
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
  const agencyFilter = typeof sp.agency === "string" && sp.agency !== "" ? sp.agency : undefined;
  // §Users — two populations, two views. Default to ESSAFARIA staff.
  const view: "staff" | "agency" = sp.view === "agency" ? "agency" : "staff";
  const canSeeAgencies = hasPermission(staff, "agencies.view");
  const [rows, agencies, staffRows, agencyRows] = await Promise.all([
    listUsers(q, view === "agency" ? agencyFilter : undefined, view),
    canSeeAgencies ? listAgencies() : Promise.resolve([]),
    listUsers(undefined, undefined, "staff"),
    listUsers(undefined, undefined, "agency"),
  ]);
  const canManage = hasPermission(staff, "users.manage");
  const ct = contentT(uiLocale);
  // §privilege escalation — the role picker only ever offers roles that belong to
  // the population being edited. An agency account is never presented with a
  // staff role, even though the action would reject it anyway.
  const roleOptions = view === "staff" ? STAFF_ROLES : AGENCY_ROLES;

  return (
    <>
      <PageHeader
        title={view === "staff" ? ct("Staff users") : ct("Agency users")}
        subtitle="Roles are enforced server-side on every action. Agency accounts are always bound to exactly one agency."
      />
      <Flash {...flash} />

      <div className="mb-4 flex flex-wrap items-center gap-1.5" data-testid="user-views">
        <Link
          href="/admin/users?view=staff"
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            view === "staff" ? "border-iris-300 bg-iris-50 text-iris-700" : "border-slate-200 bg-white text-slate-500 hover:text-navy-900"
          }`}
          data-testid="users-view-staff"
        >
          ESSAFARIA staff · {staffRows.length}
        </Link>
        <Link
          href="/admin/users?view=agency"
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            view === "agency" ? "border-iris-300 bg-iris-50 text-iris-700" : "border-slate-200 bg-white text-slate-500 hover:text-navy-900"
          }`}
          data-testid="users-view-agency"
        >
          Agency users · {agencyRows.length}
        </Link>
      </div>

      <FilterBar action="/admin/users" fields={[
        { name: "q", label: "Search", type: "text", value: q, placeholder: "Name or email…" },
        ...(view === "agency" ? [{
          name: "agency",
          label: "Agency",
          type: "select" as const,
          value: agencyFilter,
          options: agencies.map((a) => ({ value: a.agency.id, label: a.agency.tradingName ?? a.agency.legalName })),
        }] : []),
      ]} hidden={{ view }} />

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title={view === "staff" ? ct("No staff users found") : ct("No agency users found")}
            body={q ? ct("Try a different search.") : view === "staff" ? ct("Create the first ESSAFARIA staff account below.") : ct("Agency accounts are created with their agency (or by the agency administrator).")}
          />
        </div>
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
                        {roleOptions.map((r) => (
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
                <td className="td max-w-[160px] truncate">{agencyName ?? <span className="text-slate-400">staff</span>}</td>
                <td className="td">
                  <span className={`badge ${u.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{u.status}</span>
                </td>
                <td className="td whitespace-nowrap text-xs text-slate-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt, uiLocale) : "never"}</td>
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
          <h2 className="mb-3 font-serif text-xl text-navy-900">{view === "staff" ? ct("Create staff user") : ct("Create agency user")}</h2>
          <form action={createUserAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="back" value="/admin/users" />
            <div>
              <label className="label" htmlFor="n-name">{ct("Full name")} *</label>
              <input id="n-name" name="name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="n-email">{ct("Email")} *</label>
              <input id="n-email" name="email" type="email" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="n-role">{ct("Role")} *</label>
              <select id="n-role" name="role" required className="input" defaultValue={view === "staff" ? "VISA_AGENT" : "AGENCY_USER"}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            {view === "agency" ? (
            <div>
              <label className="label" htmlFor="n-agency">{ct("Agency")} *</label>
              <select id="n-agency" name="agencyId" className="input" defaultValue="">
                <option value="">— none (staff) —</option>
                {agencies.map((a) => (
                  <option key={a.agency.id} value={a.agency.id}>
                    {a.agency.tradingName ?? a.agency.legalName}
                  </option>
                ))}
              </select>
            </div>
            ) : null}
            <PasswordField
              id="n-password"
              name="password"
              label={ct("Temporary password")}
              required
              hint={ct("At least 10 characters. The user must change it at first sign-in.")}
            />
            <div className="lg:col-span-5">
              <SubmitButton className="btn-primary" pendingLabel="Creating…">Create user</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
