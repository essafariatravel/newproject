"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** One short editorial movement. Text and controls are always visible and usable. */
export function PublicMotion() {
  const pathname = usePathname();
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const image = document.querySelector<HTMLElement>("[data-editorial-image]");
    if (!image || preference.matches || typeof image.animate !== "function") return;
    const animation = image.animate(
      [{ transform: "scale(1.045)" }, { transform: "scale(1)" }],
      { duration: 3600, easing: "cubic-bezier(0.16, 1, 0.3, 1)", iterations: 1 },
    );
    const onPreferenceChange = () => {
      if (preference.matches) animation.cancel();
    };
    preference.addEventListener("change", onPreferenceChange);
    return () => {
      animation.cancel();
      preference.removeEventListener("change", onPreferenceChange);
    };
  }, [pathname]);
  return null;
}
