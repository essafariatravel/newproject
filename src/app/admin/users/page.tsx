import { businessLabel } from "@/lib/business-labels";
import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { getUiLocale } from "@/lib/ui-i18n";
import { hasPermission } from "@/lib/rbac";
import { listAgencies, listUsers } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { formatDateTime } from "@/lib/format";
import { AGENCY_ROLES } from "@/lib/types";
import { AccessLinkForm } from "@/components/access-link-form";
import { identityT } from "@/lib/identity-copy";
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
  const it = identityT(uiLocale);
  // §privilege escalation — the role picker only ever offers roles that belong to
  // the population being edited. An agency account is never presented with a
  // staff role, even though the action would reject it anyway.
  const roleOptions = view === "staff" ? ["ADMIN", "SUPER_ADMIN"] as const : AGENCY_ROLES;

  return (
    <>
      <PageHeader
        title={view === "staff" ? ct("Staff users") : ct("Agency users")}
        subtitle={ct("Account access is managed per role and agency.")}
      />
      <Flash {...flash} />
      {staff.role === "SUPER_ADMIN" ? <Link href="/admin/recovery" className="mb-6 inline-flex min-h-11 items-center text-base font-semibold text-iris-700 underline">{it("Recovery requests")}</Link> : null}

      <nav className="notification-filters" data-testid="user-views" aria-label={ct("Users")}>
        <Link
          href="/admin/users?view=staff"
          aria-current={view === "staff" ? "page" : undefined}
          data-testid="users-view-staff"
        >
          {ct("ESSAFARIA staff")} · {staffRows.length}
        </Link>
        <Link
          href="/admin/users?view=agency"
          aria-current={view === "agency" ? "page" : undefined}
          data-testid="users-view-agency"
        >
          {ct("Agency users")} · {agencyRows.length}
        </Link>
      </nav>

      <FilterBar action="/admin/users" fields={[
        { name: "q", label: ct("Search"), type: "text", value: q, placeholder: ct("Name or email…") },
        ...(view === "agency" ? [{
          name: "agency",
          label: ct("Agency"),
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
              <th className="th">{ct("User")}</th>
              <th className="th">{ct("Role")}</th>
              <th className="th">{ct("Agency")}</th>
              <th className="th">{ct("Status")}</th>
              <th className="th">{ct("Last login")}</th>
              {canManage ? <th className="th text-end">{ct("Actions")}</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ user: u, agencyName }) => (
              <tr key={u.id} className="tr-hover">
                <td className="td">
                  <span className="block font-semibold text-navy-900">{u.name}</span>
                  <span className="block text-xs text-slate-400" dir="ltr">{u.username ?? u.email}</span>
                </td>
                <td className="td">
                  <span className="badge bg-navy-900/5 text-navy-800">{!u.agencyId && u.role !== "SUPER_ADMIN" ? it("Staff") : businessLabel(u.role, uiLocale)}</span>
                </td>
                <td className="td max-w-[160px] truncate">{agencyName ?? <span className="text-slate-400">staff</span>}</td>
                <td className="td">
                  <span className={`badge ${u.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{businessLabel(u.status, uiLocale)}</span>
                  {u.activationPending ? <p className="mt-1 text-xs text-slate-500">{it("Pending activation")}</p> : u.mustChangePassword ? <p className="mt-1 text-xs text-slate-500">{it("Pending first password change")}</p> : null}
                </td>
                <td className="td whitespace-nowrap text-xs text-slate-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt, uiLocale) : ct("never")}</td>
                {canManage ? (
                  <td className="td text-end">
                    {u.id !== staff.id ? (
                      <div className="flex flex-col items-end gap-2">
                      <form action={updateUserAction} className="inline">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="back" value="/admin/users" />
                        <input type="hidden" name="name" value={u.name} />
                        <input type="hidden" name="role" value={u.role} />
                        <input type="hidden" name="toggleStatus" value="1" />
                        <ConfirmButton
                          message={`${ct(u.status === "ACTIVE" ? "Suspend this user?" : "Reactivate this user?")} ${u.name} (${u.username ?? u.email})`}
                          className="btn-secondary btn-sm"
                        >
                          {ct(u.status === "ACTIVE" ? "Suspend" : "Activate")}
                        </ConfirmButton>
                      </form>
                      {u.status === "ACTIVE" ? <AccessLinkForm userId={u.id} locale={uiLocale} /> : null}
                      <form action={updateUserAction}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="back" value={`/admin/users?view=${view}`} /><input type="hidden" name="forceSignOut" value="1" /><SubmitButton className="btn-secondary btn-sm" pendingLabel="…">{it("Force sign-out")}</SubmitButton></form>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">{ct("you")}</span>
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
          <h2 className="mb-4 font-serif text-lg text-navy-900">{view === "staff" ? ct("Create staff user") : ct("Create agency user")}</h2>
          <form action={createUserAction} className="card grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="back" value="/admin/users" />
            <div>
              <label className="label" htmlFor="n-name">{ct("Full name")} *</label>
              <input id="n-name" name="name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="n-identity">{view === "agency" ? it("Username") : ct("Email")} *</label>
              <input id="n-identity" name={view === "agency" ? "username" : "email"} type={view === "agency" ? "text" : "email"} required className="input" maxLength={view === "agency" ? 48 : 254} dir="ltr" />
            </div>
            <div>
              <label className="label" htmlFor="n-role">{ct("Role")} *</label>
              <select id="n-role" name="role" required className="input" defaultValue={view === "staff" ? "VISA_AGENT" : "AGENCY_USER"}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {view === "staff" && r === "ADMIN" ? it("Staff") : businessLabel(r, uiLocale)}
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
              showLabel={ct("Show")}
              hideLabel={ct("Hide")}
            />
            <div className="lg:col-span-5">
              <SubmitButton className="btn-primary" pendingLabel={ct("Creating…")}>{ct("Create user")}</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
