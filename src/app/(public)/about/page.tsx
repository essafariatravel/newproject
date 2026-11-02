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
      <figure className="interior-media about-panorama">
        <img data-cinematic-frame src="/images/mediterranean-coast.webp"
          srcSet="/images/mediterranean-coast-small.webp 720w, /images/mediterranean-coast.webp 1440w"
          sizes="(max-width: 1440px) 100vw, 1440px"
          alt="" width="1440" height="810" fetchPriority="high" />
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
