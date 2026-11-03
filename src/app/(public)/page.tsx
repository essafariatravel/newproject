import Link from "next/link";
import credits from "../../../public/images/travel/credits.json";
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
  en: { location: "Washington Dulles International Airport", town: "Ostuni, Italy", services: "Agency workspace", access: "Partnership", contact: "Visa desk", about: "About ESSAFARIA", partnership: "Become a partner agency", navigation: "On this page" },
  fr: { location: "Aéroport international de Washington-Dulles", town: "Ostuni, Italie", services: "Espace agence", access: "Partenariat", contact: "Service visas", about: "À propos d’ESSAFARIA", partnership: "Devenir agence partenaire", navigation: "Sur cette page" },
  ar: { location: "مطار واشنطن دالاس الدولي", town: "أوستوني، إيطاليا", services: "مساحة الوكالة", access: "الشراكة", contact: "مكتب التأشيرات", about: "عن ESSAFARIA", partnership: "انضمّوا كشركاء", navigation: "في هذه الصفحة" },
} as const;

export default async function HomePage() {
  const locale = await getUiLocale();
  const copy = publicBrandCopy(locale);
  const labels = editorial[locale];
  const registration = registrationCopy(locale);
  const cover = credits.find(photo => photo.variants.some(variant => variant.file === "dulles-terminal.webp"));
  return (
    <div className="travel-edition">
      <section className="travel-cover travel-measure" aria-labelledby="public-hero-title">
        <div className="cover-scene">
          <div className="cover-print">
            <img data-editorial-image src="/images/travel/dulles-terminal.webp"
              srcSet="/images/travel/dulles-terminal-small.webp 720w, /images/travel/dulles-terminal.webp 1680w"
              sizes="(max-width: 639px) 94vw, (max-width: 1440px) 81vw, 1140px" alt="" width="1680" height="998" fetchPriority="high" />
          </div>
          <div className="cover-masthead">
            <h1 id="public-hero-title">{copy.hero}</h1>
            <div className="cover-introduction">
              <p>{copy.intro}</p>
              <div className="cover-actions">
                <Link href="/agency/register" className="public-cta cover-primary">{copy.partner}</Link>
                <Link href="/login" className="cover-text-link">{copy.signIn}</Link>
              </div>
            </div>
          </div>
        </div>
        <div className="cover-caption">
          <div className="cover-location"><span>{labels.location}</span>
            {cover ? <small><a href={cover.source}><bdi>{cover.photographer}</bdi></a> · <a rel="license" href={cover.licenseURL}><bdi>{cover.license}</bdi></a></small> : null}
          </div>
          <nav aria-label={labels.navigation}>
            <a href="#agency-access">{labels.access}</a>
            <Link href="/contact">{labels.contact}</Link>
            <a className="cover-next" href="#visa-services">{labels.services}
              <svg className="directional-arrow" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 4v15m-6-6 6 6 6-6" /></svg>
            </a>
          </nav>
        </div>
      </section>
      <PublicVisaChapters locale={locale} />
      <section id="agency-access" className="partner-journal" aria-labelledby="partner-title">
        <div className="travel-measure partner-journal-layout">
          <figure className="partner-print">
            <div><img data-cinematic-frame src="/images/travel/ostuni.webp"
              srcSet="/images/travel/ostuni-small.webp 720w, /images/travel/ostuni.webp 1680w"
              sizes="(max-width: 760px) 94vw, 30vw" width="1680" height="2518" loading="lazy" alt="" /></div>
            <figcaption>{labels.town}</figcaption>
          </figure>
          <div className="partner-letter">
            <h2 id="partner-title">{labels.partnership}</h2>
            <p>{copy.applyBody}</p>
            <ol>{registration.success.nextSteps.map(step => <li key={step}>{step}</li>)}</ol>
            <div className="partner-letter-links">
              <Link href="/agency/register" className="public-cta cover-primary">{copy.partner}</Link>
              <Link href="/b2b" className="cover-text-link">{labels.access}</Link>
              <Link href="/about" className="cover-text-link">{labels.about}</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
