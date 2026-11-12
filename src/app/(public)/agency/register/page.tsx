import Link from "next/link";
import type { Metadata } from "next";
import RegistrationForm from "./registration-form";
import { registrationCopy, resolveLocale } from "@/lib/i18n";
import { getUiLocale, pickUiLocale } from "@/lib/ui-i18n";
import { readPublishedLegal } from "@/lib/legal";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { publicTurnstileConfig } from "@/lib/turnstile-config";
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
  return (
    <section dir={copy.dir} lang={locale} className="public-interior registration-interior" aria-labelledby="register-title">
      <div className="interior-width registration-spread">
        <header className="registration-heading">
          <h1 id="register-title">{copy.title}</h1>
          <p className="interior-lede">{copy.subtitle}</p>
          <p className="registration-sign-in">{copy.alreadyPartner} <Link href="/login" className="interior-link">{copy.signIn}</Link></p>
        </header>
        <div className="registration-paper">
          {legal.every(Boolean) ? (
            <RegistrationForm locale={locale} copy={copy} botConfig={publicTurnstileConfig()} renderedAt={Date.now()} legalVersions={{
              terms:{id:legal[0]!.id,version:legal[0]!.version},
              privacy:{id:legal[1]!.id,version:legal[1]!.version},
            }} />
          ) : <p role="status" className="interior-lede">{publicBrandCopy(locale).legalMissing}</p>}
        </div>
      </div>
    </section>
  );
}
