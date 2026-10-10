import type { Metadata } from "next";
import { readPublishedLegal } from "@/lib/legal";
import { getUiLocale } from "@/lib/ui-i18n";
import { formatDate } from "@/lib/format";
import { contentT } from "@/lib/i18n-content";
import { publicBrandCopy } from "@/lib/public-brand-copy";

export const dynamic = "force-dynamic";

const LABELS = {
  en: { effective: "Effective", version: "Version" },
  fr: { effective: "Date d’effet", version: "Version" },
  ar: { effective: "تاريخ السريان", version: "الإصدار" },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  const legal = await readPublishedLegal("terms", locale);
  return {
    title: {"en":"Terms of Service","fr":"Conditions d’utilisation","ar":"شروط الخدمة"}[locale],
    robots: legal ? undefined : { index: false, follow: false },
  };
}

export default async function TermsPage() {
  const locale = await getUiLocale();
  const ct = contentT(locale);
  const legal = await readPublishedLegal("terms", locale);
  const labels = LABELS[locale];

  return (
    <section
      dir={locale === "ar" ? "rtl" : "ltr"}
      lang={locale}
      className="ess-container max-w-3xl py-8"
    >
      <h1 className="font-serif text-[32px] text-navy-900">{ct("Terms of Service")}</h1>
      {legal ? (
        <>
          <p className="mt-2 text-xs text-slate-500">
            {labels.version} {legal.version} · {labels.effective}: {formatDate(legal.effectiveAt, locale)}
          </p>
          <div className="mt-8 whitespace-pre-line border-t border-line pt-6 text-base leading-relaxed text-slate-700">
            {legal.body}
          </div>
        </>
      ) : (
        <p role="status" className="mt-6 border-t border-line pt-6 text-base leading-relaxed text-slate-600">
          {publicBrandCopy(locale).legalMissing}
        </p>
      )}
    </section>
  );
}
