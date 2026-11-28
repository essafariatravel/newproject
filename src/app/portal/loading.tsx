"use client";

import { usePathname } from "next/navigation";
import { useClientLocale } from "@/lib/client-locale";

const copy = {
  fr: { loading: "Chargement de votre espace…", cases: "Dossiers", new: "Nouvelle demande", documents: "Documents", travellers: "Voyageurs", wallet: "Portefeuille", messages: "Messages", notifications: "Notifications", profile: "Profil", catalogue: "Actualités du catalogue" },
  en: { loading: "Loading your workspace…", cases: "Applications", new: "New application", documents: "Documents", travellers: "Travellers", wallet: "Wallet", messages: "Messages", notifications: "Notifications", profile: "Profile", catalogue: "Catalogue updates" },
  ar: { loading: "جارٍ تحميل مساحة العمل…", cases: "الطلبات", new: "طلب جديد", documents: "الوثائق", travellers: "المسافرون", wallet: "المحفظة", messages: "الرسائل", notifications: "الإشعارات", profile: "الملف الشخصي", catalogue: "تحديثات الخدمات" },
};

function Bar({ width, height = 14 }: { width: string; height?: number }) {
  return <div style={{ width, maxWidth: "100%", height, borderRadius: 4, background: "var(--one-rule, #e2e5e9)" }} />;
}

export default function AgencyLoading() {
  const path = usePathname() ?? "/portal";
  const locale = useClientLocale(), t = copy[locale];
  const wizard = path === "/portal/applications/new";
  const detail = path.startsWith("/portal/applications/") && !wizard;
  const profile = path.startsWith("/portal/profile");
  const home = path === "/portal";
  const messages = path.startsWith("/portal/communications");
  const wallet = path.startsWith("/portal/wallet");
  const title = wizard ? t.new : path.startsWith("/portal/applications") ? t.cases : path.startsWith("/portal/documents") ? t.documents : path.startsWith("/portal/applicants") ? t.travellers : wallet ? t.wallet : messages ? t.messages : path.startsWith("/portal/notifications") ? t.notifications : profile ? t.profile : path.startsWith("/portal/catalogue-updates") ? t.catalogue : "";
  return <section role="status" aria-live="polite" aria-busy="true" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className="agency-route-loading min-w-0 w-full">
    <p className="sr-only">{t.loading}</p>
    <div aria-hidden="true" className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {title ? <div style={{ fontSize: "var(--one-title, 2rem)", fontWeight: 600, color: "var(--one-ink, #0b1c30)", lineHeight: 1.2 }}>{title}</div> : <Bar width="min(300px, 70%)" height={30} />}
        <Bar width="min(140px, 40%)" height={44} />
      </div>
      {wizard || detail || profile || messages ? <div className="grid min-w-0 gap-6 md:grid-cols-3">
        <div className="min-w-0 grid content-start gap-4 md:col-span-2">
          <Bar width="65%" height={22} />
          {Array.from({length: 4}, (_, i) => <div key={i} className="grid gap-3 border-b border-slate-200 py-4"><Bar width="32%" /><Bar width={i % 2 ? "76%" : "100%"} height={wizard || profile ? 46 : 16} /></div>)}
        </div>
        <div className="min-w-0 grid content-start gap-4 border-t border-slate-200 py-4 md:border-t-0 md:border-s md:ps-6"><Bar width="65%" height={22} /><Bar width="100%" /><Bar width="78%" /><Bar width="100%" height={44} /></div>
      </div> : <>
        {home || wallet ? <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-3 border-b border-slate-200 py-6"><Bar width="40%" /><Bar width="65%" height={36} /></div><div className="grid gap-3 border-b border-slate-200 py-6"><Bar width="50%" /><Bar width="55%" height={36} /></div></div> : <div className="flex flex-wrap gap-4 border-b border-slate-200 pb-4"><Bar width="74px" height={20} /><Bar width="92px" height={20} /><Bar width="120px" height={20} /></div>}
        <Bar width="min(420px, 100%)" height={46} />
        {Array.from({length: 5}, (_, i) => <div key={i} className="grid grid-cols-2 items-center gap-4 border-b border-slate-200 py-4 sm:grid-cols-3"><div className="grid gap-2"><Bar width="80%" height={16} /><Bar width="48%" /></div><Bar width="68%" /><div className="hidden sm:block"><Bar width="54%" /></div></div>)}
      </>}
    </div>
  </section>;
}
