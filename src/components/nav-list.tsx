"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavigationHref } from "./workspace-route";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export function useNavUnreadCount(initialUnread: number) {
  const [unread, setUnread] = useState(initialUnread);
  useEffect(() => { setUnread(initialUnread); }, [initialUnread]);
  useEffect(() => { const receive = (e: Event) => setUnread((e as CustomEvent<number>).detail); window.addEventListener("essafaria-notifications", receive); return () => window.removeEventListener("essafaria-notifications", receive); }, []);
  return unread;
}

export function NavList({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const initialUnread = sections.flatMap((s) => s.items).find((i) => i.href.endsWith("/notifications"))?.badge ?? 0;
  const unread = useNavUnreadCount(initialUnread);
  const activeHref = activeNavigationHref(sections.flatMap((s) => s.items), pathname);
  return (
    <>
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
            {section.title}
          </p>
          <div className="space-y-0.5">
            {section.items.map((source) => { const item = source.href.endsWith("/notifications") ? { ...source, badge: unread } : source; return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activeHref === item.href ? "page" : undefined}
                className={`workspace-nav-link flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                  activeHref === item.href
                    ? "font-semibold text-white"
                    : "text-white/70 hover:bg-white/8 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2.5"><NavIcon href={item.href} /><span>{item.label}</span></span>
                {item.badge ? (
                  <span
                    className={`badge tabular-nums ${
                      activeHref === item.href ? "bg-gold-500 text-navy-950" : "bg-white/15 text-white"
                    }`}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            ); })}
          </div>
        </div>
      ))}
    </>
  );
}

export function NavIcon({ href }: { href: string }) {
  const path = href.endsWith("/portal") || href.endsWith("/admin") ? "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"
    : href.includes("wallet") || href.includes("billing") ? "M3 6h17v14H3V6Zm0 0V4h14v2m0 5h4v5h-4Z"
    : href.includes("users") || href.includes("profile") || href.includes("agencies") ? "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2"
    : href.includes("communications") || href.includes("notifications") ? "M4 4h16v12H9l-5 4V4Z"
    : href.includes("config") || href.includes("settings") ? "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6"
    : "M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6";
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="workspace-nav-icon shrink-0" aria-hidden="true"><path d={path} /></svg>;
}
