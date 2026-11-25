import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { getSiteSettings, settingString } from "@/lib/settings";
import { publicContactDetails } from "@/lib/public-contact";
import { PublicCompanyIdentity } from "@/components/public-company-identity";
import { buildPublicMetadata } from "@/lib/seo";

const photograph = {
  fr: { location: "Aéroport d’Alger, terminal Ouest", credit: "Photographie de", crop: "Image recadrée." },
  en: { location: "Algiers Airport, West Terminal", credit: "Photograph by", crop: "Cropped image." },
  ar: { location: "مطار الجزائر، المحطة الغربية", credit: "تصوير", crop: "صورة مقتصّة." },
};

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
  const photo = photograph[locale];
  return (
    <section className="public-front-page info-page" aria-labelledby="about-heading">
      <div className="info-width info-about-hero">
        <header className="info-hero-copy">
          <h1 id="about-heading">{copy.aboutTitle}</h1>
          <p className="info-lead info-owner-copy">{ownerCopy || copy.aboutBody}</p>
        </header>
        <figure className="info-terminal">
          <picture>
            <source media="(max-width: 680px)" srcSet="/images/travel/alger-mobile.webp" width="800" height="600" />
            <img src="/images/travel/alger.webp" width="1280" height="960" alt={photo.location} fetchPriority="high" decoding="async" />
          </picture>
          <figcaption>
            {photo.location}. {photo.credit} <a href="https://commons.wikimedia.org/wiki/File:Terminal_Ouest.jpg">Knight of honor</a>.
            {" "}<a rel="license" href="https://creativecommons.org/licenses/by-sa/4.0/"><bdi dir="ltr">CC BY-SA 4.0</bdi></a>. {photo.crop}
          </figcaption>
        </figure>
      </div>
      <PublicCompanyIdentity locale={locale} address={address} />
    </section>
  );
}
