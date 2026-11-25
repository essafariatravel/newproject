import Link from "next/link";
import type { Metadata } from "next";
import { registrationCopy, resolveLocale } from "@/lib/i18n";
import { getUiLocale, pickUiLocale } from "@/lib/ui-i18n";
import { brandLogoUrl, readBranding } from "@/lib/branding";
import { seoLocalizedPublicPath } from "@/lib/seo-manifest";
import { registrationUi } from "../registration-ui";
import { ReceiptReference } from "./receipt-reference";
import "../registration-premium.css";

export const dynamic = "force-dynamic";

const REFERENCE_RE = /^AGR-\d{4}-[A-Z0-9]{6}$/;
type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { lang } = await searchParams;
  const locale = resolveLocale(pickUiLocale(lang) ?? await getUiLocale());
  return { title: registrationCopy(locale).success.kicker, robots: { index: false, follow: false } };
}

export default async function RegistrationSuccessPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const locale = resolveLocale(pickUiLocale(sp.lang) ?? await getUiLocale());
  const copy = registrationCopy(locale);
  const text = registrationUi[locale];
  const branding = await readBranding();
  const reference = typeof sp.ref === "string" && REFERENCE_RE.test(sp.ref) ? sp.ref : null;

  return (
    <section dir={copy.dir} lang={locale} className="public-front-page front-receipt" aria-labelledby="receipt-title">
      <div className="registration-spread-inner">
        <div className="receipt-intro">
          <h1 id="receipt-title">{copy.success.kicker}</h1>
          <p className="registration-intro-text">{copy.success.body}</p>
          <Link href={seoLocalizedPublicPath("home", locale)} className="registration-action">{copy.success.backHome}</Link>
          <p className="registration-access"><Link href={`/agency/register?lang=${locale}`}>{copy.title}</Link></p>
        </div>
        <section className="registration-receipt" aria-labelledby="receipt-document-title">
          <header className="receipt-head">
            <img src={brandLogoUrl(branding) ?? "/images/login/essafaria-horizontal.webp"}
              width="136" height="42" alt={branding.name} />
            <h2 id="receipt-document-title">{text.receipt}</h2>
          </header>
          {reference ? (
            <ReceiptReference reference={reference} label={copy.success.referenceLabel} locale={locale} />
          ) : <p className="receipt-no-reference">{copy.success.noReference}</p>}
          <h3 className="receipt-next">{copy.success.nextTitle}</h3>
          <ol className="receipt-steps">
            {copy.success.nextSteps.map(step => <li key={step}>{step}</li>)}
          </ol>
        </section>
      </div>
    </section>
  );
}
