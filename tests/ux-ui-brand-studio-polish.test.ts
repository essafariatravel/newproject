import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const src=readFileSync(new URL("../src/components/brand-studio.tsx",import.meta.url),"utf8");
describe("Brand Studio final polish",()=>{
  it("keeps editable controls touch-friendly and avoids legacy tiny type",()=>{
    expect(src).toContain("h-11 w-11");
    expect(src).toContain("file:min-h-11");
    expect(src).not.toContain("text-[11px]");
    expect(src).not.toContain("text-[10px]");
    expect(src).not.toContain("text-[13px]");
    expect(src).not.toContain("font-bold");
  });
});