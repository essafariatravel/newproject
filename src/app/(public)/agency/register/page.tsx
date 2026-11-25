import type { Metadata } from "next";
import RegistrationForm from "./registration-form";
import { RegistrationSpread } from "./registration-spread";
import { registrationCopy, resolveLocale } from "@/lib/i18n";
import { getUiLocale, pickUiLocale } from "@/lib/ui-i18n";
import { readPublishedLegal } from "@/lib/legal";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { publicTurnstileConfig } from "@/lib/turnstile-config";
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

  return (
    <RegistrationSpread locale={locale} available={Boolean(terms && privacy)}
      title={copy.title} introduction={copy.subtitle} alreadyPartner={copy.alreadyPartner} signIn={copy.signIn}>
      {terms && privacy ? (
        <RegistrationForm locale={locale} copy={copy} botConfig={publicTurnstileConfig()}
          renderedAt={Date.now()} legalVersions={{
            terms: { id: terms.id, version: terms.version },
            privacy: { id: privacy.id, version: privacy.version },
          }} />
      ) : (
        <p role="status" className="registration-unavailable">{publicBrandCopy(locale).legalMissing}</p>
      )}
    </RegistrationSpread>
  );
}
