import type { UiLocale } from "@/lib/ui-i18n";
import { PUBLIC_COMPANY_COPY, PUBLIC_COMPANY_FACTS } from "@/lib/public-company-identity";
import { seoLocalizedPublicPath } from "@/lib/seo-manifest";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import Link from "next/link";
import { PublicActionLabel } from "@/components/public-action-label";

/** Editorial credibility section; no partner pricing or private business data. */
export function PublicCompanyIdentity({ locale, address }: { locale: UiLocale; address?: string | null }) {
  const copy = PUBLIC_COMPANY_COPY[locale];
  const facts = PUBLIC_COMPANY_FACTS;
  const publishedAddress = address?.trim() || facts.fallbackAddress;
  return (
    <>
    <section className="info-width info-row" aria-labelledby="company-identity-title">
      <header>
        <h2 id="company-identity-title">{copy.heading}</h2>
        <p>{copy.introduction}</p>
      </header>
      <div>
        <dl className="info-credentials">
          <div><dt>{copy.licenceLabel}</dt><dd><bdi dir="ltr">{facts.tourismLicence}</bdi></dd></div>
          <div><dt>{copy.iataLabel}</dt><dd><bdi dir="ltr">{facts.iataNumber}</bdi></dd></div>
        </dl>
        <dl className="info-records">
          <div><dt>{copy.companyLabel}</dt><dd>{facts.operatorName}</dd></div>
          <div><dt>{copy.addressLabel}</dt><dd>{publishedAddress}</dd></div>
          <div><dt>{copy.websiteLabel}</dt><dd><a href={facts.website}>{copy.websiteText}</a></dd></div>
        </dl>
        <p className="info-note">{copy.accreditationNote}</p>
      </div>
    </section>
    <section className="info-width info-row">
      <header><h2>{copy.methodTitle}</h2><p>{copy.methodBody}</p></header>
      <div className="info-actions">
        <Link className="info-link" href={seoLocalizedPublicPath("b2b", locale)}>{copy.methodLink}</Link>
        <Link className="info-primary" href={`/agency/register?lang=${locale}`}><PublicActionLabel locale={locale}>{publicBrandCopy(locale).partner}</PublicActionLabel></Link>
      </div>
    </section>
    </>
  );
}
