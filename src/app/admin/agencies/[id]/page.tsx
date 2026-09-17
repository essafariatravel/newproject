import Link from "next/link";
import { notFound } from "next/navigation";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { getTransactions, getBalance } from "@/lib/wallet";
import { db } from "@/lib/db";
import { agencies, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { flashFrom } from "@/lib/action-helpers";
import { formatAmount, formatDateTime } from "@/lib/format";
import { adjustWalletAction, toggleAgencyStatusAction, updateAgencyAction, createUserAction } from "@/app/actions/admin";
import { searchApplications } from "@/lib/queries";
import { SubmitButton } from "@/components/forms";
import BrandMark from "@/components/brand-mark";
import { agencyLogoUrl } from "@/lib/branding";
import { uploadAgencyLogoAction, removeAgencyLogoAction } from "@/app/actions/branding";
import { ActiveBadge, Card, CardHeader, Flash, KeyValue, PageHeader, StatCard, StatusBadge, TableWrap } from "@/components/ui";
import { WALLET_MANAGE_ROLES } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminAgencyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const staff = await pageUser();
  if (!hasPermission(staff, "agencies.view")) notFound();

  const rows = await db.select().from(agencies).where(eq(agencies.id, id)).limit(1);
  const agency = rows[0];
  if (!agency) notFound();

  const flash = flashFrom(sp);
  const canManage = hasPermission(staff, "agencies.manage");
  const canAdjust = WALLET_MANAGE_ROLES.includes(staff.role);
  const canUsers = hasPermission(staff, "users.manage");

  const [agencyUsers, txs, apps] = await Promise.all([
    db.select().from(users).where(eq(users.agencyId, id)),
    getTransactions(id, 15),
    searchApplications(staff, { agencyId: id, page: 1 }),
  ]);
  const balance = await getBalance(id);

  return (
    <>
      <PageHeader
        title={agency.tradingName ?? agency.legalName}
        subtitle={`${agency.legalName} · ${agency.city ?? ""} ${agency.country ?? ""}`}
        actions={
          <>
            <ActiveBadge active={agency.status === "ACTIVE"} />
            <Link href="/admin/agencies" className="btn-secondary btn-sm">← All agencies</Link>
          </>
        }
      />
      <Flash {...flash} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Wallet balance" value={formatAmount(balance.balance, balance.currency)} tone="gold" />
        <StatCard label="Users" value={agencyUsers.length} />
        <StatCard label="Applications" value={apps.total} href="/admin/applications" />
        <StatCard label="Member since" value={formatDateTime(agency.createdAt).split(",")[0]} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Agency logo" subtitle="Shown across the agency portal and partner surfaces." />
            <div className="flex flex-wrap items-center gap-4 px-5 py-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-ivory-200 bg-ivory-50">
                <BrandMark className="h-11 w-11" src={agencyLogoUrl(agency)} alt={agency.tradingName ?? agency.legalName} />
              </div>
              {canManage ? (
                <>
                  {agency.logoKey ? (
                    <form action={removeAgencyLogoAction}>
                      <input type="hidden" name="agencyId" value={id} />
                      <SubmitButton className="btn-danger btn-sm" pendingLabel="Removing…">Remove logo</SubmitButton>
                    </form>
                  ) : null}
                  <form action={uploadAgencyLogoAction} encType="multipart/form-data" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="agencyId" value={id} />
                    <input
                      type="file"
                      name="logo"
                      accept="image/png,image/jpeg,image/webp"
                      required
                      className="max-w-full text-xs file:mr-2 file:cursor-pointer file:rounded-full file:border-0 file:bg-iris-600 file:px-3.5 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                    />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel="Uploading…">
                      {agency.logoKey ? "Replace logo" : "Upload logo"}
                    </SubmitButton>
                  </form>
                </>
              ) : (
                <p className="text-xs text-slate-400">{agency.logoKey ? "Uploaded." : "No logo uploaded yet."}</p>
              )}
            </div>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader
                title="Agency details"
                actions={
                  <form action={toggleAgencyStatusAction}>
                    <input type="hidden" name="id" value={id} />
                    <SubmitButton className={agency.status === "ACTIVE" ? "btn-danger btn-sm" : "btn-secondary btn-sm"} pendingLabel="…">
                      {agency.status === "ACTIVE" ? "Suspend agency" : "Activate agency"}
                    </SubmitButton>
                  </form>
                }
              />
              <form action={updateAgencyAction} className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <div>
                  <label className="label" htmlFor="legalName">Legal name *</label>
                  <input id="legalName" name="legalName" required defaultValue={agency.legalName} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="tradingName">Trading name</label>
                  <input id="tradingName" name="tradingName" defaultValue={agency.tradingName ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="email">Email *</label>
                  <input id="email" name="email" type="email" required defaultValue={agency.email} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="phone">Phone</label>
                  <input id="phone" name="phone" defaultValue={agency.phone ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="addressLine">Address</label>
                  <input id="addressLine" name="addressLine" defaultValue={agency.addressLine ?? ""} className="input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="city">City</label>
                    <input id="city" name="city" defaultValue={agency.city ?? ""} className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="country">Country</label>
                    <input id="country" name="country" defaultValue={agency.country ?? ""} className="input" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="billingName">Billing name</label>
                  <input id="billingName" name="billingName" defaultValue={agency.billingName ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="billingEmail">Billing email</label>
                  <input id="billingEmail" name="billingEmail" type="email" defaultValue={agency.billingEmail ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="billingTaxId">Billing tax ID</label>
                  <input id="billingTaxId" name="billingTaxId" defaultValue={agency.billingTaxId ?? ""} className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="notes">Internal notes</label>
                  <textarea id="notes" name="notes" rows={2} defaultValue={agency.notes ?? ""} className="input" />
                </div>
                <div className="sm:col-span-2">
                  <SubmitButton className="btn-primary" pendingLabel="Saving…">Save agency</SubmitButton>
                </div>
              </form>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Agency details" />
              <KeyValue
                items={[
                  { label: "Email", value: agency.email },
                  { label: "Phone", value: agency.phone ?? "—" },
                  { label: "Address", value: [agency.addressLine, agency.city, agency.country].filter(Boolean).join(", ") || "—" },
                  { label: "Billing", value: [agency.billingName, agency.billingEmail, agency.billingTaxId].filter(Boolean).join(" · ") || "—" },
                  { label: "Notes", value: agency.notes ?? "—" },
                ]}
              />
            </Card>
          )}

          <Card>
            <CardHeader title="Recent applications" actions={<Link href={`/admin/applications?agency=${id}`} className="btn-secondary btn-sm">All →</Link>} />
            {apps.rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No applications yet.</p>
            ) : (
              <TableWrap>
                <thead className="border-b border-slate-100 bg-ivory-50/60">
                  <tr>
                    <th className="th">Reference</th>
                    <th className="th">Visa</th>
                    <th className="th">Fee</th>
                    <th className="th">Status</th>
                    <th className="th">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apps.rows.slice(0, 8).map((r) => (
                    <tr key={r.app.id} className="tr-hover">
                      <td className="td">
                        <Link href={`/admin/applications/${r.app.id}`} className="font-medium text-navy-900 hover:underline">
                          {r.app.reference}
                        </Link>
                      </td>
                      <td className="td">{r.app.countryName} · {r.app.visaTypeName}</td>
                      <td className="td tabular-nums">{r.app.fee} {r.app.currency}</td>
                      <td className="td"><StatusBadge code={r.statusCode} name={r.statusName} /></td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.app.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {canAdjust ? (
            <Card>
              <CardHeader title="Wallet adjustment" subtitle={`Current balance ${formatAmount(balance.balance, balance.currency)}. Credit with a positive amount, debit with a negative amount. Every adjustment is logged.`} />
              <form action={adjustWalletAction} className="space-y-3 px-4 py-4">
                <input type="hidden" name="agencyId" value={id} />
                <input type="hidden" name="back" value={`/admin/agencies/${id}`} />
                <div>
                  <label className="label" htmlFor="amount">Amount (negative to debit) *</label>
                  <input id="amount" name="amount" type="number" step="0.01" required className="input" placeholder="-50.00 or 250.00" />
                </div>
                <div>
                  <label className="label" htmlFor="reason">Reason (mandatory) *</label>
                  <input id="reason" name="reason" required minLength={5} className="input" placeholder="Bank transfer #1234, refund for cancelled file…" />
                </div>
                <SubmitButton className="btn-primary w-full" pendingLabel="Adjusting…">Apply adjustment</SubmitButton>
              </form>
            </Card>
          ) : null}

          {canUsers ? (
            <Card>
              <CardHeader title="Add agency user" />
              <form action={createUserAction} className="space-y-3 px-4 py-4">
                <input type="hidden" name="back" value={`/admin/agencies/${id}`} />
                <input type="hidden" name="agencyId" value={id} />
                <div>
                  <label className="label" htmlFor="u-name">Full name *</label>
                  <input id="u-name" name="name" required className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="u-email">Email *</label>
                  <input id="u-email" name="email" type="email" required className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="u-role">Role *</label>
                  <select id="u-role" name="role" required className="input" defaultValue="AGENCY_USER">
                    <option value="AGENCY_ADMIN">Agency Admin</option>
                    <option value="AGENCY_USER">Agency User</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="u-password">Temporary password * (min 10 chars)</label>
                  <input id="u-password" name="password" type="password" required minLength={10} className="input" />
                </div>
                <SubmitButton className="btn-secondary w-full" pendingLabel="Creating…">Create user</SubmitButton>
              </form>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Agency users" />
            <ul className="divide-y divide-slate-100 px-4">
              {agencyUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-navy-900">{u.name}</p>
                    <p className="truncate text-xs text-slate-400">{u.email}</p>
                  </div>
                  <div className="text-right">
                    <span className="badge bg-navy-900/5 text-navy-800">{u.role.replaceAll("_", " ")}</span>
                    <span className={`mt-1 block text-[11px] ${u.status === "ACTIVE" ? "text-emerald-600" : "text-red-500"}`}>{u.status}</span>
                  </div>
                </li>
              ))}
              {agencyUsers.length === 0 ? <li className="py-6 text-center text-sm text-slate-500">No users yet.</li> : null}
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader title="Transaction ledger" subtitle="Immutable wallet history for this agency." />
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">Date</th>
                <th className="th">Type</th>
                <th className="th">Amount</th>
                <th className="th">Balance before → after</th>
                <th className="th">Application</th>
                <th className="th">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {txs.length === 0 ? (
                <tr><td colSpan={6} className="td py-8 text-center text-slate-500">No transactions yet.</td></tr>
              ) : (
                txs.map(({ tx, applicationReference }) => (
                  <tr key={tx.id} className="tr-hover">
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(tx.createdAt)}</td>
                    <td className="td">
                      <span className={`badge ${tx.type === "CREDIT" ? "bg-emerald-100 text-emerald-800" : tx.type === "DEBIT" ? "bg-red-100 text-red-700" : "bg-navy-900/5 text-navy-800"}`}>
                        {tx.type.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className={`td whitespace-nowrap tabular-nums font-medium ${tx.type === "DEBIT" || tx.type === "APPLICATION_CHARGE" ? "text-red-700" : "text-emerald-700"}`}>
                      {tx.type === "CREDIT" ? "+" : "−"}{formatAmount(tx.amount, tx.currency)}
                    </td>
                    <td className="td whitespace-nowrap tabular-nums text-xs">
                      {tx.balanceBefore} → {tx.balanceAfter} {tx.currency}
                    </td>
                    <td className="td text-xs">
                      {applicationReference ? (
                        tx.applicationId ? (
                          <Link href={`/admin/applications/${tx.applicationId}`} className="text-navy-800 hover:underline">{applicationReference}</Link>
                        ) : applicationReference
                      ) : "—"}
                    </td>
                    <td className="td max-w-[240px] truncate text-xs" title={tx.reason}>{tx.reason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </TableWrap>
        </Card>
      </div>
    </>
  );
}
