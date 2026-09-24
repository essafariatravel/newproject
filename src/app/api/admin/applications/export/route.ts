import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { exportApplications, EXPORT_ROW_LIMIT, type ApplicationFilters } from "@/lib/queries";
import { recordAudit } from "@/lib/audit";
import { pickUiLocale } from "@/lib/ui-i18n";
import { countryName } from "@/lib/country-names";
import { toCsv, toXlsx, XLSX_CONTENT_TYPE, type Column } from "@/lib/tabular-export";

/**
 * Staff export of the applications list — CSV or XLSX.
 *
 * The specification requires exports to be scoped by RBAC, tenant AND the active
 * filter. All three are enforced here on the server:
 *  - RBAC: agency roles are refused outright (this is a back-office tool) and the
 *    staff role must hold `applications.view.all`;
 *  - tenant: `exportApplications` applies the same conditions as the list, which
 *    pin an agency actor to its own rows;
 *  - active filter: the query string is interpreted with the exact same parser
 *    as the list page, so what is exported is what is on screen.
 *
 * Every export is audited with the filter that produced it.
 */
export const dynamic = "force-dynamic";

function filtersFrom(url: URL): ApplicationFilters {
  const sp = url.searchParams;
  const one = (key: string) => {
    const value = sp.get(key);
    return value && value.trim() !== "" ? value.trim() : undefined;
  };
  const aging = Number(one("aging") ?? "");
  return {
    q: one("q"),
    agencyId: one("agency"),
    visaTypeId: one("visa"),
    statusCode: one("status"),
    priorityCode: one("priority"),
    dateFrom: one("from"),
    dateTo: one("to"),
    assignedTo: one("assigned"),
    documents: sp.get("documents") === "requested" || sp.get("documents") === "missing" ? (sp.get("documents") as "requested" | "missing") : undefined,
    agingDays: Number.isFinite(aging) && aging > 0 ? aging : undefined,
  };
}

export async function GET(request: Request) {
  // Route handlers answer with status codes (a thrown guard would surface as a
  // 500 and risk leaking internals) — anonymous callers get a clean 401.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 });
  }
  if (user.agencyId) {
    // An agency actor gets the portal's own scoped surfaces, never the
    // back-office export (and no row of another tenant can leak through it).
    return NextResponse.json({ error: "FORBIDDEN", message: "This export is available to ESSAFARIA staff only." }, { status: 403 });
  }
  if (!hasPermission(user, "applications.view.all")) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Your role cannot export applications." }, { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const locale = pickUiLocale(url.searchParams.get("lang")) ?? "en";
  const filters = filtersFrom(url);

  const { rows, truncated } = await exportApplications(user, filters);

  const columns: Column[] = [
    { key: "reference", header: "Reference" },
    { key: "agency", header: "Agency" },
    { key: "applicant", header: "Applicant" },
    { key: "country", header: "Country" },
    { key: "visaType", header: "Visa type" },
    { key: "status", header: "Status" },
    { key: "priority", header: "Priority" },
    { key: "owner", header: "Owner" },
    { key: "fee", header: "Fee (DZD)", kind: "money" },
    { key: "submitted", header: "Submitted" },
    { key: "waitingDays", header: "Days in status", kind: "number" },
    { key: "updated", header: "Last update" },
  ];

  const data = rows.map((r) => ({
    reference: r.app.reference,
    agency: r.agencyName ?? "",
    applicant: r.applicantSummary ?? "",
    // Localized destination name, so EN/FR/AR exports match the UI language.
    country: countryName({ name: r.app.countryName, iso2: r.countryIso2 }, locale),
    visaType: r.app.visaTypeName,
    status: r.statusName,
    priority: r.priorityName,
    owner: r.ownerName ?? "",
    fee: Number(r.app.fee),
    submitted: r.app.submittedAt ? new Date(r.app.submittedAt).toISOString().slice(0, 10) : "",
    waitingDays: Math.max(0, Math.floor((Date.now() - new Date(r.statusSince).getTime()) / 86_400_000)),
    updated: new Date(r.app.updatedAt).toISOString().slice(0, 10),
  }));

  await recordAudit({
    actor: user,
    action: "APPLICATIONS_EXPORTED",
    entity: "application",
    metadata: { format, rows: data.length, truncated, filters },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const headers = { "Cache-Control": "no-store" } as Record<string, string>;
  if (truncated) headers["X-Export-Truncated"] = `true (limit ${EXPORT_ROW_LIMIT})`;

  if (format === "xlsx") {
    const buffer = toXlsx("Applications", columns, data);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        ...headers,
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="applications-${stamp}.xlsx"`,
      },
    });
  }

  return new NextResponse(toCsv(columns, data), {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="applications-${stamp}.csv"`,
    },
  });
}
