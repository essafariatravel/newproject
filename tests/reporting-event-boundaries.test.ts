import { afterEach, describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { suiteSetup } from "./helpers/global-state";
import { agencyByEmail, userByEmail } from "./helpers/fixtures";
import { request } from "./helpers/request";
import { createSession } from "./helpers/authenticated-session";
import { db } from "@/lib/db";
import { applications, documents, documentTypes, statuses, visaTypes, walletTransactions } from "@/db/schema";
import { createDraftApplication } from "@/lib/applications";
import { reportData } from "@/lib/queries";
import { parseReportFilters } from "@/lib/report-filters";
import { GET } from "@/app/api/admin/reports/export/route";
suiteSetup();
afterEach(() => { request.cookie = ""; });

async function eventFixture() {
  const actor = await userByEmail("admin@test.example"), accounting = await userByEmail("accounting@test.example");
  const agency = await agencyByEmail("ops@agencya.example");
  const [base] = await db.select().from(visaTypes).where(eq(visaTypes.code, "JP-BUS"));
  const [visa] = await db.insert(visaTypes).values({ ...base!, id: undefined, code: `BOUNDARY_${crypto.randomUUID().slice(0, 8)}` }).returning();
  const [submitted] = await db.select().from(statuses).where(eq(statuses.code, "SUBMITTED"));
  const dates = [
    ["2026-06-05T00:00:00.000Z", "2026-07-08T12:00:00.000Z"],
    ["2026-06-05T23:59:59.999Z", "2026-07-09T00:00:00.000Z"],
    ["2026-06-06T00:00:00.000Z", null],
    [null, "2026-07-08T00:00:00.000Z"],
    ["2026-07-09T00:00:00.000Z", "2026-07-08T00:00:00.000Z"],
  ];
  const ids: string[] = [];
  for (const [submission, decision] of dates) {
    const app = await createDraftApplication({ agencyId: agency.id, visaTypeId: visa!.id, createdBy: actor }); ids.push(app.id);
    await db.update(applications).set({ createdAt: new Date("2026-01-01T12:00:00Z"),
      statusId: submission ? submitted!.id : app.statusId, submittedAt: submission ? new Date(submission) : null,
      decisionAt: decision ? new Date(decision) : null, assignedTo: decision ? null : accounting.id }).where(eq(applications.id, app.id));
  }
  for (const [date, amount] of [["2026-06-04T23:59:59.999Z", "11"], ["2026-06-05T00:00:00.000Z", "17"], ["2026-06-05T23:59:59.999Z", "23"], ["2026-06-06T00:00:00.000Z", "31"]]) {
    await db.insert(walletTransactions).values({ agencyId: agency.id, applicationId: ids[0], type: "CREDIT", amount: amount!, currency: "DZD", balanceBefore: "0", balanceAfter: amount!, reason: "Disposable report boundary fixture", actorId: actor.id, createdAt: new Date(date!) });
  }
  const [type]=await db.select().from(documentTypes).where(eq(documentTypes.code,"PASSPORT"));
  for (const [date,status] of [["2026-06-04T23:59:59.999Z","REJECTED"],["2026-06-05T00:00:00.000Z","REJECTED"],["2026-06-05T23:59:59.999Z","RESUBMISSION_REQUIRED"],["2026-06-06T00:00:00.000Z","REJECTED"]] as const) {
    await db.insert(documents).values({applicationId:ids[2]!,documentTypeId:type!.id,originalFilename:"synthetic-review.pdf",mimeType:"application/pdf",sizeBytes:5,storageKey:`synthetic-reports/${crypto.randomUUID()}`,status,uploadedBy:actor.id,reviewedBy:actor.id,reviewedAt:new Date(date),createdAt:new Date("2026-01-01T12:00:00Z")});
  }
  return { actor, agency, visa: visa!, accounting, scope: { agencyId: agency.id, visaTypeId: visa!.id } };
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
describe("canonical report event periods", () => {
  it.each(["csv","xlsx"])("%s exports document review events and the current assignment snapshot",async format=>{
    const {actor,scope,accounting}=await eventFixture(); request.cookie=(await createSession(actor.id)).token;
    const query=new URLSearchParams({from:"2026-06-05",to:"2026-06-05",agency:scope.agencyId,visa:scope.visaTypeId,officer:accounting.id,lang:"en",format});
    const data=await reportData({...parseReportFilters(Object.fromEntries(query)),...scope});
    expect(data.docIssues.find(r=>r.status==="REJECTED")?.total).toBe(1);
    expect(data.docIssues.find(r=>r.status==="RESUBMISSION_REQUIRED")?.total).toBe(1);
    expect(data.workload).toEqual([{officer:accounting.name,assigned:1}]);
    const response=await GET(new Request(`http://localhost/api/admin/reports/export?${query}`)); expect(response.status).toBe(200);
    if(format==="csv"){
      const csv=await response.text();
      expect(csv).toContain("Document review,Rejected,1");
      expect(csv).toContain("Document review,Resubmission Required,1");
      expect(csv).toContain(`Current workload,${accounting.name},1`);
    }else{
      const xml=sheetXml(Buffer.from(await response.arrayBuffer()));
      expect(xml).toMatch(/Rejected<\/t><\/is><\/c><c r="C\d+" t="n"><v>1<\/v>/);
      expect(xml).toMatch(/Resubmission Required<\/t><\/is><\/c><c r="C\d+" t="n"><v>1<\/v>/);
      expect(xml).toContain("Current workload");expect(xml).toMatch(/Accounting<\/t><\/is><\/c><c r="C\d+" t="n"><v>1<\/v>/);
    }
  });
  it("uses a half-open UTC event period for submissions and linked wallet transactions", async () => {
    const { scope } = await eventFixture();
    const data = await reportData({ ...parseReportFilters({ from: "2026-06-05", to: "2026-06-05" }), ...scope });
    expect(data.activity).toEqual({ created: 0, submitted: 2, decisions: 0 });
    expect(data.byAgency).toHaveLength(1); expect(data.byAgency[0]!.total).toBe(2);
    expect(Number(data.walletFlow!.credits)).toBe(40);
  });
  it("decision volume preserves real missing stamps while processing rejects missing or reversed durations", async () => {
    const { scope } = await eventFixture();
    const data = await reportData({ ...parseReportFilters({ from: "2026-07-08", to: "2026-07-08" }), ...scope });
    expect(data.activity.decisions).toBe(3); expect(data.processing.decided).toBe(1);
    expect(Number(data.processing.avgDays)).toBe(33.5);
    expect(data.byAgency).toHaveLength(0);
  });
  it("workload remains a live assignment snapshot across the selected event period", async () => {
    const { scope, accounting } = await eventFixture();
    const data = await reportData({ ...parseReportFilters({ from: "2000-01-01", to: "2000-01-01" }), ...scope, officerId: accounting.id });
    expect(data.activity).toEqual({ created: 0, submitted: 0, decisions: 0 });
    expect(data.workload).toEqual([{ officer: accounting.name, assigned: 1 }]);
  });
  it.each(["csv", "xlsx"])("%s exports preserve the same event counts, dimensions and wallet period as the report", async (format) => {
    const { actor, scope } = await eventFixture(); request.cookie = (await createSession(actor.id)).token;
    const query = new URLSearchParams({ from: "2026-06-05", to: "2026-06-05", agency: scope.agencyId, visa: scope.visaTypeId, lang: "en", format });
    const response = await GET(new Request(`http://localhost/api/admin/reports/export?${query}`));
    expect(response.status).toBe(200);
    if (format === "csv") {
      const csv = await response.text();
      expect(csv).toContain("Activity,Submitted applications,2");
      expect(csv).toContain("Activity,Created applications,0");
      expect(csv).toContain("Activity,Decisions recorded,0");
      expect(csv.split("\r\n").find((line) => line.startsWith("Wallet (DZD),Credits,"))?.split(",")).toEqual(["Wallet (DZD)", "Credits", "", "40", "", ""]);
    } else {
      const xml = sheetXml(Buffer.from(await response.arrayBuffer()));
      expect(xml).toMatch(/Submitted applications<\/t><\/is><\/c><c r="C\d+" t="n"><v>2<\/v>/);
      expect(xml).toMatch(/Created applications<\/t><\/is><\/c><c r="C\d+" t="n"><v>0<\/v>/);
      expect(xml).toContain("Decisions recorded");
      expect(xml).toMatch(/Credits<\/t><\/is><\/c><c r="D\d+" t="n"><v>40<\/v>/);
    }
  });
  it.each(["csv", "xlsx"])("%s exports distinguish recorded decisions from dossiers with valid processing durations", async (format) => {
    const { actor, scope } = await eventFixture(); request.cookie = (await createSession(actor.id)).token;
    const query = new URLSearchParams({ from: "2026-07-08", to: "2026-07-08", agency: scope.agencyId, visa: scope.visaTypeId, lang: "en", format });
    const response = await GET(new Request(`http://localhost/api/admin/reports/export?${query}`)); expect(response.status).toBe(200);
    if (format === "csv") {
      const csv = await response.text();
      expect(csv).toContain("Activity,Decisions recorded,3");
      expect(csv).toContain("Processing,Decided dossiers,,,Count,1");
      expect(csv).toContain(",33.5\r\n");
      expect(csv).not.toContain("By agency,");
    } else {
      const xml = sheetXml(Buffer.from(await response.arrayBuffer()));
      expect(xml).toMatch(/Decisions recorded<\/t><\/is><\/c><c r="C\d+" t="n"><v>3<\/v>/);
      expect(xml).toMatch(/Decided dossiers<\/t><\/is><\/c><c r="E\d+" t="inlineStr"><is><t xml:space="preserve">Count<\/t><\/is><\/c><c r="F\d+" t="n"><v>1<\/v>/);
      expect(xml).toContain("<v>33.5</v>");
      expect(xml).not.toContain("By agency");
    }
  });
});
