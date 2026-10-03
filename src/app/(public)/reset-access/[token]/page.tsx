import Link from "next/link";
import { getUiLocale } from "@/lib/ui-i18n";
import { identityT } from "@/lib/identity-copy";
import { resolveAccessToken } from "@/lib/account-recovery";
import { ResetAccessForm } from "./reset-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set password", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function ResetAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params, locale = await getUiLocale(), t = identityT(locale);
  const account = await resolveAccessToken(token);
  return <div className="mx-auto max-w-md px-4 py-16">
    <h1 className="font-serif text-3xl text-navy-900">{t("Set a new password")}</h1>
    {account ? <>
      <p className="mt-3 text-sm text-slate-500">{account.name} · <span dir="ltr">{account.username ?? account.email}</span></p>
      <p className="mt-2 text-sm text-slate-500">{t("Existing sessions will be signed out. Sign in with your new password.")}</p>
      <ResetAccessForm token={token} locale={locale} />
    </> : <p className="mt-4 text-sm text-red-700" role="alert">{t("This access link is invalid or has expired.")}</p>}
    <Link href="/login" className="mt-5 block text-sm text-iris-700 underline">{t("Back to sign in")}</Link>
  </div>;
}
