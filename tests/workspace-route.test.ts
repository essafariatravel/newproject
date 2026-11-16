import { describe, expect, it } from "vitest";
import { activeNavigationHref, agencyPrimaryItems } from "../src/components/workspace-route";

const items = [
  { href: "/portal", label: "Home" },
  { href: "/portal/applications", label: "Dossiers" },
  { href: "/portal/applications/new", label: "Start" },
  { href: "/portal/wallet", label: "Wallet" },
  { href: "/portal/notifications", label: "Updates", badge: 3 },
  { href: "/portal/profile", label: "Account" },
];

describe("workspace destination navigation", () => {
  it.each([
    ["/portal", "/portal"],
    ["/portal/applications/abc", "/portal/applications"],
    ["/portal/applications/new", "/portal/applications/new"],
    ["/portal/wallet", "/portal/wallet"],
    ["/portal-other", undefined],
  ])("highlights only the deepest matching destination for %s", (path, expected) => {
    expect(activeNavigationHref(items, path)).toBe(expected);
  });
  it("uses only available primary routes and retains update badges", () => {
    expect(agencyPrimaryItems(items).map((i) => i.href)).toEqual([
      "/portal", "/portal/applications", "/portal/wallet", "/portal/notifications",
    ]);
    expect(agencyPrimaryItems(items).at(-1)?.badge).toBe(3);
    expect(agencyPrimaryItems(items.filter((i) => i.href !== "/portal/wallet")).map((i) => i.href)).toEqual([
      "/portal", "/portal/applications", "/portal/notifications",
    ]);
  });
});
