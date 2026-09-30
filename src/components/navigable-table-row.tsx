"use client";

import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

export const ROW_NAVIGATION_INTERACTIVE_SELECTOR =
  'a,button,input,select,textarea,label,form,summary,[role="button"],[role="link"],[role="menuitem"],[contenteditable="true"],[data-row-navigation-ignore]';

type ClosestCapable = { closest?: (selector: string) => unknown };

export function shouldIgnoreRowNavigation(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const closest = (target as ClosestCapable).closest;
  return typeof closest === "function" && Boolean(closest.call(target, ROW_NAVIGATION_INTERACTIVE_SELECTOR));
}

/**
 * Progressive enhancement for business-entity tables.
 * The semantic primary link remains the keyboard/screen-reader navigation path;
 * double-clicking quiet row space is only an additional pointer shortcut.
 */
export function NavigableTableRow(props: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function handleDoubleClick(event: MouseEvent<HTMLTableRowElement>) {
    if (event.button !== 0 || shouldIgnoreRowNavigation(event.target)) return;
    router.push(props.href);
  }

  return (
    <tr className={props.className} onDoubleClick={handleDoubleClick} data-row-href={props.href}>
      {props.children}
    </tr>
  );
}
