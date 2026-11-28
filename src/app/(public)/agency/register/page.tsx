import type { Metadata } from "next";
import RegistrationForm from "./registration-form";
import { RegistrationSpread } from "./registration-spread";
import { registrationCopy, resolveLocale } from "@/lib/i18n";
import { getUiLocale, pickUiLocale } from "@/lib/ui-i18n";
import { readPublishedLegal } from "@/lib/legal";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { publicTurnstileConfig } from "@/lib/turnstile-config";
import { registrationPhoneCountries } from "@/lib/registration-contact";
import { DEFAULT_REGISTRATION_PHONE_COUNTRY } from "@/lib/registration-draft";
import "./registration-premium.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { lang } = await searchParams;
  const locale = resolveLocale(pickUiLocale(lang) ?? await getUiLocale());
  return { title: registrationCopy(locale).metaTitle, robots: { index: false, follow: false } };
}

export default async function AgencyRegisterPage({ searchParams }: PageProps) {
  const { lang } = await searchParams;
  const locale = resolveLocale(pickUiLocale(lang) ?? await getUiLocale());
  const copy = registrationCopy(locale);
  const [terms, privacy] = await Promise.all([
    readPublishedLegal("terms", locale),
    readPublishedLegal("privacy", locale),
  ]);

  if (!terms || !privacy) {
    return <RegistrationSpread locale={locale}
      title={copy.title} introduction={copy.subtitle} alreadyPartner={copy.alreadyPartner} signIn={copy.signIn}>
      <p role="status" className="registration-unavailable">{publicBrandCopy(locale).legalMissing}</p>
    </RegistrationSpread>;
  }

  // Reuse the server's labels and ordering across hydration, regardless of the browser's ICU version.
  const countryNames = new Intl.DisplayNames([locale], { type: "region" });
  const countryOrder = new Intl.Collator(locale);
  const phoneOptions = registrationPhoneCountries.map(item => ({
    ...item, name: countryNames.of(item.country) ?? item.country,
  })).sort((a, b) => {
    if (a.country === DEFAULT_REGISTRATION_PHONE_COUNTRY) return -1;
    if (b.country === DEFAULT_REGISTRATION_PHONE_COUNTRY) return 1;
    return countryOrder.compare(a.name, b.name);
  });

  return (
    <RegistrationForm locale={locale} copy={copy} phoneOptions={phoneOptions} botConfig={publicTurnstileConfig()}
      renderedAt={Date.now()} legalVersions={{
        terms: { id: terms.id, version: terms.version },
        privacy: { id: privacy.id, version: privacy.version },
      }} />
  );
}
