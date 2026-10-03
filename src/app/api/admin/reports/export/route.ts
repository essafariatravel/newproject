import { contentT } from "@/lib/i18n-content";
import { getUiLocale, localizedStatusName, localizedPriority } from "@/lib/ui-i18n";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { reportData } from "@/lib/queries";
import { parseReportFilters } from "@/lib/report-filters";
import { recordAudit } from "@/lib/audit";
import { toCsv, toXlsx, XLSX_CONTENT_TYPE, type Column, type Row } from "@/lib/tabular-export";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";

/**
 * Reports export (DZD only) — CSV or XLSX.
 *
 * §"Reports DZD by agency-country-status-visa-priority": the workbook carries one
 * sheet-equivalent section per breakdown, all amounts in DZD, plus the average
 * processing time — which is computed from real submitted/decision timestamps
 * only and is exported as empty (not zero) when nothing has been decided yet.
 */
export const dynamic = "force-dynamic";

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
    return NextResponse.json({ error: "FORBIDDEN", message: "Reports are available to ESSAFARIA staff only." }, { status: 403 });
  }
  if (!hasPermission(user, "reports.view")) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Your role cannot export reports." }, { status: 403 });
  }

  if (!await consumeAuthRateLimit("export-reports-user-minute", user.id, 10, 60_000)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const locale = await getUiLocale({ lang: url.searchParams.get("lang") });
  let filters;
  try { filters = parseReportFilters(Object.fromEntries(["from", "to", "agency", "country", "visa", "status", "priority", "officer"].map((key) => [key, url.searchParams.get(key) ?? undefined]))); }
  catch { return NextResponse.json({ error: "VALIDATION" }, { status: 400 }); }
  const data = await reportData(filters);

  const ct = contentT(locale);
  const columns: Column[] = [
    { key: "section", header: ct("Section") },
    { key: "label", header: ct("Label") },
    { key: "applications", header: ct("Applications"), kind: "number" },
    { key: "amountDzd", header: ct("Charged volume (DZD)"), kind: "money" },
    { key: "metric", header: ct("Metric") },
    { key: "value", header: ct("Value") },
  ];

  const rows: Row[] = [];
  for (const r of data.byAgency) rows.push({ section: ct("By agency"), label: r.agencyName ?? "—", applications: Number(r.total), amountDzd: Number(r.charged) });
  for (const r of data.byCountry) rows.push({ section: ct("By country"), label: r.countryName ?? "—", applications: Number(r.total), amountDzd: Number(r.revenue) });
  for (const r of data.byVisaType) rows.push({ section: ct("By visa type"), label: r.visaTypeName ?? "—", applications: Number(r.total), amountDzd: null });
  for (const r of data.byStatus) rows.push({ section: ct("By status"), label: localizedStatusName(r.statusCode, r.statusName, locale), applications: Number(r.total), amountDzd: null });
  for (const r of data.byPriority) rows.push({ section: ct("By priority"), label: localizedPriority(r.priorityName.toUpperCase(), r.priorityName, locale), applications: Number(r.total), amountDzd: null });

  const wallet = data.walletFlow!;
  rows.push({ section: ct("Wallet (DZD)"), label: ct("Credits"), applications: null, amountDzd: Number(wallet.credits) });
  rows.push({ section: ct("Wallet (DZD)"), label: ct("Manual debits"), applications: null, amountDzd: Number(wallet.debits) });
  rows.push({ section: ct("Wallet (DZD)"), label: ct("Application charges"), applications: null, amountDzd: Number(wallet.charges) });

  const processing = data.processing;
  rows.push({
    section: ct("Processing"),
    label: ct("Decided dossiers"),
    metric: ct("Count"),
    value: Number(processing.decided ?? 0),
  });
  rows.push({
    section: ct("Processing"),
    label: ct("Average processing time"),
    metric: ct("Days (submitted → decision, real timestamps)"),
    // Empty, never 0: no decided dossier means the metric does not exist yet.
    value: processing.avgDays === null ? null : Number(Number(processing.avgDays).toFixed(2)),
  });
  rows.push({
    section: ct("Processing"),
    label: ct("Fastest decision"),
    metric: ct("Days"),
    value: processing.fastestDays === null ? null : Number(Number(processing.fastestDays).toFixed(2)),
  });
  rows.push({
    section: ct("Processing"),
    label: ct("Slowest decision"),
    metric: ct("Days"),
    value: processing.slowestDays === null ? null : Number(Number(processing.slowestDays).toFixed(2)),
  });

  await recordAudit({ actor: user, action: "REPORTS_EXPORTED", entity: "report", metadata: { format, rows: rows.length, filters } });

  const stamp = new Date().toISOString().slice(0, 10);
  const headers = { "Cache-Control": "no-store" };
  if (format === "xlsx") {
    const buffer = toXlsx(ct("Reports"), columns, rows);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { ...headers, "Content-Type": XLSX_CONTENT_TYPE, "Content-Disposition": `attachment; filename="reports-${stamp}.xlsx"` },
    });
  }
  return new NextResponse(toCsv(columns, rows, { locale, excel: true }), {
    headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="reports-${stamp}.csv"` },
  });
}
