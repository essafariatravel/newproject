"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** The persistent sticky shell must not leave the new page title behind it. */
export function WorkspaceNavigation() {
  const pathname = usePathname();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [pathname]);
  return null;
}
