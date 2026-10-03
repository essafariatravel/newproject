import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
describe("Staff dossier final polish",()=>{
  it("puts destination first and derives next action from existing workflow state",()=>{
    const page=read("src/app/admin/applications/[id]/page.tsx");
    expect(page).toContain('title={countryName({ name: app.countryName');
    expect(page).toContain('aria-labelledby="staff-next-action"');
    expect(page).toContain("openRequests.length > 0");
    expect(page).toContain("selectableStatuses.length > 0");
    expect(page).toContain("allowedDecisionOutcomes.length > 0");
  });
  it("keeps commercial confirmation touch-friendly",()=>{
    const page=read("src/app/admin/applications/[id]/page.tsx");
    expect(page).toContain("flex min-h-11 items-center gap-2 text-base");
    expect(page).toContain('className="h-5 w-5 rounded border-slate-300"');
  });
});