"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon, useNavUnreadCount, type NavSection } from "./nav-list";
import { activeNavigationHref, agencyPrimaryItems } from "./workspace-route";
import { contentT } from "@/lib/i18n-content";
import type { UiLocale } from "@/lib/ui-i18n";

export function AgencyBottomNavigation({ sections, label, locale }: { sections: NavSection[]; label: string; locale: UiLocale }) {
  const pathname = usePathname();
  const allItems = sections.flatMap((section) => section.items);
  const unread = useNavUnreadCount(allItems.find((item) => item.href.endsWith("/notifications"))?.badge ?? 0);
  const ct = contentT(locale);
  const primary = agencyPrimaryItems(allItems).map((item) => ({
    ...item,
    label: ct(({ "/portal": "Home", "/portal/applications": "Dossiers", "/portal/wallet": "Wallet", "/portal/notifications": "Updates" } as Record<string, string>)[item.href]!),
    badge: item.href.endsWith("/notifications") ? unread : item.badge,
  }));
  const active = activeNavigationHref(primary, pathname);
  return (
    <nav aria-label={label} className="agency-bottom-navigation">
      {primary.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.href === active ? "page" : undefined}>
          <span className="relative"><NavIcon href={item.href} />{item.badge ? <span className="bottom-nav-unread" aria-hidden="true">{item.badge > 99 ? "99+" : item.badge}</span> : null}</span>
          <span>{item.label}</span>
          {item.badge ? <span className="sr-only">{item.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
