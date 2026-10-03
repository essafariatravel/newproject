import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
describe("Public registration final polish",()=>{
  it("uses readable consent copy and touch-friendly checkboxes",()=>{
    const form=read("src/app/(public)/agency/register/registration-form.tsx");
    expect(form).toContain("min-h-11");
    expect(form).toContain("h-5 w-5");
    expect(form).not.toContain("text-sm");
  });
  it("caps registration heading at the final 32px scale",()=>{
    expect(read("src/app/(public)/agency/register/page.tsx")).toContain("text-[32px]");
  });
});