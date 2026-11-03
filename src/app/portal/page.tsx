import Link from "next/link";
import { businessLabel } from "@/lib/business-labels";
import { portalPageUser } from "@/lib/page-auth";
import { activeVisaOptions, agencyDashboard } from "@/lib/queries";
import { formatAmount, formatDateTime } from "@/lib/format";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";
import { configName } from "@/lib/config-localization";
import { hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function PortalDashboardPage() {
  const user = await portalPageUser();
  const locale = await getUiLocale();
  const ct = contentT(locale);
  const [data, options] = await Promise.all([
    agencyDashboard(user.agencyId, user.id),
    activeVisaOptions(),
  ]);
  const destinations = [...new Map(options.map((option) => [option.countryId, option])).values()];
  const { totals, wallet } = data;
  const records = (rows: typeof data.recentApplications, attention = false) => (
    <ul className="travel-records">
      {rows.map((row) => (
        <li key={row.app.id}>
          <Link className="travel-record" href={`/portal/applications/${row.app.id}${attention ? "?tab=documents" : ""}`}>
            <span className="travel-record-destination">
              <span className="destination-code" aria-hidden="true">{row.countryIso2}</span>
              <span><strong>{countryName({ name: row.app.countryName, iso2: row.countryIso2 }, locale)}</strong><small>{configName({ name: row.app.visaTypeName, nameFr: row.visaNameFr, nameAr: row.visaNameAr }, locale)}</small></span>
            </span>
            <span className="travel-record-traveller"><strong>{row.applicantSummary}</strong><small><bdi>{row.app.reference}</bdi></small></span>
            <span className="travel-record-status"><StatusBadge code={row.statusCode} name={row.statusName} /><small>{formatDateTime(row.app.updatedAt, locale)}</small></span>
            <span className="travel-record-action">{ct(attention ? "Upload requested documents" : "Open dossier")}</span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <section className="agency-desk" aria-labelledby="agency-desk-heading">
        <header className="desk-heading">
          <h1 id="agency-desk-heading">{ct("Agency dashboard")}</h1>
          <p><bdi>{user.agencyName ?? user.name}</bdi></p>
        </header>
        <div className="desk-actions">
          <form action="/portal/applications/new" method="get" aria-labelledby="new-file-title">
            <h2 id="new-file-title">{ct("Create application")}</h2>
            <div className="desk-fields">
              <div>
                <label htmlFor="home-destination" className="label">{ct("Destination")}</label>
                <select id="home-destination" name="destination" className="input" defaultValue="">
                  <option value="">{ct("Choose a destination")}</option>
                  {destinations.map((option) => <option key={option.countryId} value={option.countryId}>{countryName({ name: option.countryName, iso2: option.countryIso2 }, locale)}</option>)}
                </select>
              </div>
              <button className="btn-primary" type="submit">{ct("Continue")}</button>
            </div>
          </form>
          <form action="/portal/applications" method="get" role="search" aria-labelledby="find-file-title">
            <h2 id="find-file-title">{ct("Find an application")}</h2>
            <div className="desk-fields">
              <div>
                <label htmlFor="home-reference" className="label">{ct("Reference or applicant")}</label>
                <input id="home-reference" name="q" className="input" type="search" dir="auto" />
              </div>
              <button className="btn-secondary" type="submit">{ct("Search")}</button>
            </div>
          </form>
        </div>
      </section>

      <nav className="agency-stats" aria-label={ct("Agency dashboard")}>
        <Link href="/portal/applications?queue=active"><strong>{totals.active}</strong><span>{ct("Active applications")}</span></Link>
        <Link href="/portal/applications?documents=requested"><strong>{(totals as { actionRequired?: number }).actionRequired ?? 0}</strong><span>{ct("Action required")}</span></Link>
        <Link href="/portal/applications?queue=completed"><strong>{totals.completed}</strong><span>{ct("Completed")}</span></Link>
        <Link href="/portal/wallet"><strong className="wallet-value tabular-nums">{formatAmount(wallet.balance, "DZD", locale)}</strong><span>{ct("Wallet balance")}</span></Link>
      </nav>

      {data.needsAttention.length > 0 ? <section className="agency-record-section" aria-labelledby="attention-heading">
        <div className="agency-section-header"><h2 id="attention-heading">{ct("Needs your attention")}</h2><Link href="/portal/applications?documents=requested">{ct("View all")}</Link></div>
        {records(data.needsAttention, true)}
      </section> : null}

      <section className="agency-record-section" aria-labelledby="recent-heading">
        <div className="agency-section-header"><h2 id="recent-heading">{ct("Recent applications")}</h2><Link href="/portal/applications">{ct("View all")}</Link></div>
        {data.recentApplications.length ? records(data.recentApplications) : <EmptyState title={ct("No applications yet")} body={ct("Submit your first visa application to see it tracked here.")} action={<Link href="/portal/applications/new" className="btn-primary">{ct("Create application")}</Link>} />}
      </section>

      {hasPermission(user,"transactions.view.own") ? <Card className="agency-wallet-ledger">
        <CardHeader title={ct("Recent wallet activity")} actions={<Link href="/portal/wallet" className="btn-secondary btn-sm">{ct("Ledger")}</Link>} />
        <ul className="divide-y divide-slate-100 px-4">
          {data.recentTx.length === 0 ? <li className="py-6 text-base text-slate-500">{ct("No transactions yet.")}</li> : data.recentTx.map((tx) => (
            <li key={tx.id} className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0"><p className="text-base font-semibold text-navy-900">{(tx as { reference?: string | null }).reference ?? businessLabel(tx.type, locale)}</p><p className="text-xs text-slate-500">{formatDateTime(tx.createdAt, locale)}</p></div>
              <span className={`whitespace-nowrap text-base font-semibold tabular-nums ${tx.type === "CREDIT" ? "text-emerald-700" : "text-red-700"}`}>{tx.type === "CREDIT" ? "+" : "-"}{formatAmount(tx.amount, "DZD", locale)}</span>
            </li>
          ))}
        </ul>
      </Card> : null}
    </>
  );
}
