import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listAgencies } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { formatAmount } from "@/lib/format";
import { createAgencyAction } from "@/app/actions/admin";
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
      <PageHeader title="Agencies" subtitle="Partner agencies (tenants) and their prepaid wallets." />
      <Flash {...flash} />

      <FilterBar action="/admin/agencies" fields={[{ name: "q", label: "Search", type: "text", value: q, placeholder: "Name or email…" }]} />

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
              <th className="th">Wallet balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ agency, userCount, applicationCount }) => (
              <tr key={agency.id} className="tr-hover">
                <td className="td">
                  <div className="flex items-center gap-2.5">
                    <BrandMark
                      className="h-8 w-8 shrink-0"
                      src={agencyLogoUrl(agency)}
                      alt={agency.tradingName ?? agency.legalName}
                    />
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
                <td className="td whitespace-nowrap font-medium tabular-nums">
                  {formatAmount(agency.balance, agency.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {canManage ? (
        <div className="mt-8">
          <h2 className="mb-3 font-serif text-xl text-navy-900">Create agency</h2>
          <form action={createAgencyAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label" htmlFor="legalName">Legal name *</label>
              <input id="legalName" name="legalName" required className="input" placeholder="Horizon Voyages SARL" />
            </div>
            <div>
              <label className="label" htmlFor="tradingName">Trading name</label>
              <input id="tradingName" name="tradingName" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="email">Email *</label>
              <input id="email" name="email" type="email" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="phone">Phone</label>
              <input id="phone" name="phone" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="city">City</label>
              <input id="city" name="city" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="country">Country</label>
              <input id="country" name="country" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="currency">Wallet currency</label>
              <select id="currency" name="currency" className="input" defaultValue="DZD">
                <option value="DZD">DZD — Algerian Dinar (default)</option>
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — US Dollar</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="AED">AED — UAE Dirham</option>
                <option value="SAR">SAR — Saudi Riyal</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="billingTaxId">Billing tax ID</label>
              <input id="billingTaxId" name="billingTaxId" className="input" />
            </div>
            <div className="flex items-end lg:col-span-3">
              <SubmitButton className="btn-primary" pendingLabel="Creating…">Create agency</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
