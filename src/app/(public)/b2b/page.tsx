import Link from "next/link";
import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { buildPublicMetadata } from "@/lib/seo";
import { seoLocalizedPublicPath } from "@/lib/seo-manifest";
import { PARTNER_PUBLIC_GUIDE } from "@/lib/public-partner-guide";
import { PublicOperationalEvidence } from "@/components/public-operational-evidence";
import { PublicAgencyReadiness } from "@/components/public-agency-discovery";
import { PartnerRoles } from "@/components/public-information/partner-roles";
import { PUBLIC_OPERATIONAL_EVIDENCE } from "@/lib/public-operational-evidence";
import { PublicActionLabel } from "@/components/public-action-label";

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
    <div className="public-front-page info-page">
      <section className="info-width info-hero-pair" aria-labelledby="partner-heading">
          <div className="info-hero-copy">
            <h1 id="partner-heading">{copy.agenciesTitle}</h1>
            <p className="info-lead">{copy.agenciesBody}</p>
            <div className="info-actions">
              <Link href={`/agency/register?lang=${locale}`} className="info-primary"><PublicActionLabel locale={locale}>{copy.partner}</PublicActionLabel></Link>
              <Link href={`/login?lang=${locale}`} className="info-link">{copy.signIn}</Link>
            </div>
          </div>
          <PartnerRoles locale={locale} title={desk.desk} alt={PUBLIC_OPERATIONAL_EVIDENCE[locale].screenshotAlt}
            roles={[
              { title: desk.agency, detail: desk.agencyText },
              { title: desk.staff, detail: desk.staffText },
              { title: desk.finance, detail: desk.financeText },
            ]} />
      </section>
      <section className="info-width info-row" aria-labelledby="partner-guide-title">
        <header>
          <h2 id="partner-guide-title">{guide.audienceTitle}</h2>
          <p>{guide.audienceBody}</p>
        </header>
        <div>
          <h2>{guide.stepsTitle}</h2>
          <ol className="info-lines">
            {guide.steps.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <PublicAgencyReadiness locale={locale} />
      <PublicOperationalEvidence locale={locale} />
      <section className="info-width info-row">
        <header>
          <h2>{guide.limitationsTitle}</h2>
          <p>{guide.limitationsBody}</p>
        </header>
        <nav className="info-actions" aria-label={guide.limitationsTitle}>
          <Link href={seoLocalizedPublicPath("faq", locale)} className="info-link">{guide.faqLink}</Link>
          <Link href={seoLocalizedPublicPath("contact", locale)} className="info-link">{guide.contactLink}</Link>
        </nav>
      </section>
      <section id="partner" className="info-width info-row">
        <header>
          <h2>{copy.applyTitle}</h2>
          <p>{copy.applyBody}</p>
        </header>
        <div>
          <Link href={`/agency/register?lang=${locale}`} className="info-primary"><PublicActionLabel locale={locale}>{copy.partner}</PublicActionLabel></Link>
          <p className="info-note">{copy.review}</p>
        </div>
      </section>
    </div>
  );
}
