import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { listCurrencies } from "@/lib/queries";
import { flashFrom } from "@/lib/action-helpers";
import { createCurrencyAction, updateCurrencyAction } from "@/app/actions/config";
import { SubmitButton } from "@/components/forms";
import { ActiveBadge, EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CurrenciesConfigPage({
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
  const rows = await listCurrencies();
  const canManage = hasPermission(staff, "config.manage");

  return (
    <>
      <PageHeader title="Currencies" subtitle="Supported fee and wallet currencies." />
      <Flash {...flash} />

      <TableWrap>
        <thead className="border-b border-slate-100 bg-ivory-50/60">
          <tr>
            <th className="th">Code</th>
            <th className="th">Name</th>
            <th className="th">Symbol</th>
            <th className="th">Status</th>
            {canManage ? <th className="th text-right">Actions</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((c) => (
            <tr key={c.id} className="tr-hover">
              <td className="td"><span className="badge bg-navy-900/5 text-navy-800">{c.code}</span></td>
              <td className="td font-medium text-navy-900">{c.name}</td>
              <td className="td">{c.symbol}</td>
              <td className="td"><ActiveBadge active={c.active} /></td>
              {canManage ? (
                <td className="td text-right">
                  <form action={updateCurrencyAction} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="code" value={c.code} />
                    <input type="hidden" name="name" value={c.name} />
                    <input type="hidden" name="symbol" value={c.symbol} />
                    <input type="hidden" name="sortOrder" value={c.sortOrder} />
                    <input type="hidden" name="toggle" value="1" />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                      {c.active ? "Deactivate" : "Activate"}
                    </SubmitButton>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="td py-8 text-center text-slate-500">No currencies configured.</td></tr>
          ) : null}
        </tbody>
      </TableWrap>

      {canManage ? (
        <div className="mt-8">
          <h2 className="mb-3 font-serif text-xl text-navy-900">Add currency</h2>
          <form action={createCurrencyAction} className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="code">Code (ISO-4217) *</label>
              <input id="code" name="code" required maxLength={3} minLength={3} className="input uppercase" placeholder="CHF" />
            </div>
            <div>
              <label className="label" htmlFor="name">Name *</label>
              <input id="name" name="name" required className="input" placeholder="Swiss Franc" />
            </div>
            <div>
              <label className="label" htmlFor="symbol">Symbol *</label>
              <input id="symbol" name="symbol" required maxLength={8} className="input" placeholder="CHF" />
            </div>
            <div className="sm:col-span-4">
              <SubmitButton className="btn-primary" pendingLabel="Saving…">Add currency</SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
