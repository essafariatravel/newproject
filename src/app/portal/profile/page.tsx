import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, users } from "@/db/schema";
import { portalPageUser } from "@/lib/page-auth";
import { flashFrom } from "@/lib/action-helpers";
import { formatDateTime } from "@/lib/format";
import { createUserAction, updateUserAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/forms";
import { Card, CardHeader, Flash, KeyValue, PageHeader, TableWrap } from "@/components/ui";
import { hasPermission } from "@/lib/rbac";
import { formatAmount } from "@/lib/format";
import { getBalance } from "@/lib/wallet";
import BrandMark from "@/components/brand-mark";
import { agencyLogoUrl } from "@/lib/branding";
import { uploadOwnAgencyLogoAction, removeOwnAgencyLogoAction } from "@/app/actions/branding";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";

export const dynamic = "force-dynamic";

export default async function PortalProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await portalPageUser();
  const ct = contentT(await getUiLocale());
  const flash = flashFrom(sp);

  const [agencyRows, team, balance] = await Promise.all([
    db.select().from(agencies).where(eq(agencies.id, user.agencyId)).limit(1),
    db.select().from(users).where(eq(users.agencyId, user.agencyId)),
    getBalance(user.agencyId),
  ]);
  const agency = agencyRows[0];
  if (!agency) return null;
  const canManageUsers = hasPermission(user, "users.manage");

  return (
    <>
      <PageHeader title={ct("Profile")} subtitle={ct("Your agency account and team.")} />
      <Flash {...flash} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardHeader
              title={ct("Agency logo")}
              subtitle={
                user.role === "AGENCY_ADMIN"
                  ? ct("Shown on your portal. PNG, JPEG or WebP up to 2 MB.")
                  : ct("Only the agency administrator can change the logo.")
              }
            />
            <div className="flex flex-wrap items-center gap-4 px-5 py-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-ivory-200 bg-ivory-50">
                <BrandMark className="h-11 w-11" src={agencyLogoUrl(agency)} alt={agency.tradingName ?? agency.legalName} />
              </div>
              {user.role === "AGENCY_ADMIN" ? (
                <>
                  {agency.logoKey ? (
                    <form action={removeOwnAgencyLogoAction}>
                      <SubmitButton className="btn-danger btn-sm" pendingLabel={ct("Removing…")}>{ct("Remove logo")}</SubmitButton>
                    </form>
                  ) : null}
                  <form action={uploadOwnAgencyLogoAction} encType="multipart/form-data" className="flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      name="logo"
                      accept="image/png,image/jpeg,image/webp"
                      required
                      className="max-w-full text-xs file:mr-2 file:cursor-pointer file:rounded-full file:border-0 file:bg-iris-600 file:px-3.5 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                    />
                    <SubmitButton className="btn-secondary btn-sm" pendingLabel={ct("Uploading…")}>
                      {agency.logoKey ? ct("Replace logo") : ct("Upload logo")}
                    </SubmitButton>
                  </form>
                </>
              ) : (
                <p className="text-xs text-slate-400">{agency.logoKey ? ct("Uploaded.") : ct("No logo uploaded yet.")}</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={ct("Agency details")} subtitle={ct("Contact details are maintained by ESSAFARIA. Write to your account manager for changes.")} />
            <KeyValue
              items={[
                { label: ct("Legal name"), value: agency.legalName },
                { label: ct("Trading name"), value: agency.tradingName ?? "—" },
                { label: "Email", value: agency.email },
                { label: ct("Phone"), value: agency.phone ?? "—" },
                { label: ct("Address"), value: [agency.addressLine, agency.city, agency.country].filter(Boolean).join(", ") || "—" },
                { label: ct("Billing"), value: [agency.billingName, agency.billingEmail, agency.billingTaxId].filter(Boolean).join(" · ") || "—" },
                { label: ct("Wallet currency"), value: agency.currency },
                { label: ct("Partner since"), value: formatDateTime(agency.createdAt) },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title={ct("Team")} />
            <TableWrap>
              <thead className="border-b border-slate-100 bg-ivory-50/60">
                <tr>
                  <th className="th">{ct("Name")}</th>
                  <th className="th">{ct("Role")}</th>
                  <th className="th">{ct("Status")}</th>
                  <th className="th">{ct("Last login")}</th>
                  {canManageUsers ? <th className="th text-right">{ct("Actions")}</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {team.map((u) => (
                  <tr key={u.id} className="tr-hover">
                    <td className="td">
                      <span className="block font-medium text-navy-900">{u.name}</span>
                      <span className="block text-xs text-slate-400">{u.email}</span>
                    </td>
                    <td className="td"><span className="badge bg-navy-900/5 text-navy-800">{u.role.replaceAll("_", " ")}</span></td>
                    <td className="td">
                      <span className={`badge ${u.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{u.status}</span>
                    </td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : ct("never")}</td>
                    {canManageUsers ? (
                      <td className="td text-right">
                        {u.id !== user.id ? (
                          <form action={updateUserAction} className="inline">
                            <input type="hidden" name="id" value={u.id} />
                            <input type="hidden" name="back" value="/portal/profile" />
                            <input type="hidden" name="name" value={u.name} />
                            <input type="hidden" name="role" value={u.role} />
                            <input type="hidden" name="toggleStatus" value="1" />
                            <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                              {u.status === "ACTIVE" ? ct("Suspend") : ct("Activate")}
                            </SubmitButton>
                          </form>
                        ) : (
                          <span className="text-xs text-slate-400">{ct("you")}</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          {canManageUsers ? (
            <Card>
              <CardHeader title={ct("Add team member")} subtitle={ct("New members are always created as Agency User with the temporary password you set.")} />
              <form action={createUserAction} className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                <input type="hidden" name="back" value="/portal/profile" />
                <div>
                  <label className="label" htmlFor="p-name">{ct("Full name")} *</label>
                  <input id="p-name" name="name" required className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="p-email">{ct("Email")} *</label>
                  <input id="p-email" name="email" type="email" required className="input" />
                </div>
                <input type="hidden" name="role" value="AGENCY_USER" />
                <div>
                  <label className="label" htmlFor="p-password">{ct("Temporary password")} * (min 10)</label>
                  <input id="p-password" name="password" type="password" required minLength={10} className="input" />
                </div>
                <div className="lg:col-span-3">
                  <SubmitButton className="btn-primary" pendingLabel={ct("Creating…")}>{ct("Create team member")}</SubmitButton>
                </div>
              </form>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={ct("Wallet")} />
            <div className="px-4 py-4">
              <p className="font-serif text-2xl text-navy-900 tabular-nums">{formatAmount(balance.balance, balance.currency)}</p>
              <p className="mt-1 text-xs text-slate-500">{ct("Prepaid balance available for application charges.")}</p>
            </div>
          </Card>
          <Card>
            <CardHeader title={ct("Your account")} />
            <div className="px-4 py-4 text-sm text-slate-700">
              <p>{user.name}</p>
              <p className="text-xs text-slate-400">{user.email}</p>
              <p className="mt-2 text-xs">
                {ct("Role")}: <span className="badge bg-gold-100 text-gold-600">{user.role.replaceAll("_", " ")}</span>
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
