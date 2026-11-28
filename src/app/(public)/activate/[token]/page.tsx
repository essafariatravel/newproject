import type { Metadata } from "next";
import { PublicAccessPage } from "@/components/public-documents/access-page";
import ActivationForm from "./activation-form";
import { resolveActivation } from "@/lib/registrations";
import { registrationCopy, resolveLocale } from "@/lib/i18n";
import { publicTurnstileConfig } from "@/lib/turnstile-config";
import { getUiLocale, getUiLocaleFromSearch } from "@/lib/ui-i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Activate your account", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ActivateAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  let info = null;
  try {
    info = await resolveActivation(token);
  } catch {
    info = null;
  }
  const locale = getUiLocaleFromSearch(sp) ?? (info?.locale ? resolveLocale(info.locale) : await getUiLocale());
  const copy = registrationCopy(locale);

  return (
    <PublicAccessPage locale={locale} title={info ? copy.activation.title : copy.activation.invalidTitle}
      backLabel={copy.activation.backToLogin}>
      {info ? (
        <>
          <p className="access-intro">{copy.activation.subtitle}</p>
          <div className="access-identity">
            <strong dir="auto">{info.name}</strong>
            <bdi dir="ltr">{info.email}</bdi>
            {info.agencyName ? <span dir="auto">{info.agencyName}</span> : null}
          </div>
          <ActivationForm
            token={token}
            locale={locale}
            botConfig={publicTurnstileConfig()}
            copy={copy}
            showLabel={copy.activation.showPassword}
            hideLabel={copy.activation.hidePassword}
          />
        </>
      ) : <p role="status" className="access-notice">{copy.activation.invalidBody}</p>}
    </PublicAccessPage>
  );
}
