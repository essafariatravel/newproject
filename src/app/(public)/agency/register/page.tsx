import Link from "next/link";
import type { Metadata } from "next";
import RegistrationForm from "./registration-form";
import { registrationCopy, resolveLocale } from "@/lib/i18n";
import { getUiLocale, pickUiLocale } from "@/lib/ui-i18n";
import { readPublishedLegal } from "@/lib/legal";
import { publicBrandCopy } from "@/lib/public-brand-copy";
import { publicTurnstileConfig } from "@/lib/turnstile-config";
import { AuthAccessShell } from "@/components/auth-access-shell";
import { readBranding, brandLogoUrl } from "@/lib/branding";
import { contentT } from "@/lib/i18n-content";
export const dynamic = "force-dynamic";
export async function generateMetadata({searchParams}: {searchParams: Promise<Record<string,string|string[]|undefined>>}): Promise<Metadata> {
  const sp = await searchParams;
  return {title: registrationCopy(resolveLocale(pickUiLocale(sp.lang) ?? await getUiLocale())).metaTitle,robots:{index:false,follow:false}};
}
export default async function AgencyRegisterPage({searchParams}: {searchParams: Promise<Record<string,string|string[]|undefined>>}) {
  const sp = await searchParams;
  const locale = resolveLocale(pickUiLocale(sp.lang) ?? await getUiLocale());
  const copy = registrationCopy(locale);
  const ct = contentT(locale);
  const branding = await readBranding();
  const legal = await Promise.all([readPublishedLegal("terms",locale),readPublishedLegal("privacy",locale)]);
  return (
    <AuthAccessShell
      locale={locale}
      variant="register"
      brandName={branding.name}
      logoUrl={brandLogoUrl(branding)}
      title={copy.title}
      description={copy.subtitle}
      headingId="register-title"
      homeLabel={ct("Home")}
      alternateLink={{ href: "/login", label: copy.signIn }}
    >
      <p className="auth-access-partner-note">{copy.alreadyPartner} <Link href="/login">{copy.signIn}</Link></p>
      {legal.every(Boolean) ? (
        <RegistrationForm locale={locale} copy={copy} botConfig={publicTurnstileConfig()} renderedAt={Date.now()} legalVersions={{
          terms:{id:legal[0]!.id,version:legal[0]!.version},
          privacy:{id:legal[1]!.id,version:legal[1]!.version},
        }} />
      ) : <p role="status" className="auth-access-notice">{publicBrandCopy(locale).legalMissing}</p>}
    </AuthAccessShell>
  );
}
