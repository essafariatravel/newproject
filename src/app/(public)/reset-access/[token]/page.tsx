import { PublicAccessPage } from "@/components/public-documents/access-page";
import { getUiLocale } from "@/lib/ui-i18n";
import { identityT } from "@/lib/identity-copy";
import { resolveAccessToken } from "@/lib/account-recovery";
import { ResetAccessForm } from "./reset-form";
import { publicTurnstileConfig } from "@/lib/turnstile-config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set password", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function ResetAccessPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const locale = await getUiLocale(await searchParams);
  const t = identityT(locale);
  const account = await resolveAccessToken(token);
  return (
    <PublicAccessPage locale={locale} title={t("Set a new password")}>
      {account ? (
        <>
          <p className="access-intro">{t("Existing sessions will be signed out. Sign in with your new password.")}</p>
          <div className="access-identity">
            <strong dir="auto">{account.name}</strong>
            <bdi dir="ltr">{account.email}</bdi>
          </div>
          <ResetAccessForm token={token} locale={locale} botConfig={publicTurnstileConfig()} />
        </>
      ) : <p className="access-notice" role="alert">{t("This access link is invalid or has expired.")}</p>}
    </PublicAccessPage>
  );
}
