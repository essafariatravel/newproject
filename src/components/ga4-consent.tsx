"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  GA4_CONSENT_KEY,
  GA4_PRODUCTION_HOST,
  isGa4PublicMarketingPath,
} from "@/lib/public-analytics";

type Locale = "en" | "fr" | "ar";
type Consent = "loading" | "unset" | "accepted" | "rejected";

const COPY = {
  en: {
    preferences: "Analytics preferences",
    title: "Website analytics",
    detail: "With your permission, Google Analytics measures visits to public pages. The service may store analytics cookies. Visa applications, agency accounts and documents are not tracked. You can withdraw consent at any time.",
    accept: "Allow analytics",
    reject: "Decline",
    policy: "Cookie policy",
  },
  fr: {
    preferences: "Préférences statistiques",
    title: "Statistiques de fréquentation",
    detail: "Avec votre accord, Google Analytics mesure les visites des pages publiques et peut déposer des cookies statistiques. Aucun dossier visa, compte agence ou document n'est suivi. Vous pouvez retirer votre accord à tout moment.",
    accept: "Accepter",
    reject: "Refuser",
    policy: "Politique de cookies",
  },
  ar: {
    preferences: "إعدادات الإحصاءات",
    title: "إحصاءات زيارة الموقع",
    detail: "بعد موافقتك، تُستخدم Google Analytics لقياس زيارات الصفحات العامة وقد تحفظ ملفات تعريف ارتباط إحصائية. لا يتم تتبع طلبات التأشيرة أو حسابات الوكالات أو المستندات. يمكنك سحب الموافقة في أي وقت.",
    accept: "موافق",
    reject: "رفض",
    policy: "سياسة ملفات الارتباط",
  },
} as const;

function eraseGoogleAnalyticsCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=")[0] ?? "";
    if (!/^_ga(?:_|$)/.test(name) && name !== "_gid") continue;
    for (const domain of ["", "; Domain=.essafariavoyages.com"]) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain}`;
    }
  }
}

/**
 * Google code executes only inside the inert iframe bridge, not in the Next.js
 * app window. Browser-history measurement inside GA4 thus cannot observe a
 * transition into private Staff/Agency URLs. No query strings are transmitted.
 */
export function Ga4Consent({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? "";
  const frame = useRef<HTMLIFrameElement>(null);
  const lastPath = useRef<string | null>(null);
  const [consent, setConsent] = useState<Consent>("loading");
  const [editing, setEditing] = useState(false);
  const [productionHost, setProductionHost] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
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
    if (!canMeasure) {
      lastPath.current = null;
      setFrameReady(false);
    }
  }, [canMeasure]);

  useEffect(() => {
    if (!canMeasure || !frameReady || lastPath.current === pathname) return;
    const receiver = frame.current?.contentWindow;
    if (!receiver) return;
    receiver.postMessage({ type: "essafaria-ga4-page-view", pathname }, window.location.origin);
    lastPath.current = pathname;
  }, [canMeasure, frameReady, pathname]);

  const save = (decision: "accepted" | "rejected") => {
    try {
      window.localStorage.setItem(GA4_CONSENT_KEY, decision);
    } catch {
      // Choice applies in this tab; the user may be prompted again next visit.
    }
    if (consent === "accepted" && decision === "rejected") {
      eraseGoogleAnalyticsCookies();
      window.location.reload(); // Tear down the isolated tag and any active queue.
      return;
    }
    setConsent(decision);
    setEditing(false);
  };

  return (
    <>
      {eligible ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-white/65 underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          {copy.preferences}
        </button>
      ) : null}
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
              <a href={`/legal/cookies?lang=${locale}`} className="mt-2 inline-block text-xs text-navy-900 underline underline-offset-4">
                {copy.policy}
              </a>
              <span className="ms-3 text-xs text-slate-500">Google Analytics 4</span>
            </div>
            <div className="flex shrink-0 gap-2 sm:flex-col">
              <button type="button" onClick={() => save("accepted")}
                className="min-h-10 rounded-md bg-navy-900 px-4 py-2 text-sm font-semibold text-white">
                {copy.accept}
              </button>
              <button type="button" onClick={() => save("rejected")}
                className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy-900">
                {copy.reject}
              </button>
            </div>
          </div>
        </aside>
      ) : null}
      {canMeasure ? (
        <iframe
          ref={frame}
          title="ESSAFARIA anonymous page analytics"
          aria-hidden="true"
          tabIndex={-1}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          src="/analytics-bridge.html"
          className="pointer-events-none absolute h-0 w-0 overflow-hidden border-0"
          onLoad={() => {
            lastPath.current = null;
            setFrameReady(true);
          }}
        />
      ) : null}
    </>
  );
}
