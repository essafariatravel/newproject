import Link from "next/link";
import type { UiLocale } from "@/lib/ui-i18n";
import { seoLocalizedPublicPath } from "@/lib/seo-manifest";
import { PUBLIC_AGENCY_DISCOVERY, PUBLIC_AGENCY_READINESS } from "@/lib/public-agency-discovery";

export function PublicAgencyDiscovery({ locale }: { locale: UiLocale }) {
  const copy = PUBLIC_AGENCY_DISCOVERY[locale];
  return (
    <section className="platform-discovery" aria-labelledby="agency-discovery-title">
      <div className="platform-width">
        <div className="platform-discovery-heading">
          <h2 id="agency-discovery-title">{copy.title}</h2>
          <p>{copy.intro}</p>
        </div>
        <ul className="platform-discovery-links">
          {copy.items.map(item => (
            <li key={item.page}>
              <h3><Link href={seoLocalizedPublicPath(item.page, locale)}>{item.title}</Link></h3>
              <p>{item.summary}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function PublicAgencyReadiness({ locale }: { locale: UiLocale }) {
  const copy = PUBLIC_AGENCY_READINESS[locale];
  return (
    <section className="interior-width agency-readiness" aria-labelledby="agency-readiness-title">
      <div className="agency-readiness-heading">
        <h2 id="agency-readiness-title">{copy.title}</h2>
        <p>{copy.intro}</p>
        <Link href={seoLocalizedPublicPath("about", locale)}>{copy.aboutLink}</Link>
      </div>
      <ol className="agency-readiness-list">
        {copy.checks.map(check => (
          <li key={check.title}>
            <h3>{check.title}</h3>
            <p>{check.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
