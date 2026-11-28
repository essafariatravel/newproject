import { PublicAccessPage } from "@/components/public-documents/access-page";
import { getUiLocale } from "@/lib/ui-i18n";
import { identityT } from "@/lib/identity-copy";
import { contentT } from "@/lib/i18n-content";
import { RecoveryForm } from "./recovery-form";
import { publicTurnstileConfig } from "@/lib/turnstile-config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account recovery", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await getUiLocale(await searchParams);
  const t = identityT(locale);
  return (
    <PublicAccessPage locale={locale} title={t("Recover account access")}>
      <p className="access-intro">{t("Sign in with your registered account email.")}</p>
      <RecoveryForm locale={locale} botConfig={publicTurnstileConfig()} pendingLabel={contentT(locale)("Submitting…")} />
    </PublicAccessPage>
  );
}
