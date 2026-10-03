import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const src=readFileSync(new URL("../src/components/application-detail.tsx",import.meta.url),"utf8");
describe("Shared application-detail final polish",()=>{
  it("keeps document upload controls readable and touch-friendly",()=>{
    expect(src).toContain("file:min-h-11");
    expect(src).toContain("file:text-base");
    expect(src).toContain('className="input max-w-[180px]"');
  });
  it("keeps communication controls accessible",()=>{
    expect(src).toContain("flex min-h-11 items-center gap-2 text-base");
    expect(src).toContain('className="h-5 w-5"');
  });
  it("removes 14px and 500-weight operational copy",()=>{
    expect(src).not.toContain("text-sm");
    expect(src).not.toContain("font-medium");
    expect(src).not.toContain("text-[11px]");
  });
});