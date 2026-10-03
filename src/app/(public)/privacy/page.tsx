import type { Metadata } from "next";
import { formatDate } from "@/lib/format";
import { contentT } from "@/lib/i18n-content";
import { getPublishedLegalVersion } from "@/lib/legal-content";
import { getUiLocale } from "@/lib/ui-i18n";

export const dynamic = "force-dynamic";

const UNAVAILABLE = {
  en: {
    title: "Privacy Notice",
    body: "The approved Privacy Notice is not yet published for this language.",
    hint: "ESSAFARIA has deliberately left this page unpublished rather than displaying draft or unapproved legal text.",
    effective: "Effective",
    version: "Version",
  },
  fr: {
    title: "Avis de confidentialité",
    body: "L’Avis de confidentialité approuvé n’est pas encore publié dans cette langue.",
    hint: "ESSAFARIA laisse volontairement cette page non publiée plutôt que d’afficher un texte juridique provisoire ou non approuvé.",
    effective: "Date d’effet",
    version: "Version",
  },
  ar: {
    title: "إشعار الخصوصية",
    body: "لم يتم بعد نشر إشعار الخصوصية المعتمد بهذه اللغة.",
    hint: "تترك ESSAFARIA هذه الصفحة غير منشورة عمداً بدلاً من عرض نص قانوني مسودة أو غير معتمد.",
    effective: "تاريخ السريان",
    version: "الإصدار",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  const version = await getPublishedLegalVersion("privacy", locale).catch(() => null);
  return {
    title: UNAVAILABLE[locale].title,
    robots: version ? undefined : { index: false, follow: false },
  };
}

export default async function PrivacyPage() {
  const locale = await getUiLocale();
  const copy = UNAVAILABLE[locale];
  const version = await getPublishedLegalVersion("privacy", locale).catch(() => null);
  const ct = contentT(locale);

  if (!version) {
    return (
      <div className="ess-container max-w-3xl py-14" dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
        <h1 className="font-serif text-3xl text-navy-900">{copy.title}</h1>
        <div className="card mt-8 p-8">
          <p className="text-base font-semibold text-navy-900">{copy.body}</p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{copy.hint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ess-container max-w-3xl py-14" dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      <h1 className="font-serif text-3xl text-navy-900">{ct("Privacy Notice")}</h1>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
        <span>{copy.version}: {version.version}</span>
        <span>{copy.effective}: {formatDate(version.effectiveAt, locale)}</span>
      </div>
      <div className="card mt-8 whitespace-pre-line p-8 text-[15px] leading-relaxed text-slate-700">
        {version.content}
      </div>
    </div>
  );
}
