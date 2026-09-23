import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listAgencies } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { formatAmount } from "@/lib/format";
import { getUiLocale } from "@/lib/ui-i18n";
import { createAgencyAction, createAgencyWithAdminAction } from "@/app/actions/admin";
import { FilterBar } from "@/components/app-widgets";
import { SubmitButton } from "@/components/forms";
import { ActiveBadge, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import BrandMark from "@/components/brand-mark";
import { agencyLogoUrl } from "@/lib/branding";

export const dynamic = "force-dynamic";

export default async function AdminAgenciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await pageUser();
  const uiLocale = await getUiLocale(sp);
  if (!hasPermission(user, "agencies.view")) {
    return (
      <>
        <PageHeader title="Agencies" />
        <div className="card"><EmptyState title="Not authorized" /></div>
      </>
    );
  }
  const flash = flashFrom(sp);
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const rows = await listAgencies(q);
  const canManage = hasPermission(user, "agencies.manage");

  return (
    <>
      <PageHeader title="Agencies" subtitle="Partner agencies — DZD wallets, immutable ledger." />
      <Flash {...flash} />

      <FilterBar locale={uiLocale} action="/admin/agencies" fields={[{ name: "q", label: "Search", type: "text", value: q, placeholder: "Name or email…" }]} />

      {rows.length === 0 ? (
        <div className="card"><EmptyState title="No agencies yet" body="Create your first partner agency to start onboarding users." /></div>
      ) : (
        <TableWrap>
          <thead className="border-b border-slate-100 bg-ivory-50/60">
            <tr>
              <th className="th">Agency</th>
              <th className="th">Country</th>
              <th className="th">Status</th>
              <th className="th">Users</th>
              <th className="th">Applications</th>
              <th className="th">Wallet (DZD)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ agency, userCount, applicationCount }) => (
              <tr key={agency.id} className="tr-hover">
                <td className="td">
                  <div className="flex items-center gap-2.5">
                    <BrandMark className="h-8 w-8 shrink-0" src={agencyLogoUrl(agency)} alt={agency.tradingName ?? agency.legalName} />
                    <span className="min-w-0">
                      <Link href={`/admin/agencies/${agency.id}`} className="block truncate font-medium text-navy-900 hover:underline">
                        {agency.tradingName ?? agency.legalName}
                      </Link>
                      <span className="block truncate text-xs text-slate-400">{agency.email}</span>
                    </span>
                  </div>
                </td>
                <td className="td">{agency.country ?? "—"}</td>
                <td className="td"><ActiveBadge active={agency.status === "ACTIVE"} /></td>
                <td className="td tabular-nums">{userCount}</td>
                <td className="td tabular-nums">{applicationCount}</td>
                <td className="td whitespace-nowrap font-medium tabular-nums">{formatAmount(agency.balance, "DZD", uiLocale)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {canManage ? (
        <div className="mt-8">
          <h2 className="mb-3 font-serif text-xl text-navy-900">Create agency (DZD only)</h2>
          <form action={createAgencyAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className="label">Legal name *</label><input name="legalName" required className="input" placeholder="Horizon Voyages SARL" /></div>
            <div><label className="label">Trading name</label><input name="tradingName" className="input" /></div>
            <div><label className="label">Email *</label><input name="email" type="email" required className="input" /></div>
            <div><label className="label">Phone</label><input name="phone" className="input" /></div>
            <div><label className="label">City</label><input name="city" className="input" /></div>
            <div><label className="label">Country</label><input name="country" className="input" /></div>
            <input type="hidden" name="currency" value="DZD" />
            <div><label className="label">Billing tax ID</label><input name="billingTaxId" className="input" /></div>
            <div className="flex items-end lg:col-span-3"><SubmitButton className="btn-primary" pendingLabel="Creating…">Create agency</SubmitButton></div>
          </form>
        </div>
      ) : null}

      {user.role === "SUPER_ADMIN" ? (
        <div className="mt-8">
          <h2 className="mb-1 font-serif text-xl text-navy-900">Onboard agency + first administrator</h2>
          <p className="mb-3 text-xs text-slate-500">One step: agency + AGENCY_ADMIN with temporary password (forced change at first login). DZD wallet.</p>
          <form action={createAgencyWithAdminAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <div><label className="label">Legal name *</label><input name="legalName" required className="input" /></div>
            <div><label className="label">Trading name</label><input name="tradingName" className="input" /></div>
            <div><label className="label">Agency email *</label><input name="email" type="email" required className="input" /></div>
            <div><label className="label">Phone</label><input name="phone" className="input" /></div>
            <div><label className="label">City</label><input name="city" className="input" /></div>
            <div><label className="label">Country</label><input name="country" className="input" /></div>
            <input type="hidden" name="currency" value="DZD" />
            <div><label className="label">Billing tax ID</label><input name="billingTaxId" className="input" /></div>
            <div className="sm:col-span-2 lg:col-span-3 mt-2 border-t border-ivory-200 pt-4"><p className="mb-3 text-sm font-medium text-navy-800">First administrator</p></div>
            <div><label className="label">Administrator name *</label><input name="adminName" required className="input" /></div>
            <div><label className="label">Administrator email *</label><input name="adminEmail" type="email" required className="input" /></div>
            <div><label className="label">Temporary password * (min 10)</label><input name="adminPassword" type="password" required minLength={10} className="input" autoComplete="new-password" /></div>
            <div className="flex items-end lg:col-span-3"><SubmitButton className="btn-primary" pendingLabel="Onboarding…">Onboard agency + administrator</SubmitButton></div>
          </form>
        </div>
      ) : null}
    </>
  );
}
