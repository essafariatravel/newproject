"use client";
import { useSyncExternalStore } from "react";
import type { UiLocale } from "@/lib/ui-i18n";
const subscribe=() => () => undefined;
function snapshot(): UiLocale {
  const cookie=document.cookie.split(";").map(part=>part.trim()).find(part=>part.startsWith("evos_ui_locale="))?.split("=")[1];
  const candidate=cookie ?? document.documentElement.lang;
  return candidate === "ar" || candidate === "fr" ? candidate : "en";
}
/** Only reads the public language cookie; never session or private cookies. */
export function useClientLocale() { return useSyncExternalStore(subscribe,snapshot,()=>"en" as UiLocale); }
