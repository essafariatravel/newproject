import Link from "next/link";
import type { Metadata } from "next";
import RegistrationForm from "./registration-form";
import { registrationCopy, resolveLocale } from "@/lib/i18n";
import { getUiLocale, pickUiLocale } from "@/lib/ui-i18n";
import { readPublishedLegal } from "@/lib/legal";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { buildNoIndexMetadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata({searchParams}: {searchParams: Promise<Record<string,string|string[]|undefined>>}): Promise<Metadata> {
  const sp = await searchParams;
  return buildNoIndexMetadata(registrationCopy(resolveLocale(pickUiLocale(sp.lang) ?? await getUiLocale())).metaTitle);
}
export default async function AgencyRegisterPage({searchParams}: {searchParams: Promise<Record<string,string|string[]|undefined>>}) {
  const sp = await searchParams;
  const locale = resolveLocale(pickUiLocale(sp.lang) ?? await getUiLocale());
  const copy = registrationCopy(locale);
  const legal = await Promise.all([readPublishedLegal("terms",locale),readPublishedLegal("privacy",locale)]);
  return <section dir={copy.dir} lang={locale} className="ess-container grid gap-10 py-12 sm:py-16 lg:grid-cols-[.8fr_1.2fr]">
    <div><p className="travel-eyebrow text-gold-700">{copy.kicker}</p><h1 className="mt-3 font-serif text-4xl leading-tight text-navy-900 sm:text-5xl">{copy.title}</h1><p className="mt-5 max-w-md text-base leading-relaxed text-slate-600">{copy.subtitle}</p><p className="mt-8 border-t border-line pt-5 text-sm text-slate-500">{copy.alreadyPartner} <Link href="/login" className="font-semibold text-navy-900 underline underline-offset-4">{copy.signIn}</Link></p></div>
    <div className="border-s border-line ps-0 lg:ps-8">{legal.every(Boolean) ? <RegistrationForm locale={locale} copy={copy} renderedAt={Date.now()} legalVersions={{terms:legal[0]!.version,privacy:legal[1]!.version}}/> : <p role="status" className="text-sm leading-relaxed text-slate-600">{publicBrandCopy(locale).legalMissing}</p>}</div>
  </section>;
}
