import Link from "next/link";
import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("b2b", await getUiLocale());
}
export default async function B2BPage() {
  const copy = publicBrandCopy(await getUiLocale());
  return <section className="ess-container grid items-center gap-8 py-8 sm:py-8 lg:grid-cols-2">
    <div><p className="travel-eyebrow text-gold-700">{copy.eyebrow}</p><h1 className="mt-4 font-serif text-4xl leading-tight text-navy-900 sm:text-5xl">{copy.agenciesTitle}</h1><p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-600">{copy.agenciesBody}</p><div id="partner" className="mt-8 border-t border-line pt-6"><h2 className="font-serif text-2xl text-navy-900">{copy.applyTitle}</h2><p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-600">{copy.applyBody}</p><Link href="/agency/register" className="btn-primary mt-6">{copy.partner}<span className="directional-arrow" aria-hidden>→</span></Link><p className="mt-4 text-xs text-slate-500">{copy.review}</p></div></div>
    <figure><img src="/images/departure-atelier.webp" alt="" width="1536" height="1024" className="aspect-[4/5] w-full object-cover" /><figcaption className="mt-2 text-xs text-slate-500">{copy.illustration}</figcaption></figure>
  </section>;
}
