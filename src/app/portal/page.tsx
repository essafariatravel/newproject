import { businessLabel } from "@/lib/business-labels";
import Link from "next/link";
import { portalPageUser } from "@/lib/page-auth";
import { agencyDashboard } from "@/lib/queries";
import { formatAmount, formatDateTime } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";

export const dynamic = "force-dynamic";

export default async function PortalDashboardPage() {
  const user = await portalPageUser();
  const uiLocale = await getUiLocale();
  const ct = contentT(uiLocale);
  const data = await agencyDashboard(user.agencyId, user.id);
  const needsAttention = data.needsAttention;
  const { totals, wallet } = data;
  const actionRequired = (totals as { actionRequired?: number }).actionRequired ?? 0;

  return (
    <div className="travel-dashboard travel-workspace">
      <PageHeader
        title={`${ct("Welcome")}, ${user.agencyName ?? user.name}`}
        subtitle={ct("Agency dashboard")}
        actions={
          <Link href="/portal/applications/new" className="btn-primary btn-sm">
            {ct("+ New application")}
          </Link>
        }
      />

      <dl className="travel-summary-strip mb-4" aria-label={ct("Agency dashboard")}>
        <Link href="/portal/applications" className="travel-summary-item block">
          <dt>{ct("Active applications")}</dt>
          <dd>{totals.active}</dd>
        </Link>
        <Link href="/portal/applications?status=APPROVED" className="travel-summary-item block">
          <dt>{ct("Completed")}</dt>
          <dd>{totals.completed}</dd>
        </Link>
        <Link href="/portal/wallet" className="travel-summary-item block">
          <dt>{ct("Wallet balance")}</dt>
          <dd className="whitespace-nowrap text-[.82rem] sm:text-base">{formatAmount(wallet.balance, "DZD", uiLocale)}</dd>
        </Link>
      </dl>

      <section className="travel-section" aria-labelledby="agency-attention-title">
        {actionRequired > 0 ? (
          <div className="travel-attention">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="agency-attention-title" className="text-sm font-semibold text-navy-900">{ct("Action required")}</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  {actionRequired} {ct("application(s) need a document replacement or additional upload.")}
                </p>
              </div>
              <Link href="/portal/applications?documents=requested" className="travel-inline-link whitespace-nowrap">{ct("Review")} →</Link>
            </div>
            {needsAttention.length > 0 ? (
              <div className="mt-2 travel-record-list border-b-0">
                {needsAttention.slice(0, 3).map((r) => (
                  <Link key={r.app.id} href={`/portal/applications/${r.app.id}?tab=documents`} className="travel-record">
                    <div className="travel-record-primary">
                      <span className="travel-record-title">{r.applicantSummary}</span>
                      <StatusBadge code={r.statusCode} name={r.statusName} />
                    </div>
                    <div className="travel-record-subtitle">
                      {countryName({ name: r.app.countryName, iso2: r.countryIso2 }, uiLocale)} · {r.app.visaTypeName}
                    </div>
                    <div className="travel-record-meta">
                      <span>{r.app.reference}</span>
                      <span>{formatAmount(r.app.fee, "DZD", uiLocale)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="travel-attention travel-attention--quiet flex items-center justify-between gap-3">
            <div>
              <h2 id="agency-attention-title" className="text-xs font-semibold text-navy-900">{ct("No action required")}</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">{ct("All your applications are in order.")}</p>
            </div>
            {data.unreadNotifications > 0 ? (
              <Link href="/portal/notifications" className="travel-inline-link">{data.unreadNotifications} {ct("unread")}</Link>
            ) : null}
          </div>
        )}
      </section>

      <section className="travel-section" aria-labelledby="recent-applications-title">
        <div className="travel-section-heading">
          <div>
            <h2 id="recent-applications-title">{ct("Recent applications")}</h2>
            <p>{ct("Your latest visa files and their current state")}</p>
          </div>
          <Link href="/portal/applications" className="travel-inline-link">{ct("View all")} →</Link>
        </div>
        {data.recentApplications.length === 0 ? (
          <EmptyState
            title={ct("No applications yet")}
            body={ct("Submit your first visa application to see it tracked here.")}
            action={<Link href="/portal/applications/new" className="btn-primary btn-sm">{ct("Create application")}</Link>}
          />
        ) : (
          <div className="travel-record-list">
            {data.recentApplications.map((r) => (
              <Link key={r.app.id} href={`/portal/applications/${r.app.id}`} className="travel-record md:grid md:grid-cols-[1.2fr_1fr_auto] md:items-center md:gap-x-5">
                <div>
                  <div className="travel-record-primary md:block">
                    <span className="travel-record-title">{(r as { applicantSummary?: string }).applicantSummary ?? "—"}</span>
                    <span className="md:hidden"><StatusBadge code={r.statusCode} name={r.statusName} /></span>
                  </div>
                  <div className="travel-record-meta">
                    <span>{r.app.reference}</span>
                    <span>{formatDateTime(r.app.createdAt, uiLocale)}</span>
                  </div>
                </div>
                <div className="travel-record-subtitle">
                  {countryName({ name: r.app.countryName, iso2: r.countryIso2 }, uiLocale)} · {r.app.visaTypeName}
                </div>
                <span className="hidden md:block"><StatusBadge code={r.statusCode} name={r.statusName} /></span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="travel-section" aria-labelledby="wallet-activity-title">
        <div className="travel-section-heading">
          <div>
            <h2 id="wallet-activity-title">{ct("Recent financial activity")}</h2>
            <p>{ct("Latest wallet movements")}</p>
          </div>
          <Link href="/portal/wallet" className="travel-inline-link">{ct("Ledger")} →</Link>
        </div>
        {data.recentTx.length === 0 ? (
          <p className="py-3 text-xs text-slate-500">{ct("No transactions yet.")}</p>
        ) : (
          <ul className="travel-record-list">
            {data.recentTx.map((tx) => (
              <li key={tx.id} className="travel-record grid grid-cols-[1fr_auto] items-center gap-x-4">
                <div className="min-w-0">
                  <p className="travel-record-title truncate">{(tx as { reference?: string | null }).reference ?? businessLabel(tx.type, uiLocale)}</p>
                  <p className="travel-record-meta mt-1">{formatDateTime(tx.createdAt, uiLocale)}</p>
                </div>
                <span className={`whitespace-nowrap text-sm font-semibold tabular-nums ${tx.type === "CREDIT" ? "text-emerald-700" : "text-red-700"}`}>
                  {tx.type === "CREDIT" ? "+" : "−"}{formatAmount(tx.amount, "DZD", uiLocale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
