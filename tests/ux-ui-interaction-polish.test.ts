import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("UX/UI final polish — interaction targets", () => {
  it("keeps shell and account actions at the product target", () => {
    const shell=read("src/components/app-shell.tsx");
    const css=read("src/app/globals.css");
    expect(shell).toContain("min-h-11 w-full");
    expect(css).toMatch(/\.account-menu-panel a,.account-menu-panel button[^}]*min-height:44px/);
  });

  it("uses a 44px calendar trigger and primary calendar navigation controls", () => {
    const picker=read("src/components/date-picker.tsx");
    expect(picker).toContain("h-11 w-11");
    expect(picker).toContain("min-h-11");
    expect(picker).not.toContain("text-[11px]");
    expect(picker).not.toContain("font-medium");
  });

  it("uses approved dialog spacing", () => {
    const dialog=read("src/components/config-dialog.tsx");
    expect(dialog).toContain('className="p-6 text-start"');
    expect(dialog).not.toContain("p-5");
    expect(dialog).not.toContain("mb-5");
  });
});
