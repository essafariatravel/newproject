import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const files=[
"src/app/admin/config/countries/page.tsx",
"src/app/admin/config/currencies/page.tsx",
"src/app/admin/config/document-types/page.tsx",
"src/app/admin/config/priorities/page.tsx",
"src/app/admin/config/statuses/page.tsx",
"src/app/admin/config/visa-categories/page.tsx",
"src/app/admin/config/visa-types/[id]/page.tsx",
"src/app/admin/config/visa-types/page.tsx",
];
const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
describe("Configuration final polish",()=>{
  it("keeps configuration surfaces on readable type and approved spacing",()=>{
    for(const file of files){
      const src=read(file);
      expect(src,file).not.toContain("text-sm");
      expect(src,file).not.toContain("font-medium");
      expect(src,file).not.toContain("text-[11px]");
      expect(src,file).not.toContain("space-y-3");
      expect(src,file).not.toContain("gap-3");
    }
  });
});