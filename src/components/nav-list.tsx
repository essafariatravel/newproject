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
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {section.title}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                  isActive(pathname, item.href)
                    ? "bg-iris-50 font-semibold text-iris-700"
                    : "text-slate-500 hover:bg-white hover:text-navy-900"
                }`}
              >
                <span>{item.label}</span>
                {item.badge ? (
                  <span
                    className={`badge tabular-nums ${
                      isActive(pathname, item.href) ? "bg-iris-100 text-iris-700" : "bg-ivory-100 text-slate-500"
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
