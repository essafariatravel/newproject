import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
describe("Staff secondary final polish",()=>{
  it("keeps reports, billing, agency and user surfaces readable",()=>{
    for(const file of [
      "src/app/admin/reports/page.tsx",
      "src/app/admin/agencies/[id]/page.tsx",
      "src/app/admin/billing/page.tsx",
      "src/app/admin/agencies/page.tsx",
      "src/app/admin/users/page.tsx",
    ]){
      const src=read(file);
      expect(src,file).not.toContain("text-sm");
      expect(src,file).not.toContain("font-medium");
    }
  });
  it("keeps agency logo upload control touch-friendly",()=>{
    const src=read("src/app/admin/agencies/[id]/page.tsx");
    expect(src).toContain("file:min-h-11");
    expect(src).not.toContain("file:rounded-full");
  });
});