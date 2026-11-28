"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
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
  const matched = activeNavigationHref(allItems, pathname);
  const active = matched === "/portal/applications/new" ? "/portal/applications" : matched === "/portal" && pathname !== "/portal" ? undefined : matched;
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".workspace-agency");
    const viewport = window.visualViewport;
    if (!root || !viewport) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const focused = document.activeElement;
      const editing = focused instanceof HTMLTextAreaElement || (focused instanceof HTMLInputElement && !["button","checkbox","radio","file","hidden","submit","reset","range","color"].includes(focused.type)) || (focused instanceof HTMLElement && focused.isContentEditable);
      const small = window.matchMedia("(max-width: 1023px)").matches;
      const keyboard = small && editing && Math.abs(viewport.scale - 1) < .05 && window.innerHeight - viewport.height > 120;
      if (keyboard) root.dataset.mobileKeyboard = "true"; else delete root.dataset.mobileKeyboard;
    };
    const schedule = () => { if (frame) cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    viewport.addEventListener("resize", schedule); viewport.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule); document.addEventListener("focusin", schedule); document.addEventListener("focusout", schedule);
    schedule();
    return () => { if (frame) cancelAnimationFrame(frame); viewport.removeEventListener("resize", schedule); viewport.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); document.removeEventListener("focusin", schedule); document.removeEventListener("focusout", schedule); delete root.dataset.mobileKeyboard; };
  }, []);
  return (
    <nav aria-label={label} className="agency-bottom-navigation">
      {primary.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.href === active ? "page" : undefined}>
          <span className="relative"><NavIcon href={item.href} />{item.badge ? <span className="bottom-nav-unread" aria-hidden="true">{item.badge > 99 ? "99+" : item.badge}</span> : null}</span>
          <span>{item.label}</span>
          {item.badge ? <span className="sr-only">{item.badge} {({fr:"non lues",en:"unread",ar:"غير مقروءة"}[locale])}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
