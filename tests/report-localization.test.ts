import { afterEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { inflateRawSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, priorities, statuses, visaTypes } from "@/db/schema";
import { createDraftApplication } from "@/lib/applications";
import { reportData } from "@/lib/queries";
import { parseReportFilters } from "@/lib/report-filters";
import * as uiI18n from "@/lib/ui-i18n";
import { localizedPriority } from "@/lib/ui-i18n";
import { FilterBar } from "@/components/app-widgets";
import ReportsPage from "@/app/admin/reports/page";
import { GET } from "@/app/api/admin/reports/export/route";

suiteSetup();
afterEach(() => { request.cookie = ""; vi.restoreAllMocks(); });

async function translatedFixture() {
  const actor = await userByEmail("admin@test.example"), agency = await agencyByEmail("ops@agencya.example");
  const [base] = await db.select().from(visaTypes).where(eq(visaTypes.code, "JP-BUS"));
  const [visa] = await db.insert(visaTypes).values({ ...base!, id: undefined, code: `LOCALE_${crypto.randomUUID().slice(0, 8)}`,
    name: "Owner English programme", nameFr: "Programme approuvé", nameAr: "برنامج معتمد" }).returning();
  const [urgent] = await db.update(priorities).set({ name: "Owner expedited label" }).where(eq(priorities.code, "URGENT")).returning();
  const [submitted] = await db.select().from(statuses).where(eq(statuses.code, "SUBMITTED"));
  const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa!.id, createdBy: actor });
  await db.update(applications).set({ priorityId: urgent!.id, statusId: submitted!.id,
    submittedAt: new Date("2026-06-05T12:00:00Z") }).where(eq(applications.id, app.id));
  request.cookie = (await createSession(actor.id)).token;
  return { visa: visa!, agency, query: { from: "2026-06-05", to: "2026-06-05", agency: agency.id, visa: visa!.id } };
}

/** Inspect the real server page's filter and table props; this is not browser acceptance. */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  const result: ReactElement<Record<string, unknown>>[] = [];
  Children.forEach(node, child => {
    if (isValidElement<Record<string, unknown>>(child)) {
      result.push(child); result.push(...elements(child.props.children as ReactNode));
    }
  });
  return result;
}
function sheetXml(bytes: Buffer) {
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const compressed = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"), start = offset + 30 + nameLength + extra;
    if (name === "xl/worksheets/sheet1.xml") return inflateRawSync(bytes.subarray(start, start + compressed)).toString("utf8");
    offset = start + compressed;
  }
  throw new Error("Workbook has no worksheet");
}

describe("report labels follow canonical codes and configured translations", () => {
  it("returns the canonical priority code and configured visa translations without rewriting the snapshot", async () => {
    const { query, visa } = await translatedFixture();
    const data = await reportData(parseReportFilters(query));
    expect(data.byPriority).toEqual([{ priorityCode: "URGENT", priorityName: "Owner expedited label", total: 1 }]);
    expect(data.byVisaType).toEqual([{ visaTypeId: visa.id, visaTypeName: visa.name, visaTypeNameFr: visa.nameFr, visaTypeNameAr: visa.nameAr, total: 1 }]);
  });
  it.each(["fr", "ar"] as const)("%s server page uses configured programme labels and the canonical renamed priority", async locale => {
    const { query, visa } = await translatedFixture();
    // The shared module registry can retain header mocks from other suites.
    // Pin the page's UI locale boundary; cookie/browser acceptance is separate.
    vi.spyOn(uiI18n, "getUiLocale").mockResolvedValue(locale);
    const tree = elements(await ReportsPage({ searchParams: Promise.resolve({ ...query, lang: locale }) }));
    const filter = tree.find(element => element.type === FilterBar)!;
    const fields = filter.props.fields as Array<{ name: string; options?: Array<{ value: string; label: string }> }>;
    const name = locale === "fr" ? visa.nameFr : visa.nameAr;
    expect(fields.find(field => field.name === "visa")!.options!.find(option => option.value === visa.id)?.label).toBe(name);
    expect(tree.filter(element => element.type === "span").map(element => element.props.children)).toContain(name);
    expect(tree.filter(element => element.type === "td").map(element => element.props.children)).toContain(localizedPriority("URGENT", "Owner expedited label", locale));
    expect(tree.filter(element => element.type === "td").map(element => element.props.children)).not.toContain("Owner expedited label");
  });
  it.each((["fr", "ar"] as const).flatMap(locale => (["csv", "xlsx"] as const).map(format => [locale, format] as const)))("%s %s export uses the same configured programme and canonical priority labels", async (locale, format) => {
    const { query, visa } = await translatedFixture();
    const params = new URLSearchParams({ ...query, lang: locale, format });
    const response = await GET(new Request(`http://localhost/api/admin/reports/export?${params}`));
    expect(response.status).toBe(200);
    const body = format === "csv" ? await response.text() : sheetXml(Buffer.from(await response.arrayBuffer()));
    expect(body).toContain(locale === "fr" ? visa.nameFr! : visa.nameAr!);
    expect(body).toContain(localizedPriority("URGENT", "Owner expedited label", locale));
    expect(body).not.toContain("Owner English programme"); expect(body).not.toContain("Owner expedited label");
  });
});
