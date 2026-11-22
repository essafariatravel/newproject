import Link from "next/link";
import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { registrationCopy } from "@/lib/i18n";
import { buildPublicMetadata } from "@/lib/seo";
import { PublicVisaChapters } from "@/components/public-visa-chapters";
import { PublicActionLabel } from "@/components/public-action-label";
import { seoLocalizedPublicPath } from "@/lib/seo-manifest";
import photos from "../../../public/images/travel/credits.json";

const airportPhoto = photos.find(photo => photo.variants.some(variant => variant.file === "dulles-terminal.webp"));

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("home", await getUiLocale());
}

const entry = {
  en: { partnership: "Partner with ESSAFARIA", details: "Partnership details", contact: "Contact the visa desk", airport: "Washington Dulles, USA" },
  fr: { partnership: "Devenez partenaire ESSAFARIA", details: "Le partenariat", contact: "Contacter le service visas", airport: "Washington-Dulles, États-Unis" },
  ar: { partnership: "انضمّوا إلى شركاء ESSAFARIA", details: "تفاصيل الشراكة", contact: "تواصلوا مع مكتب التأشيرات", airport: "مطار واشنطن دالاس، الولايات المتحدة" },
} as const;

export default async function HomePage() {
  if (!airportPhoto) throw new Error("Missing photo credit for the Dulles terminal");
  const locale = await getUiLocale();
  const copy = publicBrandCopy(locale);
  const labels = entry[locale];
  const registration = registrationCopy(locale);
  return (
    <div className="platform-home">
      <section className="platform-hero" aria-labelledby="public-hero-title">
        <div className="hero-airport" aria-hidden="true">
          <img data-hero-image src="/images/travel/dulles-terminal.webp"
            srcSet="/images/travel/dulles-terminal-small.webp 720w, /images/travel/dulles-terminal.webp 1680w"
            sizes="(max-width: 680px) 100vw, 78vw" alt="" width="1680" height="998" fetchPriority="high" />
        </div>
        <div className="platform-width hero-content">
          <h1 id="public-hero-title">{copy.hero}</h1>
          <p>{copy.intro}</p>
          <div className="hero-actions">
            <Link href={`/agency/register?lang=${locale}`} className="public-cta platform-primary"><PublicActionLabel locale={locale}>{copy.partner}</PublicActionLabel>
              <svg aria-hidden="true" className="directional-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
            </Link>
            <Link href={`/login?lang=${locale}`} className="platform-secondary"><PublicActionLabel locale={locale}>{copy.signIn}</PublicActionLabel></Link>
          </div>
          <small className="hero-credit">
            {labels.airport} · <a href={airportPhoto.source}><bdi>{airportPhoto.photographer}</bdi></a>
            {" · "}<a href={airportPhoto.licenseURL} rel="license"><bdi>{airportPhoto.license}</bdi></a>
          </small>
        </div>
      </section>
      <PublicVisaChapters locale={locale} />
      <section id="agency-access" className="partner-access" aria-labelledby="partner-title">
        <div className="platform-width access-layout">
          <div>
            <h2 id="partner-title">{labels.partnership}</h2>
            <p>{copy.applyBody}</p>
            <div className="access-links">
              <Link href={`/agency/register?lang=${locale}`} className="public-cta platform-primary"><PublicActionLabel locale={locale}>{copy.partner}</PublicActionLabel></Link>
              <Link href={seoLocalizedPublicPath("b2b", locale)}>{labels.details}</Link>
            </div>
          </div>
          <div className="access-process">
            <ol>
              {registration.success.nextSteps.map(step => <li key={step}>{step}</li>)}
            </ol>
            <Link href={seoLocalizedPublicPath("contact", locale)}>{labels.contact}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
