import Link from "next/link";
import type { Metadata } from "next";
import { getUiLocale } from "@/lib/ui-i18n";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { buildPublicMetadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata("about", await getUiLocale());
}
export default async function AboutPage() {
  const copy = publicBrandCopy(await getUiLocale());
  return <section className="ess-container max-w-4xl py-16 sm:py-24"><p className="travel-eyebrow text-gold-700">ESSAFARIA</p><h1 className="mt-4 max-w-2xl font-serif text-4xl leading-tight text-navy-900 sm:text-5xl">{copy.aboutTitle}</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">{copy.aboutBody}</p><Link href="/agency/register" className="btn-primary mt-8">{copy.partner}</Link></section>;
}
