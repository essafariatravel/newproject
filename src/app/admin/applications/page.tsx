import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { searchApplications } from "@/lib/queries";
import { listAgencies, activeVisaOptions, listStatuses, listPriorities } from "@/lib/applications-exports";
import { flashFrom } from "@/lib/action-helpers";
import { formatDate } from "@/lib/format";
import { elapsedDays, elapsedLabel, waitingBand, type WaitingBand } from "@/lib/time-in-status";
import { FilterBar, Pagination } from "@/components/app-widgets";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { getUiLocale } from "@/lib/ui-i18n";
import { contentT } from "@/lib/i18n-content";
import { countryName } from "@/lib/country-names";

export const dynamic = "force-dynamic";

/** Presentation-only tone for the waiting column (§31). */
function waitingClass(band: WaitingBand): string {
  if (band === "aging") return "font-semibold text-rose-600";
  if (band === "waiting") return "text-amber-600";
  return "text-slate-500";
}

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const uiLocale = await getUiLocale();
  const ct = contentT(uiLocale);
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) sp[k] = typeof v === "string" ? v : undefined;
  const user = await pageUser();
  const flash = flashFrom(sp);

  // §27 — saved operational views. Each one is a plain, shareable URL that
  // applies the same server-side filters as doing it by hand.
  const savedViews = [
    { id: "mine", label: ct("My applications"), query: "assigned=me" },
    { id: "unassigned", label: ct("Unassigned"), query: "assigned=unassigned" },
    { id: "docs-requested", label: ct("Documents requested"), query: "documents=requested" },
    { id: "docs-missing", label: ct("Documents missing"), query: "documents=missing" },
    { id: "in-process", label: ct("In process"), query: "status=IN_PROCESS" },
    { id: "embassy", label: ct("Sent to embassy"), query: "status=EMBASSY_SENT" },
    { id: "urgent", label: ct("Urgent"), query: "priority=URGENT" },
    { id: "aging", label: ct("Waiting over 7 days"), query: "aging=7" },
  ];
  const activeView = savedViews.find((v) => v.id === sp.view)?.id ?? "";

  const [result, agencies, visaOptions, statuses, priorities] = await Promise.all([
    searchApplications(user, {
      q: sp.q,
      agencyId: sp.agency,
      visaTypeId: sp.visa,
      statusCode: sp.status,
      priorityCode: sp.priority,
      dateFrom: sp.from,
      dateTo: sp.to,
      assignedTo: sp.assigned,
      documents: sp.documents === "requested" || sp.documents === "missing" ? sp.documents : undefined,
      agingDays: Number(sp.aging ?? "") > 0 ? Number(sp.aging) : undefined,
      page: Number(sp.page ?? "1") || 1,
    }),
    hasPermission(user, "agencies.view") ? listAgencies() : Promise.resolve([]),
    activeVisaOptions(),
    listStatuses(true),
    listPriorities(true),
  ]);

  return (
    <>
      <PageHeader title={ct("Applications")} subtitle={ct("All visa applications across partner agencies.")} />
      <Flash {...flash} />

      {/* §27 — saved views */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5" data-testid="saved-views">
        {savedViews.map((v) => (
          <Link
            key={v.id}
            href={`/admin/applications?view=${v.id}&${v.query}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeView === v.id
                ? "border-iris-300 bg-iris-50 text-iris-700"
                : "border-slate-200 bg-white text-slate-500 hover:border-iris-200 hover:text-navy-900"
            }`}
          >
            {v.label}
          </Link>
        ))}
        {activeView ? (
          <Link href="/admin/applications" className="px-2 text-xs text-slate-400 underline">
            {ct("Clear view")}
          </Link>
        ) : null}
      </div>

      <FilterBar locale={uiLocale}
        action="/admin/applications"
        fields={[
          { name: "q", label: ct("Search"), type: "text", value: sp.q, placeholder: ct("Reference, applicant, passport…") },
          {
            name: "agency",
            label: ct("Agency"),
            type: "select",
            value: sp.agency,
            options: agencies.map((a) => ({ value: a.agency.id, label: a.agency.tradingName ?? a.agency.legalName })),
          },
          {
            name: "visa",
            label: ct("Visa type"),
            type: "select",
            value: sp.visa,
            options: visaOptions.map((v) => ({ value: v.id, label: v.label })),
          },
          { name: "status", label: ct("Status"), type: "select", value: sp.status, options: statuses.map((s) => ({ value: s.code, label: s.name })) },
          { name: "priority", label: ct("Priority"), type: "select", value: sp.priority, options: priorities.map((p) => ({ value: p.code, label: p.name })) },
          { name: "from", label: ct("From"), type: "date", value: sp.from },
          { name: "to", label: ct("To"), type: "date", value: sp.to },
        ]}
      />

      {result.rows.length === 0 ? (
        <div className="card">
          <EmptyState title={ct("No applications found")} body={ct("Try adjusting the filters, or wait for agencies to submit applications.")} />
        </div>
      ) : (
        <>
          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                <th className="th">{ct("Reference")}</th>
                <th className="th">{ct("Agency")}</th>
                <th className="th">{ct("Applicants")}</th>
                <th className="th">{ct("Visa / Country")}</th>
                <th className="th">{ct("Fee")}</th>
                <th className="th">{ct("Priority")}</th>
                <th className="th">{ct("Status")}</th>
                <th className="th">{ct("Owner")}</th>
                <th className="th">{ct("Waiting")}</th>
                <th className="th">{ct("Submitted")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map((r) => (
                <tr key={r.app.id} className="tr-hover">
                  <td className="td">
                    <Link href={`/admin/applications/${r.app.id}`} className="font-medium text-navy-900 hover:underline">
                      {r.app.reference}
                    </Link>
                  </td>
                  <td className="td max-w-[160px] truncate">{r.agencyName}</td>
                  <td className="td">
                    <span className="block max-w-[180px] truncate text-xs" title={r.applicantSummary ?? ""}>
                      {r.applicantSummary ?? "—"}
                    </span>
                  </td>
                  <td className="td">
                    <span className="block">{countryName({ name: r.app.countryName, iso2: r.countryIso2 }, uiLocale)}</span>
                    <span className="block text-xs text-slate-400">{r.app.visaTypeName}</span>
                  </td>
                  <td className="td whitespace-nowrap tabular-nums">
                    {r.app.fee} DZD
                  </td>
                  <td className="td">
                    <PriorityBadge name={r.priorityName} weight={r.priorityWeight} />
                  </td>
                  <td className="td">
                    <StatusBadge code={r.statusCode} name={r.statusName} />
                  </td>
                  <td className="td whitespace-nowrap text-xs">
                    {r.ownerName ? (
                      <span className="text-navy-800">{r.ownerName}</span>
                    ) : (
                      <span className="text-slate-400">{ct("Unassigned")}</span>
                    )}
                  </td>
                  <td className="td whitespace-nowrap text-xs" data-testid="waiting-cell">
                    <span className={waitingClass(waitingBand(elapsedDays(new Date(r.statusSince))))}>
                      {elapsedLabel(new Date(r.statusSince), uiLocale)}
                    </span>
                  </td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">
                    {r.app.submittedAt ? formatDate(r.app.submittedAt, uiLocale) : "— (draft)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            basePath="/admin/applications"
            query={{ q: sp.q, agency: sp.agency, visa: sp.visa, status: sp.status, priority: sp.priority, from: sp.from, to: sp.to, assigned: sp.assigned, documents: sp.documents, aging: sp.aging, view: sp.view }}
          />
        </>
      )}
    </>
  );
}
