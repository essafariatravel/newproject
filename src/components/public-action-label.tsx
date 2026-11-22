"use client";

import { useLinkStatus } from "next/link";
import type { UiLocale } from "@/lib/ui-locale-values";

const loading = { fr: "Chargement…", en: "Loading…", ar: "جارٍ التحميل…" };

export function PublicActionLabel({ children, locale }: { children: string; locale: UiLocale }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span className="public-action-label" aria-busy={pending || undefined}>{children}</span>
      <span className="sr-only" role="status">{pending && loading[locale]}</span>
    </>
  );
}
