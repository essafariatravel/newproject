"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  GA4_CONSENT_KEY,
  GA4_MEASUREMENT_ID,
  GA4_PRODUCTION_HOST,
  isGa4PublicMarketingPath,
} from "@/lib/public-analytics";

type Locale = "en" | "fr" | "ar";
type Consent = "loading" | "unset" | "accepted" | "rejected";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __essafariaGa4Configured?: boolean;
  }
}

const COPY = {
  en: {
    preferences: "Analytics preferences",
    title: "Website analytics",
    detail: "May we use Google Analytics to understand visits to our public pages? Visa applications, documents, and agency workspaces are excluded.",
    accept: "Allow analytics",
    reject: "Decline",
    policy: "Cookie policy",
  },
  fr: {
    preferences: "Préférences statistiques",
    title: "Statistiques de fréquentation",
    detail: "Acceptez-vous Google Analytics pour mesurer les visites de nos pages publiques ? Les dossiers visa, documents et espaces agences sont exclus.",
    accept: "Accepter",
    reject: "Refuser",
    policy: "Politique de cookies",
  },
  ar: {
    preferences: "إعدادات الإحصاءات",
    title: "إحصاءات زيارة الموقع",
    detail: "هل توافق على استخدام Google Analytics لقياس زيارات الصفحات العامة؟ لا يشمل ذلك ملفات التأشيرة أو المستندات أو حسابات الوكالات.",
    accept: "موافق",
    reject: "رفض",
    policy: "سياسة ملفات الارتباط",
  },
} as const;

function removeAnalyticsCookies() {
  for (const entry of document.cookie.split(";")) {
    const name = entry.trim().split("=")[0] ?? "";
    if (!/^_ga(?:_|$)/.test(name) && name !== "_gid") continue;
    // Clear both host-only and potential parent-domain analytics cookies.
    for (const domain of ["", "; Domain=.essafariavoyages.com"]) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain}`;
    }
  }
}

/**
 * Opt-in only. Never loads third-party JavaScript or sends a measurement
 * before consent. Restricted to the real Production hostname and
 * marketing-only, ID-free paths. No form fields, query strings, user IDs,
 * registration references or dossier metadata are transmitted here.
 */
export function Ga4Consent({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const [consent, setConsent] = useState<Consent>("loading");
  const [editing, setEditing] = useState(false);
  const [productionHost, setProductionHost] = useState(false);
  const [tagReady, setTagReady] = useState(false);
  const lastTracked = useRef<string | null>(null);
  const copy = COPY[locale];

  useEffect(() => {
    setProductionHost(window.location.hostname === GA4_PRODUCTION_HOST);
    try {
      const saved = window.localStorage.getItem(GA4_CONSENT_KEY);
      setConsent(saved === "accepted" || saved === "rejected" ? saved : "unset");
    } catch {
      setConsent("unset");
    }
  }, []);

  const eligible = isGa4PublicMarketingPath(pathname);
  const canMeasure = productionHost && eligible && consent === "accepted";

  useEffect(() => {
    if (!canMeasure || !tagReady) {
      lastTracked.current = null;
      return;
    }
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    window.gtag?.("event", "page_view", {
      send_to: GA4_MEASUREMENT_ID,
      page_path: pathname,
      page_location: `${window.location.origin}${pathname}`,
      page_title: "ESSAFARIA VISA OS",
      page_referrer: "",
    });
  }, [canMeasure, pathname, tagReady]);

  const save = (decision: "accepted" | "rejected") => {
    try {
      window.localStorage.setItem(GA4_CONSENT_KEY, decision);
    } catch {
      // Without storage, the visitor must make the choice again next time.
    }
    if (consent === "accepted" && decision === "rejected") {
      removeAnalyticsCookies();
      window.location.reload(); // Fully unload the third-party tag on withdrawal.
      return;
    }
    setConsent(decision);
    setEditing(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-white/65 underline-offset-4 transition-colors hover:text-white hover:underline"
      >
        {copy.preferences}
      </button>
      {eligible && (consent === "unset" || editing) ? (
        <aside
          role="dialog"
          aria-label={copy.title}
          dir={locale === "ar" ? "rtl" : "ltr"}
          className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-5 text-slate-800 shadow-[0_12px_48px_rgb(12_28_52/0.18)] sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <p className="text-base font-semibold text-navy-900">{copy.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{copy.detail}</p>
              <a
                href={`/legal/cookies?lang=${locale}`}
                className="mt-2 inline-block text-xs text-navy-900 underline underline-offset-4"
              >
                {copy.policy}
              </a>
            </div>
            <div className="flex shrink-0 gap-2 sm:flex-col">
              <button
                type="button"
                onClick={() => save("accepted")}
                className="min-h-10 rounded-md bg-navy-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {copy.accept}
              </button>
              <button
                type="button"
                onClick={() => save("rejected")}
                className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy-900"
              >
                {copy.reject}
              </button>
            </div>
          </div>
        </aside>
      ) : null}
      {canMeasure ? (
        <Script
          id="essafaria-ga4"
          src={`https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`}
          strategy="afterInteractive"
          onReady={() => {
            if (!window.__essafariaGa4Configured) {
              window.dataLayer = window.dataLayer ?? [];
              window.gtag = (...args: unknown[]) => { window.dataLayer?.push(args); };
              window.gtag("js", new Date());
              window.gtag("config", GA4_MEASUREMENT_ID, {
                send_page_view: false,
                allow_google_signals: false,
                allow_ad_personalization_signals: false,
              });
              window.__essafariaGa4Configured = true;
            }
            setTagReady(true);
          }}
        />
      ) : null}
    </>
  );
}
