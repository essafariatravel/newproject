import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
describe("Registration final polish",()=>{
  it("keeps review controls touch-friendly",()=>{
    const src=read("src/components/registration-review-form.tsx");
    expect(src).toContain("min-h-11");
    expect(src).toContain('className="h-5 w-5"');
  });
  it("keeps upload controls readable and 44px-friendly",()=>{
    const src=read("src/components/registration-upload-form.tsx");
    expect(src).toContain("file:min-h-11");
    expect(src).not.toContain("text-sm");
  });
});