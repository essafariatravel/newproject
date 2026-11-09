import Link from "next/link";
import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { buildPublicMetadata } from "@/lib/seo";
import { seoLocalizedPublicPath } from "@/lib/seo-manifest";
import { PARTNER_PUBLIC_GUIDE } from "@/lib/public-partner-guide";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("b2b", await getUiLocale());
}
const partnership = {
  en: {
    desk: "Working together on a visa file",
    agency: "Your agency", agencyText: "Prepare the traveller’s application and send the documents requested for their file.",
    staff: "The ESSAFARIA team", staffText: "Our case officers review submitted files and request additional documents through the portal when needed.",
    finance: "Agency wallet", financeText: "Check your agency’s available balance in DZD before submitting a visa application.",
  },
  fr: {
    desk: "Le traitement d’un dossier de visa",
    agency: "Votre agence", agencyText: "Préparez la demande de votre voyageur et transmettez les justificatifs nécessaires à son dossier.",
    staff: "L’équipe ESSAFARIA", staffText: "Nos agents examinent les dossiers transmis et demandent, si nécessaire, des pièces complémentaires via le portail.",
    finance: "Portefeuille agence", financeText: "Consultez le solde disponible en dinars algériens avant de soumettre un dossier de visa.",
  },
  ar: {
    desk: "آلية التعاون في معالجة ملف التأشيرة",
    agency: "وكالتكم", agencyText: "تُعدّ وكالتكم طلب المسافر وترسل المستندات المطلوبة لملفه.",
    staff: "فريق ESSAFARIA", staffText: "يراجع موظفونا الملفات المقدّمة ويطلبون مستندات إضافية عبر البوابة عند الحاجة.",
    finance: "محفظة الوكالة", financeText: "اطّلعوا على الرصيد المتاح بالدينار الجزائري قبل تقديم طلب التأشيرة.",
  },
} as const;

export default async function B2BPage() {
  const locale = await getUiLocale();
  const copy = publicBrandCopy(locale);
  const desk = partnership[locale];
  const guide = PARTNER_PUBLIC_GUIDE[locale];
  return (
    <div className="public-interior partner-interior">
      <section className="partner-lead" aria-labelledby="partner-heading">
        <div className="interior-width partner-lead-grid">
          <div className="partner-lead-copy">
            <h1 id="partner-heading">{copy.agenciesTitle}</h1>
            <p className="interior-lede">{copy.agenciesBody}</p>
            <div className="interior-actions">
              <Link href="/agency/register" className="interior-button">{copy.partner}</Link>
              <Link href="/login" className="interior-link">{copy.signIn}</Link>
            </div>
          </div>
          <div className="interior-media partner-photo">
            <img data-cinematic-frame src="/images/travel/st-gallen.webp"
              srcSet="/images/travel/st-gallen-small.webp 720w, /images/travel/st-gallen.webp 1680w"
              sizes="(max-width: 767px) 90vw, (max-width: 1440px) 48vw, 685px"
              alt="" width="1680" height="1121" fetchPriority="high" />
          </div>
        </div>
      </section>
      <section className="interior-width partner-desk" aria-labelledby="desk-title">
        <h2 id="desk-title">{desk.desk}</h2>
        <dl className="partner-roles">
          <div><dt>{desk.agency}</dt><dd>{desk.agencyText}</dd></div>
          <div><dt>{desk.staff}</dt><dd>{desk.staffText}</dd></div>
          <div><dt>{desk.finance}</dt><dd>{desk.financeText}</dd></div>
        </dl>
      </section>
      <section className="partner-guide" aria-labelledby="partner-guide-title">
        <div className="interior-width partner-guide-intro">
          <h2 id="partner-guide-title">{guide.audienceTitle}</h2>
          <p>{guide.audienceBody}</p>
        </div>
        <div className="interior-width partner-guide-process">
          <h2>{guide.stepsTitle}</h2>
          <ol className="partner-guide-steps">
            {guide.steps.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="interior-width partner-guide-limits">
          <h2>{guide.limitationsTitle}</h2>
          <div>
            <p>{guide.limitationsBody}</p>
            <nav className="interior-actions" aria-label={guide.stepsTitle}>
              <Link href={seoLocalizedPublicPath("faq", locale)} className="interior-link">{guide.faqLink}</Link>
              <Link href={seoLocalizedPublicPath("contact", locale)} className="interior-link">{guide.contactLink}</Link>
            </nav>
          </div>
        </div>
      </section>
      <section id="partner" className="partner-invitation">
        <div className="interior-width partner-invitation-grid">
          <h2>{copy.applyTitle}</h2>
          <div>
            <p>{copy.applyBody}</p>
            <Link href="/agency/register" className="interior-link">{copy.partner}</Link>
            <p className="interior-note">{copy.review}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
