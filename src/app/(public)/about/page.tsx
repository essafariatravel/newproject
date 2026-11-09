import Link from "next/link";
import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { getSiteSettings, settingString } from "@/lib/settings";
import { publicContactDetails } from "@/lib/public-contact";
import { PublicCompanyIdentity } from "@/components/public-company-identity";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("about", await getUiLocale());
}
export default async function AboutPage() {
  const locale = await getUiLocale();
  const copy = publicBrandCopy(locale);
  const settings = await getSiteSettings();
  const ownerCopy = settingString(settings, `public.about.${locale}`).trim();
  const { address } = publicContactDetails(settings);
  return (
    <section className="public-interior about-interior" aria-labelledby="about-heading">
      <header className="interior-width about-heading">
        <h1 id="about-heading">{copy.aboutTitle}</h1>
      </header>
      <div className="interior-width about-plate">
        <div className="interior-media about-panorama">
          <img data-cinematic-frame src="/images/travel/cape-greco.webp"
            srcSet="/images/travel/cape-greco-small.webp 720w, /images/travel/cape-greco.webp 1680w"
            sizes="(max-width: 1440px) 90vw, 1280px"
            alt="" width="1680" height="1095" fetchPriority="high" />
        </div>
      </div>
      <div className="interior-width about-letter">
        <img className="about-mark" src="/images/essafaria-logo.png" alt="" width="120" height="86" loading="lazy" />
        <div>
          <p className="about-owner-copy">{ownerCopy || copy.aboutBody}</p>
          <Link href="/agency/register" className="interior-link">{copy.partner}</Link>
        </div>
      </div>
      <PublicCompanyIdentity locale={locale} address={address} />
    </section>
  );
}
