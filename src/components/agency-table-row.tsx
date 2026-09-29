"use client";

import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

export const AGENCY_ROW_INTERACTIVE_SELECTOR =
  'a,button,input,select,textarea,label,form,[role="button"],[role="link"],[contenteditable="true"],[data-row-navigation-ignore]';

type ClosestCapable = { closest?: (selector: string) => unknown };

export function shouldIgnoreAgencyRowNavigation(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const closest = (target as ClosestCapable).closest;
  return typeof closest === "function" && Boolean(closest.call(target, AGENCY_ROW_INTERACTIVE_SELECTOR));
}

/**
 * Progressive enhancement for staff agency rows.
 *
 * The agency-name Link remains the semantic keyboard-accessible navigation.
 * Double-clicking non-interactive row content is an additional pointer shortcut.
 */
export function AgencyTableRow(props: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function handleDoubleClick(event: MouseEvent<HTMLTableRowElement>) {
    if (event.button !== 0 || shouldIgnoreAgencyRowNavigation(event.target)) return;
    router.push(props.href);
  }

  return (
    <tr className={props.className} onDoubleClick={handleDoubleClick} data-agency-row-href={props.href}>
      {props.children}
    </tr>
  );
}
