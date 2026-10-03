import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
describe("Staff applications final polish",()=>{
  it("distinguishes filtered zero results and exposes clear filters",()=>{
    const page=read("src/app/admin/applications/page.tsx");
    expect(page).toContain("hasActiveFilters");
    expect(page).toContain("No applications match these filters.");
    expect(page).toContain('ct("Clear filters")');
  });
  it("uses 44px saved views, bulk selection and next actions",()=>{
    const page=read("src/app/admin/applications/page.tsx");
    expect(page).toContain("min-h-11 items-center rounded-md");
    expect(page).toContain('className="inline-flex h-11 w-11 items-center justify-center"');
    expect(page).toContain('ct("Next action")');
    expect(page).toContain('ct("Open dossier")');
    expect(page).not.toContain('className="card mb-3');
  });
});