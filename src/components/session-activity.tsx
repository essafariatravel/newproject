"use client";
import { useEffect } from "react";
import { touchSessionAction } from "@/app/actions/auth";

const AGENCY_IDLE_MS = 15 * 60_000;

/** Only real interaction renews inactivity; background polls never do. */
export function SessionActivity({ agency = false }: { agency?: boolean }) {
  useEffect(() => {
    let sentAt = 0;
    let pending = false;
    let expired = false;
    let idleCheck: ReturnType<typeof setTimeout> | undefined;

    const expire = () => {
      if (expired) return;
      expired = true;
      window.location.replace("/login?reason=session-expired");
    };

    const check = async (): Promise<boolean> => {
      if (expired) return false;
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        if (response.status === 401) {
          expire();
          return false;
        }
      } catch {
        // A transient network failure must not prolong server-side validity.
      }
      return !expired;
    };

    const scheduleAgencyCheck = (delayMs: number) => {
      if (!agency) return;
      if (idleCheck !== undefined) clearTimeout(idleCheck);
      idleCheck = setTimeout(() => {
        void check().then((active) => {
          // Another tab may have kept the same session alive. Recheck, but
          // never renew the session merely because this browser timer fired.
          if (active) scheduleAgencyCheck(60_000);
        });
      }, delayMs);
    };

    const activity = (event: Event) => {
      if (!event.isTrusted || expired) return;
      if (agency) scheduleAgencyCheck(AGENCY_IDLE_MS);
      if (pending || Date.now() - sentAt < 60_000) return;
      pending = true;
      sentAt = Date.now();
      void touchSessionAction()
        .then((result) => { if (result.expired) expire(); })
        .catch(() => {})
        .finally(() => { pending = false; });
    };

    const recheckOnReturn = () => {
      if (document.visibilityState === "visible") void check();
    };

    for (const event of ["pointerdown", "keydown", "scroll"]) {
      window.addEventListener(event, activity, { passive: true });
    }
    const timer = window.setInterval(() => { void check(); }, 60_000);
    if (agency) {
      scheduleAgencyCheck(AGENCY_IDLE_MS);
      document.addEventListener("visibilitychange", recheckOnReturn);
      window.addEventListener("pageshow", recheckOnReturn);
    }

    return () => {
      window.clearInterval(timer);
      if (idleCheck !== undefined) clearTimeout(idleCheck);
      document.removeEventListener("visibilitychange", recheckOnReturn);
      window.removeEventListener("pageshow", recheckOnReturn);
      for (const event of ["pointerdown", "keydown", "scroll"]) {
        window.removeEventListener(event, activity);
      }
    };
  }, [agency]);
  return null;
}
