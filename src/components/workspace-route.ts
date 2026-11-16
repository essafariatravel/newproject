import type { NavItem } from "./nav-list";

/** Match a route boundary, choosing the most specific permitted destination. */
export function activeNavigationHref(items: readonly NavItem[], pathname: string): string | undefined {
  return items.map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

/** The secondary menu remains authoritative; never invent an unavailable route. */
export function agencyPrimaryItems(items: readonly NavItem[]): NavItem[] {
  return ["/portal", "/portal/applications", "/portal/wallet", "/portal/notifications"]
    .flatMap((href) => items.filter((item) => item.href === href));
}
