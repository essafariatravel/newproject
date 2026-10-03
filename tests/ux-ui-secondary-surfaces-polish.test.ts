import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
describe("Final polish — secondary surfaces",()=>{
  it("keeps top-up and notification surfaces on readable type",()=>{
    for(const file of ["src/components/topup.tsx","src/components/notifications-page.tsx","src/components/wallet-statement-form.tsx"]){
      const src=read(file);
      expect(src,file).not.toContain("font-medium");
      expect(src,file).not.toContain("text-sm");
    }
  });
  it("keeps public navigation touch-friendly",()=>{
    const src=read("src/components/public-header.tsx");
    expect(src).toContain("h-11 w-11");
    expect(src).toContain("min-h-11");
  });
  it("removes pill-heavy legacy wizard styling",()=>{
    const src=read("src/components/wizard-steps.tsx");
    expect(src).not.toContain("rounded-full");
    expect(src).toContain("rounded-lg");
    expect(src).toContain("min-h-11");
  });
});