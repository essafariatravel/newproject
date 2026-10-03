import Link from "next/link";
import type { Metadata } from "next";
import RegistrationForm from "./registration-form";
import { registrationCopy, resolveLocale } from "@/lib/i18n";
import { getUiLocale, pickUiLocale } from "@/lib/ui-i18n";
import { readPublishedLegal } from "@/lib/legal";
import { publicBrandCopy } from "@/lib/public-brand-copy";
export const dynamic = "force-dynamic";
export async function generateMetadata({searchParams}: {searchParams: Promise<Record<string,string|string[]|undefined>>}): Promise<Metadata> {
  const sp = await searchParams;
  return {title: registrationCopy(resolveLocale(pickUiLocale(sp.lang) ?? await getUiLocale())).metaTitle,robots:{index:false,follow:false}};
}
export default async function AgencyRegisterPage({searchParams}: {searchParams: Promise<Record<string,string|string[]|undefined>>}) {
  const sp = await searchParams;
  const locale = resolveLocale(pickUiLocale(sp.lang) ?? await getUiLocale());
  const copy = registrationCopy(locale);
  const legal = await Promise.all([readPublishedLegal("terms",locale),readPublishedLegal("privacy",locale)]);
  return <section dir={copy.dir} lang={locale} className="ess-container grid gap-8 py-8 sm:py-8 lg:grid-cols-[.8fr_1.2fr]">
    <div><p className="travel-eyebrow text-navy-700">{copy.kicker}</p><h1 className="mt-4 font-serif text-[32px] leading-tight text-navy-900">{copy.title}</h1><p className="mt-6 max-w-md text-base leading-relaxed text-slate-600">{copy.subtitle}</p><p className="mt-8 border-t border-line pt-6 text-base text-slate-500">{copy.alreadyPartner} <Link href="/login" className="font-semibold text-navy-900 underline underline-offset-4">{copy.signIn}</Link></p></div>
    <div className="border-s border-line ps-0 lg:ps-8">{legal.every(Boolean) ? <RegistrationForm locale={locale} copy={copy} renderedAt={Date.now()} legalVersions={{terms:legal[0]!.version,privacy:legal[1]!.version}}/> : <p role="status" className="text-base leading-relaxed text-slate-600">{publicBrandCopy(locale).legalMissing}</p>}</div>
  </section>;
}
