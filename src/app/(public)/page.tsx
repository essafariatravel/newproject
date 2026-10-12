import Link from "next/link";
import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("home", await getUiLocale());
}
export default async function HomePage() {
  const copy = publicBrandCopy(await getUiLocale());
  return <>
    <section className="travel-public-hero" aria-labelledby="public-hero-title">
      <div className="travel-public-copy"><div>
        <p className="travel-eyebrow">{copy.eyebrow}</p>
        <h1 id="public-hero-title" className="editorial-reveal">{copy.hero}</h1>
        <p className="editorial-reveal">{copy.intro}</p>
        <div className="editorial-reveal mt-8 flex flex-wrap gap-4">
          <Link href="/agency/register" className="public-cta btn-gold hidden px-6 py-4 sm:inline-flex">{copy.partner}<span className="directional-arrow" aria-hidden>→</span></Link>
          <Link href="/login" className="public-cta btn border border-white/55 bg-transparent px-6 py-4 text-white hover:bg-white/10">{copy.signIn}</Link>
        </div>
      </div></div>
      <figure className="travel-public-photo"><img src="/images/departure-atelier.webp" alt="" width="1536" height="1024" fetchPriority="high" /><figcaption>{copy.illustration}</figcaption></figure>
    </section>
    <section className="ess-container grid gap-8 py-8 sm:py-8 md:grid-cols-[1fr_.7fr]" aria-labelledby="partner-title">
      <div><p className="travel-eyebrow text-navy-700">ESSAFARIA</p><h2 id="partner-title" className="mt-4 max-w-xl font-serif text-[32px] text-navy-900 sm:text-[32px]">{copy.agenciesTitle}</h2><p className="mt-6 max-w-xl text-base leading-relaxed text-slate-600">{copy.agenciesBody}</p></div>
      <div className="border-s border-line ps-6 md:self-center"><p className="max-w-sm text-base leading-relaxed text-slate-600">{copy.applyBody}</p><Link href="/b2b" className="mt-6 inline-flex text-base font-semibold text-navy-900 underline underline-offset-8">{copy.partner} <span className="directional-arrow" aria-hidden> →</span></Link></div>
    </section>
  </>;
}
