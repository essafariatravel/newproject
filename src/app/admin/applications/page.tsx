import Link from "next/link";
import { pageUser } from "@/lib/page-auth";
import { hasPermission } from "@/lib/rbac";
import { searchApplications, resolvePageSize } from "@/lib/queries";
import { staffDirectory } from "@/app/actions/communications";
import { listAgencies, activeVisaOptions, listStatuses, listPriorities } from "@/lib/applications-exports";
import { flashFrom } from "@/lib/action-helpers";
import { formatAmount, formatDate } from "@/lib/format";
import { elapsedDays, elapsedLabel, waitingBand, type WaitingBand } from "@/lib/time-in-status";
import { FilterBar, Pagination, PageSizeSelector } from "@/components/app-widgets";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { bulkAssignAction, bulkPriorityAction } from "@/app/actions/applications";
import { getUiLocale, localizedPriority, localizedStatusName } from "@/lib/ui-i18n";
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

  // The export links must carry exactly the filters in the address bar.
  const exportQuery = new URLSearchParams(
    Object.entries({
      q: sp.q,
      agency: sp.agency,
      visa: sp.visa,
      status: sp.status,
      priority: sp.priority,
      from: sp.from,
      to: sp.to,
      assigned: sp.assigned,
      documents: sp.documents,
      aging: sp.aging,
      lang: uiLocale,
    }).filter(([, v]) => v !== undefined && v !== "") as [string, string][],
  );
  const canBulk = hasPermission(user, "applications.assign") || hasPermission(user, "applications.review");
  const canAssign = hasPermission(user, "applications.assign");

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
      pageSize: resolvePageSize(sp.per),
    }),
    hasPermission(user, "agencies.view") ? listAgencies() : Promise.resolve([]),
    activeVisaOptions(),
    listStatuses(true),
    listPriorities(true),
  ]);
  // Only staff assignable to dossiers (never agency accounts) — same directory
  // the dossier page uses, so the two screens can never disagree.
  const officers = hasPermission(user, "applications.assign") ? await staffDirectory() : [];

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
          { name: "status", label: ct("Status"), type: "select", value: sp.status, options: statuses.map((s) => ({ value: s.code, label: localizedStatusName(s.code, s.name, uiLocale) })) },
          { name: "priority", label: ct("Priority"), type: "select", value: sp.priority, options: priorities.map((p) => ({ value: p.code, label: localizedPriority(p.code, p.name, uiLocale) })) },
          { name: "from", label: ct("From"), type: "date", value: sp.from },
          { name: "to", label: ct("To"), type: "date", value: sp.to },
        ]}
      />

      {/* §exports — same filters, same rows: the export links carry the ACTIVE
          filter so what leaves the platform is what the user is looking at. */}
      {result.rows.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2" data-testid="export-bar">
          <p className="text-xs text-slate-500">
            {ct("Showing")} {result.rows.length} / {result.total} {ct("applications")}
            {result.pageCount > 1 ? ` · ${ct("page")} ${result.page}/${result.pageCount}` : ""}
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">{ct("Export this view")}:</span>
            <a href={`/api/admin/applications/export?${exportQuery.toString()}`} className="btn-secondary btn-sm" data-testid="export-csv">
              {ct("CSV")}
            </a>
            <a href={`/api/admin/applications/export?${new URLSearchParams({ ...Object.fromEntries(exportQuery), format: "xlsx" }).toString()}`} className="btn-secondary btn-sm" data-testid="export-xlsx">
              {ct("Excel")}
            </a>
          </div>
        </div>
      ) : null}

      {result.rows.length === 0 ? (
        <div className="card">
          <EmptyState title={ct("No applications found")} body={ct("Try adjusting the filters, or wait for agencies to submit applications.")} />
        </div>
      ) : (
        <>
          {/* §safe bulk — assign / priority only. No bulk approve, reject, debit
              or delete exists anywhere in the product. */}
          {canBulk ? (
            <form id="bulk-form" action={bulkAssignAction} className="card mb-3 flex flex-wrap items-end gap-3 p-3" data-testid="bulk-bar">
              {canAssign ? (
                <div className="min-w-[200px]">
                  <label className="label" htmlFor="bulk-assignedTo">{ct("Assign selected to")}</label>
                  <select id="bulk-assignedTo" name="assignedTo" className="input">
                    <option value="">{ct("Unassign")}</option>
                    {officers.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="min-w-[200px]">
                <label className="label" htmlFor="bulk-priority">{ct("Set priority to")}</label>
                <select id="bulk-priority" name="priorityId" className="input">
                  <option value="">{ct("Leave unchanged")}</option>
                  {priorities.map((p) => (
                    <option key={p.id} value={p.id}>{localizedPriority(p.code, p.name, uiLocale)}</option>
                  ))}
                </select>
              </div>
              {canAssign ? (
                <button type="submit" className="btn-primary btn-sm" formAction={bulkAssignAction}>{ct("Apply to selected")}</button>
              ) : null}
              <button type="submit" className="btn-secondary btn-sm" formAction={bulkPriorityAction} formNoValidate>{ct("Apply priority")}</button>
              <p className="w-full text-xs text-slate-400">{ct("Finished dossiers (approved, rejected, cancelled) are skipped — outcomes are never changed in bulk.")}</p>
            </form>
          ) : null}

          <TableWrap>
            <thead className="border-b border-slate-100 bg-ivory-50/60">
              <tr>
                {canBulk ? <th className="th w-8">{ct("Select")}</th> : null}
                <th className="th">{ct("Applicants")}</th>
                <th className="th">{ct("Agency")}</th>
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
                  {canBulk ? (
                    <td className="td">
                      <input
                        type="checkbox"
                        name="ids"
                        value={r.app.id}
                        form="bulk-form"
                        aria-label={`${ct("Select")} ${r.app.reference}`}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                  ) : null}
                  <td className="td">
                    <Link href={`/admin/applications/${r.app.id}`} className="block max-w-[200px] truncate font-semibold text-navy-900 hover:underline" title={r.applicantSummary ?? r.app.reference}>
                      {r.applicantSummary ?? r.app.reference}
                    </Link>
                    {r.applicantSummary ? <span className="block text-xs text-slate-500">{r.app.reference}</span> : null}
                  </td>
                  <td className="td max-w-[160px] truncate">{r.agencyName}</td>
                  <td className="td">
                    <span className="block">{countryName({ name: r.app.countryName, iso2: r.countryIso2 }, uiLocale)}</span>
                    <span className="block text-xs text-slate-400">{r.app.visaTypeName}</span>
                  </td>
                  <td className="td whitespace-nowrap tabular-nums">
                    {formatAmount(r.app.fee, "DZD", uiLocale)}
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
            query={{ q: sp.q, agency: sp.agency, visa: sp.visa, status: sp.status, priority: sp.priority, from: sp.from, to: sp.to, assigned: sp.assigned, documents: sp.documents, aging: sp.aging, view: sp.view, per: sp.per }}
          />
          <div className="flex justify-end">
            <PageSizeSelector
              locale={uiLocale}
              pageSize={resolvePageSize(sp.per)}
              basePath="/admin/applications"
              query={{ q: sp.q, agency: sp.agency, visa: sp.visa, status: sp.status, priority: sp.priority, from: sp.from, to: sp.to, assigned: sp.assigned, documents: sp.documents, aging: sp.aging, view: sp.view }}
            />
          </div>
        </>
      )}
    </>
  );
}
