import { formatProcessingDays } from "@/lib/format";
import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listCountries, listVisaCategories, listVisaTypesWithRelations } from "@/lib/applications-exports";
import { flashFrom } from "@/lib/action-helpers";
import { createVisaTypeAction, updateVisaTypeAction } from "@/app/actions/config";
import { formatAmount } from "@/lib/format";
import { SubmitButton } from "@/components/forms";
import { ActiveBadge, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VisaTypesConfigPage({
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
  const [rows, countries, categories] = await Promise.all([
    listVisaTypesWithRelations(),
    listCountries(),
    listVisaCategories(),
  ]);
  const canManage = hasPermission(staff, "config.manage");
  const activeCountries = countries.filter((c) => c.active);
  const activeCategories = categories.filter((c) => c.active);

  return (
    <>
      <PageHeader
        title="Visa types"
        subtitle="The service catalogue. Fees, processing times and requirements are snapshotted into applications at creation."
      />
      <Flash {...flash} />

      <TableWrap>
        <thead className="border-b border-slate-100 bg-ivory-50/60">
          <tr>
            <th className="th">Visa type</th>
            <th className="th">Country</th>
            <th className="th">Category</th>
            <th className="th">Fee</th>
            <th className="th">Processing</th>
            <th className="th">Status</th>
            <th className="th"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ vt, countryName, categoryName }) => (
            <tr key={vt.id} className="tr-hover">
              <td className="td">
                <Link href={`/admin/config/visa-types/${vt.id}`} className="font-medium text-navy-900 hover:underline">
                  {vt.name}
                </Link>
                <span className="block text-xs text-slate-400">{vt.code}</span>
              </td>
              <td className="td">{countryName}</td>
              <td className="td">{categoryName}</td>
              <td className="td whitespace-nowrap tabular-nums">{formatAmount(vt.fee, vt.currency)}</td>
              <td className="td whitespace-nowrap text-xs">{formatProcessingDays(vt.processingMinDays, vt.processingMaxDays)}</td>
              <td className="td"><ActiveBadge active={vt.active} /></td>
              <td className="td text-right">
                {canManage ? (
                  <form action={updateVisaTypeAction} className="inline">
                    <input type="hidden" name="id" value={vt.id} />
                    <input type="hidden" name="toggle" value="1" />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                      {vt.active ? "Deactivate" : "Activate"}
                    </SubmitButton>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="td py-8 text-center text-slate-500">No visa types configured.</td></tr>
          ) : null}
        </tbody>
      </TableWrap>

      {canManage ? (
        <div className="mt-8">
          <h2 className="mb-3 font-serif text-xl text-navy-900">Add visa type</h2>
          <form action={createVisaTypeAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="name">Name *</label>
              <input id="name" name="name" required className="input" placeholder="Portugal Schengen Tourist Visa" />
            </div>
            <div>
              <label className="label" htmlFor="code">Code *</label>
              <input id="code" name="code" required className="input uppercase" placeholder="PT-SCH-TOUR" />
            </div>
            <div>
              <label className="label" htmlFor="countryId">Country *</label>
              <select id="countryId" name="countryId" required className="input">
                {activeCountries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="categoryId">Category *</label>
              <select id="categoryId" name="categoryId" required className="input">
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="currency">Fee currency *</label>
              <select id="currency" name="currency" required className="input" defaultValue="DZD">
                <option value="DZD">DZD — Algerian Dinar (default)</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="AED">AED</option>
                <option value="SAR">SAR</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="fee">Fee *</label>
              <input id="fee" name="fee" type="number" step="0.01" min="0" required className="input" placeholder="120.00" />
            </div>
            <div>
              <label className="label" htmlFor="minDays">Processing min days (0 = on request) *</label>
              <input id="minDays" name="processingMinDays" type="number" min="0" required className="input" defaultValue={5} />
            </div>
            <div>
              <label className="label" htmlFor="maxDays">Processing max days (0 = on request) *</label>
              <input id="maxDays" name="processingMaxDays" type="number" min="0" required className="input" defaultValue={15} />
            </div>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="description">Description</label>
              <textarea id="description" name="description" rows={2} className="input" />
            </div>
            <div className="sm:col-span-3">
              <SubmitButton className="btn-primary" pendingLabel="Saving…">Add visa type</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
