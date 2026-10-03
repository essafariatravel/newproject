import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
describe("Staff dashboard final polish",()=>{
  it("is queue-first instead of a welcome/KPI-card wall",()=>{
    const page=read("src/app/admin/page.tsx");
    expect(page).toContain('title={ct("Work queue")}');
    expect(page).not.toContain("StatCard");
    expect(page).not.toContain("localizedGreeting");
  });
  it("orders the work queue around destination, traveller, agency, status and next action",()=>{
    const page=read("src/app/admin/page.tsx");
    const section=page.slice(page.indexOf('id="staff-work-queue"'),page.indexOf('<div className="mt-6 grid'));
    expect(section.indexOf('ct("Destination")')).toBeLessThan(section.indexOf('ct("Applicant")'));
    expect(section.indexOf('ct("Applicant")')).toBeLessThan(section.indexOf('ct("Agency")'));
    expect(section.indexOf('ct("Agency")')).toBeLessThan(section.indexOf('ct("Status")'));
    expect(section).toContain('ct("Next action")');
    expect(section).toContain('ct("Open dossier")');
  });
});