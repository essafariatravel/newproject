"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** The persistent sticky shell must not leave the new page title behind it. */
export function WorkspaceNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const page = document.querySelector(".workspace-page");
    const animation = page?.animate([{ opacity: .65, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 200, easing: "cubic-bezier(.2,.8,.2,1)" });
    return () => animation?.cancel();
  }, [pathname]);
  return null;
}
