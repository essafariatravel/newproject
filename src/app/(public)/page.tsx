import Link from "next/link";
import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { registrationCopy } from "@/lib/i18n";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("home", await getUiLocale());
}
const editorialCopy = {
  en: { process: "A partnership, step by step.", steps: ["Your request", "The right documents", "Your agency access"], about: "Discover ESSAFARIA", contact: "Contact our team" },
  fr: { process: "Un partenariat, étape par étape.", steps: ["Votre demande", "Les documents utiles", "Votre accès agence"], about: "Découvrir ESSAFARIA", contact: "Contacter notre équipe" },
  ar: { process: "شراكة، خطوة بخطوة.", steps: ["طلبكم", "الوثائق المطلوبة", "دخول وكالتكم"], about: "تعرّفوا على ESSAFARIA", contact: "تواصلوا مع فريقنا" },
} as const;

export default async function HomePage() {
  const locale = await getUiLocale();
  const copy = publicBrandCopy(locale);
  const editorial = editorialCopy[locale];
  const registration = registrationCopy(locale);

  return (
    <div className="premium-home">
      <section className="premium-hero" aria-labelledby="public-hero-title">
        <figure className="premium-hero-media">
          <img data-editorial-image src="/images/essafaria-departure-editorial.webp" alt="" width="1672" height="941" fetchPriority="high" />
          <figcaption>{copy.illustration}</figcaption>
        </figure>
        <div className="ess-container premium-hero-content">
          <div className="premium-hero-copy">
            <h1 id="public-hero-title">{copy.hero}</h1>
            <p>{copy.intro}</p>
            <div className="premium-hero-actions">
              <Link href="/agency/register" className="public-cta premium-primary premium-desktop-partner">{copy.partner}</Link>
              <Link href="/login" className="public-cta premium-secondary">{copy.signIn}
                <svg className="directional-arrow" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="ess-container premium-introduction" aria-labelledby="partner-title">
        <h2 id="partner-title">{copy.agenciesTitle}</h2>
        <div className="premium-introduction-copy">
          <p>{copy.agenciesBody}</p>
          <Link href="/b2b" className="premium-text-link">{copy.partner}</Link>
        </div>
      </section>

      <section className="premium-partnership" aria-labelledby="partnership-process-title">
        <div className="ess-container premium-partnership-layout">
          <div className="premium-partnership-heading">
            <h2 id="partnership-process-title">{editorial.process}</h2>
            <p>{copy.applyBody}</p>
            <p className="premium-review-note">{copy.review}</p>
          </div>
          <ol className="premium-partnership-steps">
            {registration.success.nextSteps.map((step, index) => (
              <li key={step}>
                <span className="premium-step-index" aria-hidden="true">{index + 1}</span>
                <div><h3>{editorial.steps[index]}</h3><p>{step}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="ess-container premium-closing" aria-labelledby="public-about-title">
        <div className="premium-closing-title"><h2 id="public-about-title">{copy.aboutTitle}</h2><Link href="/about" className="premium-text-link">{editorial.about}</Link></div>
        <div className="premium-closing-copy"><p>{copy.aboutBody}</p><Link href="/contact" className="premium-text-link">{editorial.contact}</Link></div>
      </section>
    </div>
  );
}
