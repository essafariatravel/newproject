import Link from "next/link";
import { getUiLocale } from "@/lib/ui-i18n";
import { identityT } from "@/lib/identity-copy";
import { RecoveryForm } from "./recovery-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account recovery", robots: { index: false, follow: false } };

export default async function ForgotPasswordPage() {
  const locale = await getUiLocale(), t = identityT(locale);
  return <div className="mx-auto max-w-md px-4 py-8">
    <h1 className="font-serif text-[32px] text-navy-900">{t("Recover account access")}</h1>
    <p className="mt-4 text-base text-slate-500">{t("Enter your agency username or your staff professional email.")}</p>
    <RecoveryForm locale={locale} />
    <Link href="/login" className="mt-6 block text-base text-iris-700 underline">{t("Back to sign in")}</Link>
  </div>;
}
