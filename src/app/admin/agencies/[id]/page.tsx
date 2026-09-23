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
import { ActiveBadge, Card, CardHeader, Flash, KeyValue, PageHeader, StatCard, TableWrap } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { WALLET_MANAGE_ROLES } from "@/lib/types";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

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
  const uiLocale = await getUiLocale(sp);
  const ct = contentT(uiLocale);
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
    getTransactions(id, 25),
    searchApplications(staff, { agencyId: id, page: 1 }),
  ]);
  const balance = await getBalance(id);

  return (
    <>
      <PageHeader
        title={agency.tradingName ?? agency.legalName}
        subtitle={`${agency.legalName} · ${agency.city ?? ""} ${agency.country ?? ""} · DZD wallet`}
        actions={
          <>
            <ActiveBadge active={agency.status === "ACTIVE"} />
            <Link href="/admin/agencies" className="btn-secondary btn-sm">← All agencies</Link>
          </>
        }
      />
      <Flash {...flash} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={ct("Wallet balance")} value={formatAmount(balance.balance, "DZD", uiLocale)} tone="gold" />
        <StatCard label={ct("Users")} value={agencyUsers.length} />
        <StatCard label={ct("Applications")} value={apps.total} href="/admin/applications" />
        <StatCard label={ct("Member since")} value={formatDateTime(agency.createdAt).split(",")[0]} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title={ct("Agency logo")} subtitle={ct("Shown across the agency portal and partner surfaces.")} />
            <div className="flex flex-wrap items-center gap-4 px-5 py-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-ivory-200 bg-ivory-50">
                <BrandMark className="h-11 w-11" src={agencyLogoUrl(agency)} alt={agency.tradingName ?? agency.legalName} />
              </div>
              {canManage ? (
                <>
                  {agency.logoKey ? (
                    <form action={removeAgencyLogoAction}>
                      <input type="hidden" name="agencyId" value={id} />
                      <SubmitButton className="btn-danger btn-sm" pendingLabel="Removing…">{ct("Remove logo")}</SubmitButton>
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
                      {agency.logoKey ? ct("Replace logo") : ct("Upload logo")}
                    </SubmitButton>
                  </form>
                </>
              ) : (
                <p className="text-xs text-slate-400">{agency.logoKey ? ct("Uploaded.") : ct("No logo uploaded yet.")}</p>
              )}
            </div>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader
                title={ct("Agency details")}
                actions={
                  <form action={toggleAgencyStatusAction}>
                    <input type="hidden" name="id" value={id} />
                    <SubmitButton className={agency.status === "ACTIVE" ? "btn-danger btn-sm" : "btn-secondary btn-sm"} pendingLabel="…">
                      {agency.status === "ACTIVE" ? ct("Suspend agency") : ct("Activate agency")}
                    </SubmitButton>
                  </form>
                }
              />
              <form action={updateAgencyAction} className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <div>
                  <label className="label" htmlFor="legalName">{ct("Legal name")} *</label>
                  <input id="legalName" name="legalName" required defaultValue={agency.legalName} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="tradingName">{ct("Trading name")}</label>
                  <input id="tradingName" name="tradingName" defaultValue={agency.tradingName ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="email">{ct("Email")} *</label>
                  <input id="email" name="email" type="email" required defaultValue={agency.email} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="phone">{ct("Phone")}</label>
                  <input id="phone" name="phone" defaultValue={agency.phone ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="addressLine">{ct("Address")}</label>
                  <input id="addressLine" name="addressLine" defaultValue={agency.addressLine ?? ""} className="input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="city">{ct("City")}</label>
                    <input id="city" name="city" defaultValue={agency.city ?? ""} className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="country">{ct("Country")}</label>
                    <input id="country" name="country" defaultValue={agency.country ?? ""} className="input" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="billingName">{ct("Billing name")}</label>
                  <input id="billingName" name="billingName" defaultValue={agency.billingName ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="billingEmail">{ct("Billing email")}</label>
                  <input id="billingEmail" name="billingEmail" type="email" defaultValue={agency.billingEmail ?? ""} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="billingTaxId">{ct("Billing tax ID")}</label>
                  <input id="billingTaxId" name="billingTaxId" defaultValue={agency.billingTaxId ?? ""} className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="notes">{ct("Internal notes")}</label>
                  <textarea id="notes" name="notes" rows={2} defaultValue={agency.notes ?? ""} className="input" />
                </div>
                <div className="sm:col-span-2">
                  <SubmitButton className="btn-primary" pendingLabel="Saving…">{ct("Save agency")}</SubmitButton>
                </div>
              </form>
            </Card>
          ) : (
            <Card>
              <CardHeader title={ct("Agency details")} />
              <KeyValue
                items={[
                  { label: ct("Email"), value: agency.email },
                  { label: ct("Phone"), value: agency.phone ?? "—" },
                  { label: ct("Address"), value: [agency.addressLine, agency.city, agency.country].filter(Boolean).join(", ") || "—" },
                  { label: ct("Billing"), value: [agency.billingName, agency.billingEmail, agency.billingTaxId].filter(Boolean).join(" · ") || "—" },
                  { label: ct("Notes"), value: agency.notes ?? "—" },
                ]}
              />
            </Card>
          )}

          <Card>
            <CardHeader title={ct("Recent applications")} actions={<Link href={`/admin/applications?agency=${id}`} className="btn-secondary btn-sm">All →</Link>} />
            {apps.rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">{ct("No applications yet.")}</p>
            ) : (
              <TableWrap>
                <thead className="border-b border-slate-100 bg-ivory-50/60">
                  <tr>
                    <th className="th">{ct("Reference")}</th>
                    <th className="th">{ct("Visa")}</th>
                    <th className="th">{ct("Fee")}</th>
                    <th className="th">{ct("Status")}</th>
                    <th className="th">{ct("Created")}</th>
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
                      <td className="td tabular-nums">{formatAmount(r.app.fee, "DZD", uiLocale)}</td>
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
              <CardHeader title={ct("Wallet adjustment")} subtitle={`${ct("Current balance")} ${formatAmount(balance.balance, "DZD", uiLocale)}. DZD only. ${ct("Every adjustment is logged.")}`} />
              <form action={adjustWalletAction} className="space-y-3 px-4 py-4">
                <input type="hidden" name="agencyId" value={id} />
                <input type="hidden" name="back" value={`/admin/agencies/${id}`} />
                <div>
                  <label className="label" htmlFor="operation">{ct("Operation")} *</label>
                  <select id="operation" name="operation" required className="input" defaultValue="CREDIT">
                    <option value="CREDIT">{ct("Credit wallet")}</option>
                    <option value="DEBIT">{ct("Debit wallet")}</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="amount">{ct("Amount (DZD)")} *</label>
                  <input id="amount" name="amount" type="number" step="0.01" min="0.01" required className="input" placeholder="50000" />
                </div>
                <div>
                  <label className="label" htmlFor="reason">{ct("Reason (mandatory)")} *</label>
                  <input id="reason" name="reason" required minLength={5} className="input" placeholder={ct("Bank transfer #1234, refund…")} />
                </div>
                <SubmitButton className="btn-primary w-full" pendingLabel="Adjusting…">{ct("Apply adjustment")}</SubmitButton>
              </form>
            </Card>
          ) : null}

          {canUsers ? (
            <Card>
              <CardHeader title={ct("Add agency user")} subtitle={ct("Agency Admin chooses password directly.")} />
              <form action={createUserAction} className="space-y-3 px-4 py-4">
                <input type="hidden" name="back" value={`/admin/agencies/${id}`} />
                <input type="hidden" name="agencyId" value={id} />
                <div>
                  <label className="label" htmlFor="u-name">{ct("Full name")} *</label>
                  <input id="u-name" name="name" required className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="u-email">{ct("Email")} *</label>
                  <input id="u-email" name="email" type="email" required className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="u-role">{ct("Role")} *</label>
                  <select id="u-role" name="role" required className="input" defaultValue="AGENCY_USER">
                    <option value="AGENCY_ADMIN">{ct("Agency Admin")}</option>
                    <option value="AGENCY_USER">{ct("Agency User")}</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="u-password">{ct("Temporary password")} * (min 10 chars)</label>
                  <input id="u-password" name="password" type="password" required minLength={10} className="input" />
                </div>
                <SubmitButton className="btn-secondary w-full" pendingLabel="Creating…">{ct("Create user")}</SubmitButton>
              </form>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={ct("Agency users")} />
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
              {agencyUsers.length === 0 ? <li className="py-6 text-center text-sm text-slate-500">{ct("No users yet.")}</li> : null}
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader title={ct("Transaction ledger")} subtitle={ct("Immutable wallet history for this agency. DZD only.")} />
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">{ct("Reference")}</th>
                <th className="th">{ct("Date")}</th>
                <th className="th">{ct("Type")}</th>
                <th className="th">{ct("Amount")}</th>
                <th className="th">{ct("Balance before → after")}</th>
                <th className="th">{ct("Application")}</th>
                <th className="th">{ct("Reason")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {txs.length === 0 ? (
                <tr><td colSpan={7} className="td py-8 text-center text-slate-500">{ct("No transactions yet.")}</td></tr>
              ) : (
                txs.map(({ tx, applicationReference }) => (
                  <tr key={tx.id} className="tr-hover">
                    <td className="td whitespace-nowrap text-xs font-mono">{(tx as any).reference ?? tx.id.slice(0, 8)}</td>
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(tx.createdAt)}</td>
                    <td className="td">
                      <span className={`badge ${tx.type === "CREDIT" ? "bg-emerald-100 text-emerald-800" : tx.type === "DEBIT" ? "bg-red-100 text-red-700" : "bg-navy-900/5 text-navy-800"}`}>
                        {tx.type.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className={`td whitespace-nowrap tabular-nums font-medium ${tx.type === "DEBIT" || tx.type === "APPLICATION_CHARGE" ? "text-red-700" : "text-emerald-700"}`}>
                      {tx.type === "CREDIT" ? "+" : "−"}{formatAmount(tx.amount, "DZD", uiLocale)}
                    </td>
                    <td className="td whitespace-nowrap tabular-nums text-xs">
                      {formatAmount(tx.balanceBefore, "DZD", uiLocale)} → {formatAmount(tx.balanceAfter, "DZD", uiLocale)}
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
