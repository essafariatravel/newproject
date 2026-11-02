import Link from "next/link";
import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("b2b", await getUiLocale());
}
const partnership = {
  en: {
    desk: "Working together on a visa file",
    agency: "Your agency", agencyText: "Prepare the traveller’s application and send the documents requested for their file.",
    staff: "The ESSAFARIA team", staffText: "Our case officers review submitted files and request additional documents through the portal when needed.",
  },
  fr: {
    desk: "Le traitement d’un dossier de visa",
    agency: "Votre agence", agencyText: "Préparez la demande de votre voyageur et transmettez les justificatifs nécessaires à son dossier.",
    staff: "L’équipe ESSAFARIA", staffText: "Nos agents examinent les dossiers transmis et demandent, si nécessaire, des pièces complémentaires via le portail.",
  },
  ar: {
    desk: "آلية التعاون في معالجة ملف التأشيرة",
    agency: "وكالتكم", agencyText: "تُعدّ وكالتكم طلب المسافر وترسل المستندات المطلوبة لملفه.",
    staff: "فريق ESSAFARIA", staffText: "يراجع موظفونا الملفات المقدّمة ويطلبون مستندات إضافية عبر البوابة عند الحاجة.",
  },
} as const;

export default async function B2BPage() {
  const locale = await getUiLocale();
  const copy = publicBrandCopy(locale);
  const desk = partnership[locale];
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
          <figure className="interior-media partner-photo">
            <img data-cinematic-frame src="/images/visa-document-review.webp"
              srcSet="/images/visa-document-review-small.webp 720w, /images/visa-document-review.webp 1440w"
              sizes="(max-width: 767px) 90vw, (max-width: 1440px) 48vw, 685px"
              alt="" width="1440" height="960" fetchPriority="high" />
          </figure>
        </div>
      </section>
      <section className="interior-width partner-desk" aria-labelledby="desk-title">
        <h2 id="desk-title">{desk.desk}</h2>
        <dl className="partner-roles">
          <div><dt>{desk.agency}</dt><dd>{desk.agencyText}</dd></div>
          <div><dt>{desk.staff}</dt><dd>{desk.staffText}</dd></div>
        </dl>
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
