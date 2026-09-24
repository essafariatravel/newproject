"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

function isActive(currentPath: string, href: string): boolean {
  if (href === currentPath) return true;
  return currentPath.startsWith(href + "/");
}

export function NavList({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  return (
    <>
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
            {section.title}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive(pathname, item.href)
                    ? "bg-white/12 font-semibold text-white shadow-[inset_3px_0_0_var(--color-gold-500)] rtl:shadow-[inset_-3px_0_0_var(--color-gold-500)]"
                    : "text-white/70 hover:bg-white/8 hover:text-white"
                }`}
              >
                <span>{item.label}</span>
                {item.badge ? (
                  <span
                    className={`badge tabular-nums ${
                      isActive(pathname, item.href) ? "bg-gold-500 text-navy-950" : "bg-white/15 text-white"
                    }`}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
