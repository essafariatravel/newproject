import Link from "next/link";
import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { registrationCopy } from "@/lib/i18n";
import { buildPublicMetadata } from "@/lib/seo";
import { PublicVisaChapters } from "@/components/public-visa-chapters";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("home", await getUiLocale());
}

const editorial = {
  en: { services: "Visa services", access: "Partner access", contact: "Contact the visa desk", about: "About ESSAFARIA", partnership: "Working with ESSAFARIA", request: "How to become a partner", navigation: "Explore the public site" },
  fr: { services: "Service visas", access: "Accès partenaire", contact: "Contacter le service visas", about: "À propos d’ESSAFARIA", partnership: "Travailler avec ESSAFARIA", request: "Devenir agence partenaire", navigation: "Explorer le site public" },
  ar: { services: "خدمات التأشيرات", access: "دخول الشركاء", contact: "التواصل مع فريق التأشيرات", about: "عن ESSAFARIA", partnership: "العمل مع ESSAFARIA", request: "كيف تصبح وكالتكم شريكاً", navigation: "استكشاف الموقع" },
} as const;

export default async function HomePage() {
  const locale = await getUiLocale();
  const copy = publicBrandCopy(locale);
  const labels = editorial[locale];
  const registration = registrationCopy(locale);
  return (
    <div className="premium-home">
      <section className="premium-hero" aria-labelledby="public-hero-title">
        <figure className="premium-hero-media">
          <img data-editorial-image src="/images/visa-file-cover.webp"
            srcSet="/images/visa-file-cover-small.webp 720w, /images/visa-file-cover.webp 1672w"
            sizes="100vw" alt="" width="1672" height="941" fetchPriority="high" />
        </figure>
        <div className="ess-container premium-hero-content">
          <div className="premium-hero-copy">
            <h1 id="public-hero-title">{copy.hero}</h1>
            <p>{copy.intro}</p>
            <div className="premium-hero-actions">
              <Link href="/agency/register" className="public-cta premium-primary premium-desktop-partner">{copy.partner}</Link>
              <Link href="/login" className="public-cta premium-secondary">
                {copy.signIn}
                <svg className="directional-arrow" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <nav className="visa-index" aria-label={labels.navigation}>
        <div className="ess-container">
          <a href="#visa-services">{labels.services}</a>
          <a href="#agency-access">{labels.access}</a>
          <Link href="/contact">{labels.contact}</Link>
        </div>
      </nav>
      <PublicVisaChapters locale={locale} />
      <section id="agency-access" className="visa-partner-spread" aria-labelledby="partner-title">
        <figure className="visa-partner-photo">
          <img data-cinematic-frame src="/images/essafaria-departure-editorial.webp"
            width="1672" height="941" loading="lazy" alt="" />
        </figure>
        <div className="visa-partner-copy">
          <h2 id="partner-title">{labels.partnership}</h2>
          <p>{copy.agenciesBody}</p>
          <h3>{labels.request}</h3>
          <ol>{registration.success.nextSteps.map(step => <li key={step}>{step}</li>)}</ol>
          <div className="visa-partner-links">
            <Link href="/b2b">{labels.access}</Link>
            <Link href="/about">{labels.about}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
