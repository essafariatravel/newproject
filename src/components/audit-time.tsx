"use client";

import { useSyncExternalStore } from "react";
import { dateLocale } from "@/lib/format";
const subscribe = () => () => {};

/** Audit instants retain UTC machine values and display the viewer's explicit timezone. */
export function AuditTime({ iso, locale }: { iso: string; locale: string }) {
  const timezone = useSyncExternalStore(subscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "UTC");
  const text = new Intl.DateTimeFormat(dateLocale(locale), { year:"numeric", month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", timeZone:timezone }).format(new Date(iso));
  return <time dateTime={iso} dir="ltr" title={iso}>{text}<span className="block text-xs text-slate-500">{timezone}</span></time>;
}
