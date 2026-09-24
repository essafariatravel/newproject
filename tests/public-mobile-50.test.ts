/**
 * §50 — public mobile homepage contract.
 *
 * The audit found two visible "Register your agency" CTAs at mobile plus a
 * horizontally scrolling nav strip. These guards pin the corrected header:
 * exactly one register CTA, a real hamburger menu, and no horizontal
 * overflow container in the public chrome.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const LAYOUT = read("src/app/(public)/layout.tsx");
const HEADER = read("src/components/public-header.tsx");

describe("§50 — public header at mobile", () => {
  it("renders the shared responsive header instead of an ad-hoc nav strip", () => {
    expect(LAYOUT).toContain("<PublicHeader");
    // The old design had a second nav row that scrolled sideways on phones.
    expect(LAYOUT).not.toContain("overflow-x-auto");
  });

  it("has exactly ONE register CTA in the header markup", () => {
    const ctas = HEADER.split('href="/agency/register"').length - 1;
    expect(ctas).toBe(1);
    // …and the opened menu never repeats it.
    const menuSection = HEADER.slice(HEADER.indexOf("Mobile / tablet navigation panel"));
    expect(menuSection).not.toContain("/agency/register");
  });

  it("collapses navigation into a hamburger with accessible state", () => {
    expect(HEADER).toContain('data-testid="public-menu-toggle"');
    expect(HEADER).toContain("aria-expanded={open}");
    expect(HEADER).toContain("aria-controls={panelId}");
    expect(HEADER).toContain('aria-label={open ? labels.close : labels.menu}');
    // The panel is mobile/tablet only, the inline nav is desktop only.
    expect(HEADER).toContain("lg:hidden");
    expect(HEADER).toContain("hidden items-center gap-1 lg:flex");
  });

  it("cannot overflow horizontally at 320px", () => {
    // Every flexible child may shrink; fixed pieces are pinned with shrink-0
    // and the CTA is allowed to wrap its own label only.
    expect(HEADER).toContain("min-w-0");
    expect(HEADER).toContain("shrink-0");
    expect(HEADER).toContain("whitespace-nowrap");
    // The brand image is bounded relative to the viewport, not a fixed px width.
    expect(HEADER).toContain("max-w-[46vw]");
  });

  it("keeps the mobile CTA label and the sign-in entry point reachable", () => {
    expect(HEADER).toContain("{labels.register}");
    expect(HEADER).toContain("{labels.signIn}");
    // The language switcher is a server component (it reads the locale cookie),
    // so it is injected into the client header as a rendered node from the
    // server layout instead of being imported here.
    expect(HEADER).toContain("localeSwitcher");
    expect(LAYOUT).toContain("<UiLanguageSwitcher");
  });
});
