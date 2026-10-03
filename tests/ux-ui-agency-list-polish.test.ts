import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
describe("Agency list polish",()=>{
  it("distinguishes empty data from zero filtered results",()=>{
    const page=read("src/app/portal/applications/page.tsx");
    expect(page).toContain("hasActiveFilters");
    expect(page).toContain("No applications match these filters.");
    expect(page).toContain('ct("Clear filters")');
  });
  it("uses Destination → Traveller → Status → Next action",()=>{
    const page=read("src/app/portal/applications/page.tsx");
    const h=page.slice(page.indexOf("<thead"),page.indexOf("</thead>"));
    expect(h.indexOf('ct("Destination")')).toBeLessThan(h.indexOf('ct("Applicant")'));
    expect(h.indexOf('ct("Applicant")')).toBeLessThan(h.indexOf('ct("Status")'));
    expect(h).toContain('ct("Next action")');
    expect(page).toContain('ct(needsDocuments ? "Upload requested documents" : "Open dossier")');
  });
});