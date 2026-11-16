import type { UiLocale } from "@/lib/ui-i18n";
import { PUBLIC_COMPANY_COPY, PUBLIC_COMPANY_FACTS } from "@/lib/public-company-identity";
import { seoLocalizedPublicPath } from "@/lib/seo-manifest";

/** Editorial credibility section; no partner pricing or private business data. */
export function PublicCompanyIdentity({ locale, address }: { locale: UiLocale; address?: string | null }) {
  const copy = PUBLIC_COMPANY_COPY[locale];
  const facts = PUBLIC_COMPANY_FACTS;
  const publishedAddress = address?.trim() || facts.fallbackAddress;
  return (
    <section className="interior-width about-identity" aria-labelledby="company-identity-title">
      <div className="about-identity-intro">
        <h2 id="company-identity-title">{copy.heading}</h2>
        <p>{copy.introduction}</p>
      </div>
      <div>
        <dl className="about-identity-facts">
          <div><dt>{copy.companyLabel}</dt><dd>{facts.operatorName}</dd></div>
          <div><dt>{copy.licenceLabel}</dt><dd><bdi dir="ltr">{facts.tourismLicence}</bdi></dd></div>
          <div><dt>{copy.iataLabel}</dt><dd><bdi dir="ltr">{facts.iataNumber}</bdi></dd></div>
          <div><dt>{copy.addressLabel}</dt><dd>{publishedAddress}</dd></div>
          <div><dt>{copy.websiteLabel}</dt><dd><a href={facts.website}>{copy.websiteText}</a></dd></div>
        </dl>
        <p className="about-identity-note">{copy.accreditationNote}</p>
        <div className="about-identity-method">
          <h3>{copy.methodTitle}</h3>
          <p>{copy.methodBody}</p>
          <a href={seoLocalizedPublicPath("b2b", locale)}>{copy.methodLink}</a>
        </div>
      </div>
    </section>
  );
}
