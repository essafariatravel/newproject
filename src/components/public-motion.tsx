"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function PublicMotion() {
  const pathname = usePathname();
  useEffect(() => {
    const main = document.getElementById("public-main");
    if (!main || !Element.prototype.animate) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    let observer: IntersectionObserver | undefined;
    const play = (element: Element, from: Keyframe, to: Keyframe, duration: number) => {
      const animation = element.animate([from, to], { duration, easing: "cubic-bezier(.18,.76,.24,1)" });
      animations.add(animation);
      animation.onfinish = () => animations.delete(animation);
    };
    const stop = () => {
      observer?.disconnect();
      for (const animation of animations) animation.cancel();
      animations.clear();
    };
    const start = () => {
      stop();
      if (preference.matches || document.hidden) return;
      const cover = main.querySelector("[data-editorial-image]");
      if (cover) {
        play(cover, { transform: "scale(1.065)" }, { transform: "scale(1)" }, 3200);
        const title = main.querySelector("#public-hero-title");
        if (title) play(title, { transform: "translateY(9px)", opacity: .84 }, { transform: "none", opacity: 1 }, 540);
      }
      if (!("IntersectionObserver" in window)) return;
      observer = new IntersectionObserver((entries, currentObserver) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || preference.matches || document.hidden) continue;
          currentObserver.unobserve(entry.target);
          play(entry.target, { transform: "scale(1.045)", opacity: .9 }, { transform: "scale(1)", opacity: 1 }, 1400);
        }
      }, { threshold: .15 });
      main.querySelectorAll("[data-cinematic-frame]").forEach(image => observer!.observe(image));
    };
    const onHidden = () => { if (document.hidden) stop(); };
    start();
    preference.addEventListener("change", start);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      stop();
      preference.removeEventListener("change", start);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [pathname]);
  return null;
}
