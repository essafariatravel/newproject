import Link from "next/link";
import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { getSiteSettings, settingString } from "@/lib/settings";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("about", await getUiLocale());
}
export default async function AboutPage() {
  const locale = await getUiLocale();
  const copy = publicBrandCopy(locale);
  const ownerCopy = settingString(await getSiteSettings(), `public.about.${locale}`).trim();
  return (
    <section className="public-interior about-interior" aria-labelledby="about-heading">
      <header className="interior-width about-heading">
        <h1 id="about-heading">{copy.aboutTitle}</h1>
      </header>
      <figure className="interior-width about-plate">
        <div className="interior-media about-panorama">
          <img data-cinematic-frame src="/images/travel/cape-greco.webp"
            srcSet="/images/travel/cape-greco-small.webp 720w, /images/travel/cape-greco.webp 1680w"
            sizes="(max-width: 1440px) 90vw, 1280px"
            alt="" width="1680" height="1095" fetchPriority="high" />
        </div>
        <figcaption className="interior-caption">
          {{ en: "Sea caves at Cape Greco, Cyprus", fr: "Grottes marines du cap Greco, Chypre", ar: "الكهوف البحرية في كيب غريكو، قبرص" }[locale]}
        </figcaption>
      </figure>
      <div className="interior-width about-letter">
        <img className="about-mark" src="/images/essafaria-logo.png" alt="" width="120" height="86" loading="lazy" />
        <div>
          <p className="about-owner-copy">{ownerCopy || copy.aboutBody}</p>
          <Link href="/agency/register" className="interior-link">{copy.partner}</Link>
        </div>
      </div>
    </section>
  );
}
