import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
describe("Agency core final polish",()=>{
  it("keeps the 3-step request wizard readable without changing its workflow",()=>{
    const src=read("src/app/portal/applications/new/request-wizard.tsx");
    expect(src).toContain("setStep(Math.min(3, step + 1))");
    expect(src).toContain('data-testid="wizard-steps"');
    expect(src).not.toContain("text-sm");
    expect(src).not.toContain("font-medium");
    expect(src).not.toContain("text-[11px]");
    expect(src).toContain("min-h-11");
  });
  it("keeps wallet/dashboard/profile primary copy on the final type system",()=>{
    for(const file of ["src/app/portal/wallet/page.tsx","src/app/portal/page.tsx","src/app/portal/profile/page.tsx"]){
      const src=read(file);
      expect(src,file).not.toContain("text-sm");
      expect(src,file).not.toContain("font-medium");
    }
  });
});